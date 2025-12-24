import type { GraphData, Entity } from "../domain.js";
import type { PreparsedPaperContext } from "../preparsedContext.js";

/**
 * Generic pipeline step interface
 * All pipeline stages implement this for composability
 */
export interface IPipelineStep<TInput, TOutput> {
    name: string;
    process(input: TInput): Promise<TOutput>;
}

/**
 * Extraction stage interface
 * Extracts entities and relationships from document text
 */
export interface IExtractor {
    name: string;
    /**
     * Process raw document text and extract a knowledge graph
     * @param text - Raw text from the document
     * @param context - Optional preparsed metadata to improve extraction accuracy
     */
    process(text: string, context?: PreparsedPaperContext): Promise<GraphData>;
}

/**
 * Schema definition stage interface
 * Consolidates and refines entity/relationship types across the graph
 */
export interface IDefiner extends IPipelineStep<GraphData, GraphData> {
    /**
     * Analyze and consolidate schema across the graph
     */
    consolidateSchema(graph: GraphData): Promise<void>;
}

/**
 * Canonicalization stage interface
 * Resolves duplicate entities and normalizes the graph
 */
export interface ICanonicalizer extends IPipelineStep<GraphData, GraphData> {
    /**
     * Resolve and deduplicate entities
     * Returns canonical entity list with duplicates merged
     */
    resolveEntities(nodes: Entity[]): Promise<Entity[]>;
}
