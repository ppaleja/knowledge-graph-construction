import { createWorkflow } from "@llamaindex/workflow-core";
import {
  loadEvent,
  extractEvent,
  defineEvent,
  canonicalizeEvent,
  saveEvent,
  completeEvent,
  errorEvent,
} from "./events.js";
import { LlamaParseLoader } from "../../ingestion/loader.js";
import { Extractor } from "../extract/index.js";
import { Definer } from "../define/index.js";
import { Canonicalizer } from "../canonicalize/index.js";
import { DrizzleGraphStore } from "../../storage/drizzleStore.js";
import * as fs from "fs/promises";
import * as path from "path";
import type { GraphData } from "../../types/domain.js";

export function createEDCWorkflow() {
  const workflow = createWorkflow();

  async function ensureDebugDir() {
    const debugDir = path.resolve("debug");
    try {
      await fs.mkdir(debugDir, { recursive: true });
    } catch {
      // best-effort; ignore
    }
    return debugDir;
  }

  workflow.handle([loadEvent], async (context, event) => {
    const { sendEvent } = context;
    const { paperPath } = event.data;

    console.log("=== Starting EDC Pipeline ===");
    console.log(`[Load Handler] Loading paper: ${paperPath}`);

    try {
      const loader = new LlamaParseLoader();
      const text = await loader.load(paperPath);
      console.log(`[Load Handler] Loaded ${text.length} characters`);

      sendEvent(extractEvent.with({ text, paperPath }));
    } catch (error) {
      console.error(`[Load Handler] Error:`, error);
      sendEvent(
        errorEvent.with({
          stage: "load",
          error: (error as Error).message,
          paperPath,
        }),
      );
    }
  });

  workflow.handle([extractEvent], async (context, event) => {
    const { sendEvent } = context;
    const { text, paperPath } = event.data;

    console.log(`[Extract Handler] Processing text...`);

    try {
      const extractor = new Extractor();
      const rawGraph: GraphData = await extractor.process(text);

      const debugDir = await ensureDebugDir();
      await fs.writeFile(
        path.join(debugDir, "01_extraction.json"),
        JSON.stringify(rawGraph, null, 2),
      );

      console.log(
        `[Extract Handler] Extracted ${rawGraph.entities.length} entities, ${rawGraph.relationships.length} relationships`,
      );

      sendEvent(defineEvent.with({ graph: rawGraph, paperPath }));
    } catch (error) {
      console.error(`[Extract Handler] Error:`, error);
      sendEvent(
        errorEvent.with({
          stage: "extract",
          error: (error as Error).message,
          paperPath,
        }),
      );
    }
  });

  workflow.handle([defineEvent], async (context, event) => {
    const { sendEvent } = context;
    const { graph, paperPath } = event.data;

    console.log(
      `[Define Handler] Refining ${graph.entities.length} entities...`,
    );

    try {
      const definer = new Definer();
      const refinedGraph: GraphData = await definer.process(graph);

      const debugDir = await ensureDebugDir();
      await fs.writeFile(
        path.join(debugDir, "02_definition.json"),
        JSON.stringify(refinedGraph, null, 2),
      );

      console.log(`[Define Handler] Types refined`);

      sendEvent(
        canonicalizeEvent.with({
          graph: refinedGraph,
          paperPath,
        }),
      );
    } catch (error) {
      console.error(`[Define Handler] Error:`, error);
      sendEvent(
        errorEvent.with({
          stage: "define",
          error: (error as Error).message,
          paperPath,
        }),
      );
    }
  });

  workflow.handle([canonicalizeEvent], async (context, event) => {
    const { sendEvent } = context;
    const { graph, paperPath } = event.data;

    console.log(
      `[Canonicalize Handler] Resolving ${graph.entities.length} entities...`,
    );

    try {
      const canonicalizer = new Canonicalizer();
      const finalGraph: GraphData = await canonicalizer.process(graph);

      const debugDir = await ensureDebugDir();
      await fs.writeFile(
        path.join(debugDir, "03_canonicalization.json"),
        JSON.stringify(finalGraph, null, 2),
      );

      console.log(
        `[Canonicalize Handler] Reduced to ${finalGraph.entities.length} unique entities`,
      );

      sendEvent(saveEvent.with({ graph: finalGraph, paperPath }));
    } catch (error) {
      console.error(`[Canonicalize Handler] Error:`, error);
      sendEvent(
        errorEvent.with({
          stage: "canonicalize",
          error: (error as Error).message,
          paperPath,
        }),
      );
    }
  });

  workflow.handle([saveEvent], async (context, event) => {
    const { sendEvent } = context;
    const { graph, paperPath } = event.data;

    console.log(
      `[Save Handler] Persisting ${graph.entities.length} entities to database...`,
    );

    try {
      const store = new DrizzleGraphStore();
      await store.init();
      await store.saveGraph(graph);
      // Do not close connection here as it's shared
      // await store.close();

      console.log(`[Save Handler] Successfully saved to database`);

      sendEvent(
        completeEvent.with({
          success: true,
          paperPath,
          entitiesCount: graph.entities.length,
          relationshipsCount: graph.relationships.length,
        }),
      );
    } catch (error) {
      console.error(`[Save Handler] Error:`, error);
      sendEvent(
        errorEvent.with({
          stage: "save",
          error: (error as Error).message,
          paperPath,
        }),
      );
    }
  });

  workflow.handle([errorEvent], async (context, event) => {
    const { stage, error, paperPath } = event.data;
    console.error(
      `[Error Handler] Pipeline failed at ${stage} stage for ${paperPath}`,
    );
    console.error(`[Error Handler] Error: ${error}`);

    context.sendEvent(
      completeEvent.with({
        success: false,
        paperPath,
        entitiesCount: 0,
        relationshipsCount: 0,
      }),
    );
  });

  return workflow;
}
