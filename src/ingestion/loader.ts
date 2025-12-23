import * as fs from "fs/promises";
import * as path from "path";

export interface IPaperLoader {
    load(filePath: string): Promise<string>;
}

export class LlamaParseLoader implements IPaperLoader {
    private apiKey: string;
    private baseUrl = "https://api.cloud.llamaindex.ai/api/parsing";

    constructor() {
        this.apiKey = process.env.LLAMA_CLOUD_API_KEY || "";
        if (!this.apiKey) {
            console.warn("LLAMA_CLOUD_API_KEY is not set. LlamaParse might fail.");
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
            throw new Error("API Key missing, cannot parse without cache.");
        }

        // 1. Upload
        console.log("Uploading to LlamaParse...");
        const fileBuffer = await fs.readFile(filePath);
        const blob = new Blob([fileBuffer]);
        const formData = new FormData();
        formData.append("file", blob, path.basename(filePath));

        const uploadRes = await fetch(`${this.baseUrl}/upload`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: formData
        });

        if (!uploadRes.ok) {
            const err = await uploadRes.text();
            throw new Error(`Failed to upload file: ${uploadRes.statusText} - ${err}`);
        }

        const { id: jobId } = await uploadRes.json() as { id: string };
        console.log(`Job ID: ${jobId}. Waiting for completion...`);

        // 2. Poll for result
        let resultMarkdown = "";
        while (true) {
            await new Promise(r => setTimeout(r, 2000));
            const checkRes = await fetch(`${this.baseUrl}/job/${jobId}`, {
                headers: { "Authorization": `Bearer ${this.apiKey}` }
            });
            const statusData = await checkRes.json() as any;
            console.log("LlamaParse Job Status:", JSON.stringify(statusData, null, 2));

            if (statusData.status === "SUCCESS") {
                // Fetch the actual result
                const resultRes = await fetch(`${this.baseUrl}/job/${jobId}/result/markdown`, {
                    headers: { "Authorization": `Bearer ${this.apiKey}` }
                });
                const resultJson = await resultRes.json() as any;
                resultMarkdown = resultJson.markdown;
                break;
            } else if (statusData.status === "FAILED") {
                throw new Error("LlamaParse job failed.");
            }
            // PENDING/PARSING
        }

        await fs.writeFile(cachePath, resultMarkdown);
        return resultMarkdown;
    }
}
