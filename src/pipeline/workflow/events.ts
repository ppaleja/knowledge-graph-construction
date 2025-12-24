import { workflowEvent } from "@llamaindex/workflow-core";
import type { GraphData } from "#types/domain.js";
import type { PreparsedPaperContext } from "#types/preparsedContext.js";

/** Event fired to start the pipeline with a paper path */
export const loadEvent = workflowEvent<{ paperPath: string }>();

/** Event fired when paper is loaded and ready for preparsing */
export const preParsedEvent = workflowEvent<{
  text: string;
  paperPath: string;
  context: PreparsedPaperContext;
}>();

/** Event fired when paper text is loaded and preparsed, ready for entity extraction */
export const extractEvent = workflowEvent<{
  text: string;
  paperPath: string;
  context: PreparsedPaperContext;
}>();

/** Event fired when raw entities/relationships are extracted */
export const defineEvent = workflowEvent<{
  graph: GraphData;
  paperPath: string;
}>();

/** Event fired when types are refined and standardized */
export const canonicalizeEvent = workflowEvent<{
  graph: GraphData;
  paperPath: string;
}>();

/** Event fired when entities are deduplicated and final graph is ready */
export const saveEvent = workflowEvent<{
  graph: GraphData;
  paperPath: string;
}>();

/** Event fired when graph is persisted to database or pipeline completes */
export const completeEvent = workflowEvent<{
  success: boolean;
  paperPath: string;
  entitiesCount: number;
  relationshipsCount: number;
  finalGraph?: GraphData; // Optional: contains the processed graph for tool usage
  error?: string;
}>();

/** Event fired on any error in the pipeline */
export const errorEvent = workflowEvent<{
  stage: string;
  error: string;
  paperPath: string;
}>();
