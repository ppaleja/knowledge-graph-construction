import type { PreparsedPaperContext } from "#types/preparsedContext.js";
import { LlamaExtract } from "llama-cloud-services";
import { paperSchema } from "./paperSchema.js";
import { config } from "#config/index.js";

export class PreParser {
    name = "[PreParser]";
    private llamaExtract: LlamaExtract;

    constructor() {
        this.llamaExtract = new LlamaExtract(
            config.llamaCloud.apiKey,
            config.llamaCloud.baseUrl,
        );
    }

    async process(text: string): Promise<PreparsedPaperContext> {
        console.log(`[${this.name}] Processing paper (length: ${text.length})...`);

        const fileBuffer = Buffer.from(text);
        const extractedData = await this.llamaExtract.extract(
            paperSchema,
            {},
            undefined,
            fileBuffer,
        );

        const resultItem = Array.isArray(extractedData)
            ? extractedData[0]
            : extractedData;

        if (resultItem && "data" in resultItem) {
            const data = resultItem.data as PreparsedPaperContext;

            console.log(`[${this.name}] Extracted paper: "${data.title}"`);
            console.log(`[${this.name}] Authors: ${data.authors.length}`);
            console.log(`[${this.name}] Main findings: ${data.mainFindings.length}`);

            return data;
        }

        throw new Error("Failed to preparse paper - no data returned from LlamaExtract");
    }
}
