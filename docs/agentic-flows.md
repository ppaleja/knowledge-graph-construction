# Agentic Flows for Knowledge Graph Construction

This document defines the **end-to-end agentic flows** that the Central Controller should support. These flows inform what **tools** the orchestrator needs and what **inputs/outputs** each tool must provide.

---

## Primary Flow: Iterative Corpus Expansion

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER: "Build a KG about Gaussian Splatting with 50 papers"             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  AGENT REASONING LOOP                                                   │
│                                                                         │
│  Thought: I need to find papers about Gaussian Splatting                │
│  Action: searchPapers({query: "Gaussian Splatting", limit: 10})         │
│  Observation: Found 10 papers, top: "3D Gaussian Splatting" (6000 cites)│
│                                                                         │
│  Thought: I should download and process the most cited paper first      │
│  Action: downloadPaper({paperId: "abc123"})                             │
│  Observation: Downloaded to data/papers/corpus/3d_gaussian_splatting.pdf│
│                                                                         │
│  Action: processPaper({paperPath: "..."})                               │
│  Observation: Extracted 27 entities, 33 relationships. 0 merged, 27 new │
│                                                                         │
│  Thought: I should explore papers citing this one for related work      │
│  Action: getCitations({paperId: "abc123"})                              │
│  Observation: Found 50 citing papers                                    │
│                                                                         │
│  Thought: I'll process the top 5 citing papers next...                  │
│  [continues until maxPapers reached]                                    │
│                                                                         │
│  Thought: I've reached 50 papers, time to summarize                     │
│  Action: summarizeKG()                                                  │
│  Observation: 892 entities, 1204 relationships across 50 papers         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tool Definitions

### Paper Discovery (split from collector.ts)

| Tool | Input | Output | Current Status |
|------|-------|--------|----------------|
| `searchPapers` | `{query, limit}` | `{papers: [{id, title, citationCount}]}` | ✅ Implemented (OpenAlex) |
| `getCitations` | `{paperId, limit}` | `{papers: [...]}` | ✅ Implemented (OpenAlex) |
| `downloadPaper` | `{paperId}` | `{path: string}` | ✅ Implemented |

### 2. `processPaper`
**Purpose**: Full EDC pipeline + integration for a single paper  
**Input**: `{ paperPath: string }`  
**Output**: `{ entities: Entity[], relationships: Relationship[], stats: { merged: number, created: number } }`  
**Current Implementation**: edcWorkflow + integrationWorkflow  
**Status**: ✅ Implemented (Wraps workflow events)

### 3. `queryKnowledgeGraph`
**Purpose**: Ask questions about the current KG state  
**Input**: `{ query: string }` (e.g., "What papers improve on NeRF?")  
**Output**: `{ results: any[] }`  
**Current Implementation**: ❌ Does not exist  
**Status**: ✅ Implemented (Drizzle store extension)

### 4. `summarizeKnowledgeGraph`
**Purpose**: Generate a summary of what's in the KG  
**Input**: `{}`  
**Output**: `{ totalEntities: number, totalRelationships: number, topEntities: Entity[], summary: string }`  
**Current Implementation**: ❌ Does not exist  
**Status**: ✅ Implemented

---

## I/O Compatibility Analysis

### What Needs Refactoring

| Component | Current I/O | Required I/O | Effort |
|-----------|-------------|--------------|--------|
| `collectPapers()` | Returns `void` | Return `string[]` paths | Low |
| `edcWorkflow` | Emits events, saves to debug/ | Return `GraphData` | Medium |
| `integrationWorkflow` | Emits events | Return `{ merged, created }` | Medium |
| `DrizzleGraphStore` | No query method | Add `queryEntities()` | Medium |

### What Works As-Is

| Component | Current I/O | Notes |
|-----------|-------------|-------|
| `LlamaParseLoader.load()` | `(path) → string` | ✅ Perfect |
| `Extractor.process()` | `(text) → GraphData` | ✅ Perfect |
| `Definer.process()` | `(GraphData) → GraphData` | ✅ Perfect |
| `Canonicalizer.process()` | `(GraphData) → GraphData` | ✅ Perfect |
| `store.saveGraph()` | `(GraphData) → void` | ✅ Works |

---

## Alternative Flow: Citation Crawling

> **Note**: Current `collector.ts` searches by query, not citations. This flow would require enhancing the collector.

```
1. Start with seed paper (3D Gaussian Splatting)
2. processPaper(seedPaper)
3. Get citations of seed paper  ← NEW: collectCitations(paperId)
4. For each cited paper:
   - Download if available
   - processPaper(citedPaper)
5. Repeat until maxPapers or maxDepth reached
```

**Required New Functionality**:
- `collectCitations(paperId: string, limit: number)` - Semantic Scholar supports this

---

## Flow: Re-Integration Mode

For when new papers are added to an existing KG:

```
1. Check what papers are already processed
   → listProcessedPapers()
2. Find new papers in data/papers/corpus/
3. For each new paper:
   - processPaper(newPaper)
   - This will go through entity resolution against existing KG
```

---

## What the Agent Decides

The Central Controller agent should reason about:

1. **What papers to process next** - Prioritize by citation count? By relevance to entities already in KG?
2. **When to stop** - maxPapers reached? No more relevant papers?
3. **How to expand** - By query? By citations? By entity concepts?
4. **Quality checks** - Should it re-process papers that had low extraction quality?

This is where ReACT reasoning adds value over sequential workflows.

---

## Summary: Tools Needed

| Tool | Exists? | Status |
|------|---------|--------|
| `searchPapers` | ✅ | Done (OpenAlex) |
| `getCitations` | ✅ | Done (OpenAlex) |
| `downloadPaper` | ✅ | Done |
| `processPaper` | ✅ | Done |
| `queryKnowledgeGraph` | ✅ | Done |
| `summarizeKnowledgeGraph` | ✅ | Done |
