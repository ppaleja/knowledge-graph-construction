import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import axios from "axios";
import { config } from "#config/index.js";

const OPEN_ALEX_API = config.openAlex.apiUrl;
const DOWNLOAD_DIR = path.resolve(config.paths.downloadDir);

// Get email from env for OpenAlex "Polite Pool" (faster, higher limits)
const OPEN_ALEX_EMAIL = config.openAlex.email;

export interface PaperMetadata {
    paperId: string;
    title: string;
    citationCount: number;
    openAccessPdf: { url: string } | null;
    publicationDate?: string | undefined;
    abstract?: string | undefined;
}

interface OpenAlexWork {
    id: string;
    title: string;
    cited_by_count: number;
    publication_date: string;
    best_oa_location: {
        pdf_url: string | null;
        landing_page_url: string | null;
    } | null;
    abstract_inverted_index?: Record<string, number[]>;
}

// Helper to reconstruct abstract from inverted index if needed
function reconstructAbstract(invertedIndex?: Record<string, number[]>): string | undefined {
    if (!invertedIndex) return undefined;
    const words: string[] = [];
    Object.entries(invertedIndex).forEach(([word, positions]) => {
        positions.forEach(pos => words[pos] = word);
    });
    return words.join(" ");
}

/**
 * Convert OpenAlex Work object to our PaperMetadata interface
 */
function mapOpenAlexWorkToMetadata(work: OpenAlexWork): PaperMetadata {
    const cleanId = work.id.split("/").pop() || work.id;

    return {
        paperId: cleanId,
        title: work.title,
        citationCount: work.cited_by_count,
        openAccessPdf: work.best_oa_location?.pdf_url
            ? { url: work.best_oa_location.pdf_url }
            : null,
        publicationDate: work.publication_date,
        abstract: reconstructAbstract(work.abstract_inverted_index)
    };
}

/**
 * Helper: Search Arxiv API directly for a PDF
 */
async function searchArxiv(title: string): Promise<{ id: string, pdfUrl: string } | null> {
    try {
        // Construct query: ti:"Title String"
        // We use exact phrase search for better precision
        const query = `ti:"${title.replace(/"/g, '')}"`;

        const response = await axios.get("http://export.arxiv.org/api/query", {
            params: {
                search_query: query,
                start: 0,
                max_results: 1
            }
        });

        // Simple XML parsing with Regex (lightweight, no extra deps)
        const data = response.data;
        if (!data) return null;

        // Look for the first entry
        const entryMatch = data.match(/<entry>([\s\S]*?)<\/entry>/);
        if (!entryMatch) return null;

        const entryContent = entryMatch[1];

        // Extract ID
        const idMatch = entryContent.match(/<id>(.*?)<\/id>/);
        if (!idMatch) return null;
        const fullId = idMatch[1];
        const cleanId = fullId.split("/").pop() || fullId;

        // Extract PDF link
        const pdfLinkMatch = entryContent.match(/<link\s+title="pdf"\s+href="(.*?)"/);
        if (pdfLinkMatch) {
            return { id: cleanId, pdfUrl: pdfLinkMatch[1] };
        }

        // Fallback: try to construct PDF URL from ID if explict link missing (rare but possible)
        // Arxiv IDs are usually like 1234.5678 or math/1234567
        // Older IDs might need mapping, but typical new ones work with /pdf/ID.pdf
        return { id: cleanId, pdfUrl: `https://arxiv.org/pdf/${cleanId}.pdf` };

    } catch (error) {
        console.warn("Error searching Arxiv:", error instanceof Error ? error.message : String(error));
        return null;
    }
}

/**
 * Helper: Try to find a PDF on Arxiv if OpenAlex failed
 */
async function tryResolveArxivPdf(paper: PaperMetadata): Promise<PaperMetadata | null> {
    console.log(`⚠️  No PDF in OpenAlex for: "${paper.title}". Checking Arxiv...`);
    try {
        // Arxiv search can be sensitive to punctuation, so we clean it slightly
        const cleanTitle = paper.title.replace(/[:\-]/g, " ").trim();

        const result = await searchArxiv(cleanTitle);

        if (result) {
            console.log(`✅ Found on Arxiv: ${result.id}`);
            return {
                ...paper,
                openAccessPdf: { url: result.pdfUrl }
            };
        }
    } catch (err) {
        console.warn(`   Failed Arxiv lookup for "${paper.title}":`, err instanceof Error ? err.message : String(err));
    }

    console.log(`❌ Could not find PDF for "${paper.title}" on Arxiv.`);
    return null;
}

/**
 * TOOL: Search papers by query on OpenAlex (with Arxiv fallback)
 */
export async function searchPapers(
    query: string,
    limit: number = 10
): Promise<PaperMetadata[]> {
    console.log(`🔍 Searching OpenAlex for: "${query}" (limit: ${limit})`);

    // Remove sorting by citation count.
    // For specific queries (like a full title), we want RELEVANCE (default), not popularity.
    // Sorting by citations buries new papers (like 3DGS) under older ones (like Surfels).
    const params = {
        search: query,
        per_page: limit * 2,
        mailto: OPEN_ALEX_EMAIL
    };

    try {
        // Log the actual URL we are about to hit for verification
        console.log(`📡 Requesting: ${OPEN_ALEX_API}/works?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString()}`);

        const response = await axios.get(`${OPEN_ALEX_API}/works`, { params });

        const works: OpenAlexWork[] = response.data.results;
        const allPapers = works.map(mapOpenAlexWorkToMetadata);

        const finalPapers: PaperMetadata[] = [];

        // Identify papers needing fallback (no OpenAlex PDF)
        const papersWithPdf = allPapers.filter(p => p.openAccessPdf?.url);
        const papersMissingPdf = allPapers.filter(p => !p.openAccessPdf?.url);

        // Add already good papers
        finalPapers.push(...papersWithPdf);

        // Try to recover missing ones if we aren't at limit yet
        if (finalPapers.length < limit) {
            for (const p of papersMissingPdf) {
                if (finalPapers.length >= limit) break;
                const recovered = await tryResolveArxivPdf(p);
                if (recovered) {
                    finalPapers.push(recovered);
                }
            }
        }

        // We do NOT resort by citation count here either, because that would undo the relevance sort from the API.
        // We trust the API returned the most relevant results first.
        const sliced = finalPapers.slice(0, limit);

        console.log(`✅ Found ${sliced.length} papers (OpenAlex + Arxiv Fallback)`);
        return sliced;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`❌ OpenAlex Search Error: ${(error as any).message}`, (error as any).response?.data);
        } else {
            console.error(`❌ Failed to search papers:`, error);
        }
        return [];
    }
}

/**
 * TOOL: Get papers that cite a specific paper
 */
export async function getCitations(
    paperId: string,
    limit: number = 10
): Promise<PaperMetadata[]> {
    const cleanId = paperId.split("/").pop() || paperId;
    console.log(`🔗 Fetching citations for paper: ${cleanId} from OpenAlex`);

    try {
        const response = await axios.get(`${OPEN_ALEX_API}/works`, {
            params: {
                filter: `cites:${cleanId}`, // Removed restrictive OA filter to allow Arxiv fallback
                sort: "cited_by_count:desc",
                per_page: limit * 2, // Fetch more candidates since we might filter many out
                mailto: OPEN_ALEX_EMAIL
            },
        });

        const works: OpenAlexWork[] = response.data.results;
        const allPapers = works.map(mapOpenAlexWorkToMetadata);

        const finalPapers: PaperMetadata[] = [];

        // Strategy: First fill with known PDFs, then backfill with Arxiv
        const papersWithPdf = allPapers.filter(p => p.openAccessPdf?.url);
        finalPapers.push(...papersWithPdf);

        if (finalPapers.length < limit) {
            const papersMissingPdf = allPapers.filter(p => !p.openAccessPdf?.url);
            for (const p of papersMissingPdf) {
                if (finalPapers.length >= limit) break;
                const recovered = await tryResolveArxivPdf(p);
                if (recovered) {
                    finalPapers.push(recovered);
                }
            }
        }

        const sliced = finalPapers.slice(0, limit);
        console.log(`✅ Found ${sliced.length} citing papers with PDFs`);
        return sliced;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error(`❌ OpenAlex Citations Error: ${(error as any).message}`, (error as any).response?.data);
        } else {
            console.error(`❌ Failed to get citations:`, error);
        }
        return [];
    }
}

/**
 * TOOL: Download a specific paper by ID or metadata
 */
export async function downloadPaper(
    paper: PaperMetadata
): Promise<string | null> {
    await fs.mkdir(DOWNLOAD_DIR, { recursive: true });

    if (!paper.openAccessPdf?.url) {
        // Last ditch attempt if we somehow got here without a PDF URL
        console.log(`⚠️ No PDF URL for "${paper.title}". Attempting late Arxiv resolve...`);
        const resolved = await tryResolveArxivPdf(paper);
        if (resolved && resolved.openAccessPdf) {
            paper = resolved; // Update local reference
        } else {
            console.error(`❌ No PDF available for: ${paper.title}`);
            return null;
        }
    }

    // Sanitize filename
    const fileName = `${paper.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}.pdf`;
    const filePath = path.join(DOWNLOAD_DIR, fileName);

    // Check if already exists
    if (await fileExists(filePath)) {
        console.log(`⏩ Already exists: ${paper.title}`);
        return filePath;
    }

    console.log(`📥 Downloading: ${paper.title} (${paper.citationCount} citations)`);
    console.log(`   URL: ${paper.openAccessPdf?.url}`);

    try {
        if (!paper.openAccessPdf?.url) return null; // Should be caught above but TS check

        // If it's an Arxiv link, simple fetch.
        // If it's OpenAlex BEST_OA, can sometimes be tricky but axios usually handles redirects.
        const pdfRes = await axios.get(paper.openAccessPdf.url, {
            responseType: "arraybuffer",
            headers: {
                "User-Agent": `ResearchPaperCollector/1.0 (mailto:${OPEN_ALEX_EMAIL || "example@example.com"})`
            }
        });
        await fs.writeFile(filePath, pdfRes.data);
        console.log(`✅ Downloaded to: ${filePath}`);
        return filePath;
    } catch (err) {
        console.error(`❌ Failed to download from ${paper.openAccessPdf?.url}:`, (err as Error).message);
        return null;
    }
}

/**
 * Convenience function: Search + Download (for backward compatibility)
 */
export async function collectPapers(
    query: string = "Gaussian Splatting",
    limit: number = 5
): Promise<string[]> {
    console.log(`🚀 Collecting ${limit} papers for: "${query}" via OpenAlex`);

    const papers = await searchPapers(query, limit);
    const downloadedPaths: string[] = [];

    for (const paper of papers) {
        const path = await downloadPaper(paper);
        if (path) {
            downloadedPaths.push(path);
        }
    }

    console.log(`\n✅ Collection complete! Downloaded ${downloadedPaths.length} papers`);
    return downloadedPaths;
}

async function fileExists(path: string) {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}

// CLI usage
if (import.meta.url.startsWith("file:")) {
    const modulePath = new URL(import.meta.url).pathname;
    if (
        process.argv[1] === modulePath ||
        process.argv[1]?.endsWith("collector.ts")
    ) {
        const args = process.argv.slice(2);
        const query = args.filter((arg) => !arg.startsWith("--")).join(" ") || "Gaussian Splatting";
        const limitArg = args.find((arg) => arg.startsWith("--limit="));
        const limit = limitArg ? parseInt(limitArg.split("=")[1] || "5", 10) : 5;

        if (isNaN(limit)) {
            console.error('Usage: npm run collect [query] [--limit=N]');
            console.error('Example: npm run collect "NeRF" --limit=10');
            process.exit(1);
        }

        collectPapers(query, limit).catch(console.error);
    }
}