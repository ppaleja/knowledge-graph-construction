import * as fs from "fs/promises";
import * as path from "path";
import { PDFParse } from "pdf-parse";
import { withRetry } from "../utils/resilience.js"; // Note: .js extension for ESM

export interface IPaperLoader {
    load(filePath: string): Promise<string>;
}

export class LocalPdfLoader implements IPaperLoader {
    async load(filePath: string): Promise<string> {
        console.log(`[LocalPdfLoader] Parsing locally: ${path.basename(filePath)}`);
        const buffer = await fs.readFile(filePath);
        // Using new PDFParse class from v2.4.5 fork
        const parser = new PDFParse({ data: buffer });
        const result = await parser.getText();
        return result.text;
    }
}

export class LlamaParseLoader implements IPaperLoader {
    private apiKey: string;
    private baseUrl = "https://api.cloud.llamaindex.ai/api/parsing";
    private localFallback: LocalPdfLoader;

    constructor() {
        this.apiKey = process.env.LLAMA_CLOUD_API_KEY || "";
        this.localFallback = new LocalPdfLoader();

        if (!this.apiKey) {
            console.warn("LLAMA_CLOUD_API_KEY is not set. Will default to logical fallback if needed.");
        }
    }

    async load(filePath: string): Promise<string> {
        console.log(`Loading paper from ${filePath}...`);

        // Check cache
        const cachePath = `${filePath}.md`;
        try {
            await fs.access(cachePath);
            const cached = await fs.readFile(cachePath, "utf-8");
            console.log("Found cached markdown, returning...");
            return cached;
        } catch (e) {
            // ignore
        }

        if (!this.apiKey) {
            console.warn("API Key missing, using local fallback.");
            return this.localFallback.load(filePath);
        }

        console.log(`Uploading to LlamaParse...`);

        try {
            // We wrap the entire process (upload + poll) in logic that handles 402 explicitly.
            // The polling itself could also be retried, but for simplicity, we'll implement 
            // the core flow and let the Caller (Workflow) handle generic retries if appropriate,
            // or we handle specific API errors here.

            // Note: We are choosing NOT to use `withRetry` for the whole massive PDF upload/poll 
            // sequence because it can take minutes. Instead, we want to catch fast failures.

            const resultMarkdown = await this.uploadAndPoll(filePath);

            await fs.writeFile(cachePath, resultMarkdown);
            return resultMarkdown;

        } catch (error: any) {
            // Check for Quota/Payment errors
            if (error.message?.includes("Payment Required") || error.message?.includes("402")) {
                console.warn(`[LlamaParse] Quota exceeded (402). Falling back to local/pdf-parse.`);
                const text = await this.localFallback.load(filePath);
                // Cache local result too so we don't re-parse
                await fs.writeFile(cachePath, text);
                return text;
            }

            // Propagate other errors (5xx, network) so higher level can decide or halt
            throw error;
        }
    }

    private async uploadAndPoll(filePath: string): Promise<string> {
        // 1. Upload
        const fileBuffer = await fs.readFile(filePath);
        const blob = new Blob([fileBuffer]);
        const formData = new FormData();
        formData.append("file", blob, path.basename(filePath));

        const uploadRes = await withRetry(async () => fetch(`${this.baseUrl}/upload`, {
            method: "POST",
            headers: { "Authorization": `Bearer ${this.apiKey}` },
            body: formData
        }), { name: "LlamaParse.upload" });

        if (!uploadRes.ok) {
            const err = await uploadRes.text();
            throw new Error(`Failed to upload file: ${uploadRes.statusText} - ${err}`);
        }

        const { id: jobId } = await uploadRes.json() as { id: string };
        console.log(`Job ID: ${jobId}. Waiting for completion...`);

        // 2. Poll
        // Polling loop isn't suitable for `withRetry` directly, custom logic:
        while (true) {
            await new Promise(r => setTimeout(r, 2000));

            // Transient network errors in polling should be retried
            const checkRes = await withRetry(async () => fetch(`${this.baseUrl}/job/${jobId}`, {
                headers: { "Authorization": `Bearer ${this.apiKey}` }
            }), { name: "LlamaParse.poll", retries: 3 });

            const statusData = await checkRes.json() as any;

            // Don't spam logs with "PENDING"
            if (statusData.status !== "PENDING" && statusData.status !== "PARSING") {
                console.log("LlamaParse Job Status:", statusData.status);
            }

            if (statusData.status === "SUCCESS") {
                const resultRes = await withRetry(async () => fetch(`${this.baseUrl}/job/${jobId}/result/markdown`, {
                    headers: { "Authorization": `Bearer ${this.apiKey}` }
                }), { name: "LlamaParse.result" });

                const resultJson = await resultRes.json() as any;
                return resultJson.markdown;

            } else if (statusData.status === "FAILED") {
                throw new Error(`LlamaParse job failed: ${statusData.error_message || "Unknown error"}`);
            }
        }
    }
}
