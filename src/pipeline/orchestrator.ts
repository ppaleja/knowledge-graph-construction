
import type { IPaperLoader } from "../ingestion/loader.js";
import { LlamaParseLoader } from "../ingestion/loader.js";
import type { IExtractor, IDefiner, ICanonicalizer, GraphData, Entity, Relationship } from "../types/domain.js";
import { Extractor } from "./extract/index.js";
import { Definer } from "./define/index.js";
import { Canonicalizer } from "./canonicalize/index.js";
import type { IGraphStore } from "../storage/drizzleStore.js";
import { DrizzleGraphStore } from "../storage/drizzleStore.js";
import * as fs from "fs/promises";
import * as path from "path";

export class PipelineOrchestrator {
    private loader: IPaperLoader;
    private extractor: IExtractor;
    private definer: IDefiner;
    private canonicalizer: ICanonicalizer;
    private storage: DrizzleGraphStore; // Use concrete class to access init()

    constructor() {
        this.loader = new LlamaParseLoader();
        this.extractor = new Extractor();
        this.definer = new Definer();
        this.canonicalizer = new Canonicalizer();
        this.storage = new DrizzleGraphStore();
    }

    async run(paperPath: string): Promise<void> {
        console.log("=== Starting EDC Pipeline ===");

        // Ensure debug dir
        const debugDir = path.resolve("debug");
        try { await fs.mkdir(debugDir, { recursive: true }); } catch { }

        // 0. Init DB
        await this.storage.init();

        // 1. Ingest
        const text = await this.loader.load(paperPath);
        console.log("Ingestion Complete.");

        // 2. Extract (Dream)
        const rawGraph = await this.extractor.process(text);
        await fs.writeFile(path.join(debugDir, "01_extraction.json"), JSON.stringify(rawGraph, null, 2));

        // 3. Define (Architect)
        const structuredGraph = await this.definer.process(rawGraph);
        await fs.writeFile(path.join(debugDir, "02_definition.json"), JSON.stringify(structuredGraph, null, 2));

        // 4. Canonicalize (Librarian)
        const finalGraph = await this.canonicalizer.process(structuredGraph);
        await fs.writeFile(path.join(debugDir, "03_canonicalization.json"), JSON.stringify(finalGraph, null, 2));

        // 5. Save
        await this.storage.saveGraph(finalGraph);
        console.log("=== Pipeline Complete ===");

        await this.storage.close();
    }
}
