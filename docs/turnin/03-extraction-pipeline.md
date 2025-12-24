# Extraction Pipeline (EDC Workflow)

The EDC (Extract → Define → Canonicalize) pipeline transforms raw PDFs into structured knowledge graphs. Inspired by https://arxiv.org/pdf/2404.03868.

See [07-design-rationale.md](./07-design-rationale.md) for why this pattern was chosen.

## Pipeline Stages

1. **Load**: Parse PDF to markdown text (LlamaParse)
2. **Pre-Parse**: Extract structured metadata (LlamaExtract) - *inspired by KARMA*
3. **Extract**: Identify entities and relationships (LLM)
4. **Define**: Refine types and definitions (LLM)
5. **Canonicalize**: Deduplicate within document
6. **Save**: Persist to database

## Workflow Diagram

```mermaid
graph TD
    Start([loadEvent]) --> Load
    
    subgraph Load [Step 1: Load]
        L1[Receive Paper Path] --> L2[LlamaParseLoader]
        L2 --> L3[Parse to Markdown]
        L3 --> L4[Emit preParsedEvent]
    end
    
    Load --> PreParse
    
    subgraph PreParse [Step 2: Pre-Parse]
        P1[Receive Text] --> P2[PreParser]
        P2 --> P3[LlamaExtract Metadata]
        P3 --> P4[Generate PaperContext]
        P4 --> P5[Save 00_preparsed.json]
        P5 --> P6[Emit extractEvent]
    end
    
    PreParse --> Extract
    
    subgraph Extract [Step 3: Extract]
        E1[Receive Text + Context] --> E2[Extractor]
        E2 --> E3[Extract Entities]
        E3 --> E4[Extract Relationships]
        E4 --> E5[Generate Raw Graph]
        E5 --> E6[Save 01_extraction.json]
        E6 --> E7[Emit defineEvent]
    end
    
    Extract --> Define
    
    subgraph Define [Step 4: Define]
        D1[Receive Raw Graph] --> D2[Definer]
        D2 --> D3[Refine Types]
        D3 --> D4[Generate Refined Graph]
        D4 --> D5[Save 02_definition.json]
        D5 --> D6[Emit canonicalizeEvent]
    end
    
    Define --> Canon
    
    subgraph Canon [Step 5: Canonicalize]
        C1[Receive Refined Graph] --> C2[Canonicalizer]
        C2 --> C3[Intra-doc Deduplication]
        C3 --> C4[Generate Final Graph]
        C4 --> C5[Save 03_canonicalization.json]
        C5 --> C6[Emit saveEvent]
    end
    
    Canon --> Save
    
    subgraph Save [Step 6: Persist]
        S1[Receive Final Graph] --> S2[DrizzleGraphStore]
        S2 --> S3[Save to DB]
        S3 --> S4[Emit completeEvent]
    end
    
    Save --> End([Success])
```

## Stage Details

### Pre-Parse (optional - KARMA-inspired)
Extracts structured metadata before entity extraction to focus the model:
- Title, authors, abstract
- Publication venue, year
- Key contributions

Saves `debug/00_preparsed.json`. Context passed to Extractor as `PaperContext`.

### Extract (KARMA-inspired two-stage pattern)
- **Stage 1**: Entity Extraction - Identify entities FIRST
- **Stage 2**: Relationship Extraction - Extract relationships between identified entities

This separation reduces hallucinations and improves accuracy.

### Define
Type refinement and definition consistency using LLM.

### Canonicalize
Resolves duplicates *within* the single document scope (e.g., merging "Caffeine" and "1,3,7-Trimethylxanthine" if they refer to the same concept).

Integration workflow handles *cross-document* deduplication. See [04-integration-pipeline.md](./04-integration-pipeline.md).

## Debug Artifacts

All intermediate outputs saved to `debug/` for inspection:

(Referenced in [02-agent-implementation.md](./02-agent-implementation.md) for agent observability)
- `00_preparsed.json` - Structured metadata
- `01_extraction.json` - Raw entities/relationships
- `02_definition.json` - Refined types
- `03_canonicalization.json` - Final graph before integration
