import { tool } from "llamaindex";
import { z } from "zod";
import {
    searchPapers,
    getCitations,
    downloadPaper,
    type PaperMetadata,
} from "#ingestion/collector.js";

/**
 * TOOL: Search for papers by query
 */
export const searchPapersTool = tool({
    name: "searchPapers",
    description:
        "Search for academic papers on Semantic Scholar by query. Returns paper metadata including IDs, titles, and citation counts. Papers are sorted by citation count (most cited first).",
    parameters: z.object({
        query: z
            .string()
            .describe('Search query (e.g., "Gaussian Splatting", "NeRF")'),
        limit: z
            .number()
            .default(10)
            .describe("Maximum number of papers to return"),
    }),
    execute: async ({ query, limit }) => {
        const papers = await searchPapers(query, limit);
        return {
            papers: papers.map((p) => ({
                id: p.paperId,
                title: p.title,
                citationCount: p.citationCount,
            })),
            count: papers.length,
        };
    },
});

/**
 * TOOL: Get papers that cite a specific paper
 */
export const getCitationsTool = tool({
    name: "getCitations",
    description:
        "Get papers that cite a specific paper. Useful for expanding the knowledge graph by following citation networks.",
    parameters: z.object({
        paperId: z.string().describe("Semantic Scholar paper ID"),
        limit: z.number().default(10).describe("Maximum number of citations to return"),
    }),
    execute: async ({ paperId, limit }) => {
        const citingPapers = await getCitations(paperId, limit);
        return {
            citations: citingPapers.map((p) => ({
                id: p.paperId,
                title: p.title,
                citationCount: p.citationCount,
            })),
            count: citingPapers.length,
        };
    },
});

/**
 * TOOL: Download a specific paper
 */
export const downloadPaperTool = tool({
    name: "downloadPaper",
    description:
        "Download a specific paper's PDF by its Semantic Scholar ID. Returns the file path where the paper was saved.",
    parameters: z.object({
        paperId: z.string().describe("Semantic Scholar paper ID"),
        title: z.string().describe("Paper title"),
        citationCount: z.number().default(0).describe("Number of citations"),
    }),
    execute: async ({ paperId, title, citationCount }) => {
        // For now, search by title to get full metadata
        const papers = await searchPapers(title, 1);
        const paperMetadata: PaperMetadata = papers[0] || {
            paperId,
            title,
            citationCount,
            openAccessPdf: null,
        };

        const filePath = await downloadPaper(paperMetadata);
        return {
            success: filePath !== null,
            path: filePath || "",
        };
    },
});
