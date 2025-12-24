# Phase 3: Implement Quality Checking and Retry Loops

## Overview

Add intelligent quality assessment and iterative refinement to the workflow. This phase leverages the state management from Phase 2 to implement loops that can re-extract or refine data when quality thresholds aren't met.

## Goals

- ✅ Implement quality assessment for each pipeline stage
- ✅ Add retry logic with improvement hints
- ✅ Create loop patterns for iterative refinement
- ✅ Prevent infinite loops with max attempt limits
- ✅ Track quality metrics in state
- ✅ Enable graceful degradation when quality can't be improved

## Current State (Post Phase 2)

```
Stateful Event-Driven Workflow
  ↓
LoadEvent → ExtractEvent → DefineEvent → CanonicalizeEvent → SaveEvent → CompleteEvent
  |            |              |                |                 |           |
Handler      Handler        Handler          Handler          Handler    (Done)
(updates    (updates       (updates         (updates         (updates
 state)      state)         state)           state)           state)

❌ No quality checks
❌ No retry/refinement loops
❌ Accept any output regardless of quality
❌ No iterative improvement
```

## Target Architecture

```
Stateful Event-Driven Workflow with Quality Loops
  ↓
LoadEvent → ExtractEvent → [Quality Check] → DefineEvent → [Quality Check] → CanonicalizeEvent → SaveEvent → CompleteEvent
               ↓              ↑                  ↓              ↑
               └── Low Quality? ─────────────────┘              │
                   (retry with hints)                           │
                                                                 │
                   └── Type Quality Low? ────────────────────────┘
                       (retry refinement)
```

## Implementation Steps

### Step 1: Define Quality Assessment Functions

**File**: `src/pipeline/workflow/qualityAssessment.ts`

```typescript
import type { GraphData, Entity } #types/domain.js";

/**
 * Quality scores for different aspects of extraction
 */
export interface QualityScores {
  entityCount: number;        // 0-1: Are there enough entities?
  entitySpecificity: number;  // 0-1: Are entity names specific?
  typeDistribution: number;   // 0-1: Is there good type diversity?
  relationshipRatio: number;  // 0-1: Are there enough relationships?
  descriptionCompleteness: number; // 0-1: How many entities have descriptions?
  overall: number;            // 0-1: Weighted average
}

/**
 * Assessment configuration
 */
export interface QualityConfig {
  minOverallScore: number;       // Minimum acceptable overall score
  minEntityCount: number;        // Minimum number of entities
  maxGenericTypeRatio: number;   // Max ratio of "Concept" types
  minRelationshipRatio: number;  // Min relationships per entity
  minDescriptionRatio: number;   // Min entities with descriptions
}

export const DEFAULT_QUALITY_CONFIG: QualityConfig = {
  minOverallScore: 0.6,
  minEntityCount: 10,
  maxGenericTypeRatio: 0.3,
  minRelationshipRatio: 0.5,
  minDescriptionRatio: 0.4,
};

/**
 * Assess the quality of extracted graph data
 */
export class QualityAssessor {
  constructor(private config: QualityConfig = DEFAULT_QUALITY_CONFIG) {}

  /**
   * Perform full quality assessment
   */
  assess(graph: GraphData): QualityScores {
    const entityCountScore = this.assessEntityCount(graph);
    const specificityScore = this.assessEntitySpecificity(graph);
    const typeDistributionScore = this.assessTypeDistribution(graph);
    const relationshipScore = this.assessRelationshipRatio(graph);
    const descriptionScore = this.assessDescriptionCompleteness(graph);

    // Weighted average (adjust weights as needed)
    const overall = (
      entityCountScore * 0.2 +
      specificityScore * 0.25 +
      typeDistributionScore * 0.2 +
      relationshipScore * 0.2 +
      descriptionScore * 0.15
    );

    return {
      entityCount: entityCountScore,
      entitySpecificity: specificityScore,
      typeDistribution: typeDistributionScore,
      relationshipRatio: relationshipScore,
      descriptionCompleteness: descriptionScore,
      overall,
    };
  }

  /**
   * Check if graph meets quality threshold
   */
  meetsThreshold(scores: QualityScores): boolean {
    return scores.overall >= this.config.minOverallScore;
  }

  /**
   * Generate improvement hints based on quality gaps
   */
  generateHints(scores: QualityScores): string[] {
    const hints: string[] = [];

    if (scores.entityCount < 0.7) {
      hints.push("Extract more entities - look for methods, datasets, and metrics mentioned in the paper");
    }

    if (scores.entitySpecificity < 0.7) {
      hints.push("Use specific names instead of generic terms like 'our method' or 'this approach'");
      hints.push("Include abbreviations and full names (e.g., '3DGS' and '3D Gaussian Splatting')");
    }

    if (scores.typeDistribution < 0.7) {
      hints.push("Avoid overusing the 'Concept' type - be more specific with Method, Metric, Dataset, Task");
    }

    if (scores.relationshipRatio < 0.7) {
      hints.push("Extract more relationships between entities - look for 'improves_on', 'uses', 'evaluated_on'");
      hints.push("Include relationships that are implied by context, not just explicitly stated");
    }

    if (scores.descriptionCompleteness < 0.7) {
      hints.push("Add descriptions to entities explaining their role and context in the paper");
    }

    return hints;
  }

  /**
   * Assess entity count relative to text length
   */
  private assessEntityCount(graph: GraphData): number {
    const count = graph.entities.length;
    
    if (count >= 50) return 1.0;
    if (count >= this.config.minEntityCount) return 0.7 + (count - this.config.minEntityCount) / 40 * 0.3;
    return count / this.config.minEntityCount * 0.7;
  }

  /**
   * Assess how specific entity names are (vs generic)
   */
  private assessEntitySpecificity(graph: GraphData): number {
    if (graph.entities.length === 0) return 0;

    const genericPatterns = [
      /^(our|this|the|a|an)\s+(method|approach|model|system|technique)/i,
      /^(method|model|approach|system)$/i,
      /^(it|they|we)$/i,
    ];

    const genericCount = graph.entities.filter(entity => 
      genericPatterns.some(pattern => pattern.test(entity.name))
    ).length;

    const specificRatio = 1 - (genericCount / graph.entities.length);
    return Math.max(specificRatio, 0);
  }

  /**
   * Assess diversity of entity types
   */
  private assessTypeDistribution(graph: GraphData): number {
    if (graph.entities.length === 0) return 0;

    const typeCounts = new Map<string, number>();
    graph.entities.forEach(entity => {
      typeCounts.set(entity.type, (typeCounts.get(entity.type) || 0) + 1);
    });

    // Check for over-reliance on "Concept" type
    const conceptRatio = (typeCounts.get("Concept") || 0) / graph.entities.length;
    if (conceptRatio > this.config.maxGenericTypeRatio) {
      return 1 - conceptRatio;
    }

    // Reward diversity (entropy-based)
    const typeCount = typeCounts.size;
    const diversityScore = Math.min(typeCount / 5, 1.0); // 5+ types is ideal

    return diversityScore;
  }

  /**
   * Assess relationship to entity ratio
   */
  private assessRelationshipRatio(graph: GraphData): number {
    if (graph.entities.length === 0) return 0;

    const ratio = graph.relationships.length / graph.entities.length;
    
    if (ratio >= this.config.minRelationshipRatio * 2) return 1.0;
    if (ratio >= this.config.minRelationshipRatio) {
      return 0.7 + (ratio - this.config.minRelationshipRatio) / this.config.minRelationshipRatio * 0.3;
    }
    return ratio / this.config.minRelationshipRatio * 0.7;
  }

  /**
   * Assess how many entities have descriptions
   */
  private assessDescriptionCompleteness(graph: GraphData): number {
    if (graph.entities.length === 0) return 0;

    const withDescription = graph.entities.filter(e => 
      e.description && e.description.trim().length > 0
    ).length;

    const ratio = withDescription / graph.entities.length;
    
    if (ratio >= this.config.minDescriptionRatio) return 1.0;
    return ratio / this.config.minDescriptionRatio;
  }
}
```

### Step 2: Update Extraction Handler with Quality Loop

**File**: `src/pipeline/workflow/edcWorkflow.ts` (Update Extract Handler)

```typescript
// ============================================
// HANDLER 2: Extract Entities & Relationships (WITH QUALITY LOOP)
// ============================================
workflow.handle([extractEvent], async (context, event) => {
  const { sendEvent, state } = context;
  const { text, paperPath, qualityHints } = event.data; // qualityHints added

  console.log(`[Extract Handler] Processing text (attempt ${state.attempts.extraction + 1})...`);
  
  if (qualityHints && qualityHints.length > 0) {
    console.log(`[Extract Handler] Improvement hints:`);
    qualityHints.forEach((hint, i) => console.log(`   ${i + 1}. ${hint}`));
  }
  
  const extractStartTime = Date.now();
  state.attempts.extraction += 1;

  try {
    const extractor = new Extractor();
    
    // Pass hints to extractor if provided
    const rawGraph = qualityHints 
      ? await extractor.processWithHints(text, qualityHints)
      : await extractor.process(text);

    // Update state
    state.extractTime = Date.now() - extractStartTime;
    state.intermediateOutputs.extraction = rawGraph;
    state.metrics.rawEntityCount = rawGraph.entities.length;
    state.metrics.rawRelationshipCount = rawGraph.relationships.length;

    // QUALITY ASSESSMENT
    const assessor = new QualityAssessor();
    const qualityScores = assessor.assess(rawGraph);
    state.qualityScores.extractionQuality = qualityScores.overall;

    console.log(`[Extract Handler] Quality Score: ${(qualityScores.overall * 100).toFixed(1)}%`);

    // Save debug output with quality info
    const debugDir = path.resolve("debug");
    await fs.mkdir(debugDir, { recursive: true });
    await fs.writeFile(
      path.join(debugDir, `01_extraction_attempt_${state.attempts.extraction}.json`),
      JSON.stringify({
        graph: rawGraph,
        qualityScores,
        metadata: {
          extractTime: state.extractTime,
          attempt: state.attempts.extraction,
          textLength: state.metrics.textLength,
        }
      }, null, 2)
    );

    // QUALITY DECISION: Should we retry?
    const maxAttempts = 3;
    const meetsQuality = assessor.meetsThreshold(qualityScores);

    if (!meetsQuality && state.attempts.extraction < maxAttempts) {
      console.log(`[Extract Handler] ⚠️  Quality below threshold, retrying...`);
      
      // Generate hints for next attempt
      const hints = assessor.generateHints(qualityScores);
      
      // LOOP BACK to extraction with hints
      sendEvent(extractEvent.with({ 
        text, 
        paperPath, 
        qualityHints: hints 
      }));
    } else {
      if (!meetsQuality) {
        console.log(`[Extract Handler] ⚠️  Max attempts reached, proceeding with current quality`);
      }
      
      console.log(`[Extract Handler] Extracted ${rawGraph.entities.length} entities, ${rawGraph.relationships.length} relationships in ${state.extractTime}ms`);

      // Proceed to definition
      sendEvent(defineEvent.with({ graph: rawGraph, paperPath }));
    }
  } catch (error) {
    state.errors.push({
      stage: "extract",
      message: (error as Error).message,
      timestamp: Date.now(),
    });
    
    console.error(`[Extract Handler] Error:`, error);
    sendEvent(errorEvent.with({
      stage: "extract",
      error: (error as Error).message,
      paperPath,
    }));
  }
});
```

### Step 3: Update Event Definitions to Support Hints

**File**: `src/pipeline/workflow/events.ts` (Update)

```typescript
import { workflowEvent } from "@llamaindex/workflow-core";
import type { GraphData } #types/domain.js";

// ... existing events ...

// UPDATED: ExtractEvent now includes optional quality hints
export const extractEvent = workflowEvent<{ 
  text: string;
  paperPath: string;
  qualityHints?: string[]; // Added for quality loop
}>();

// UPDATED: DefineEvent includes optional refinement hints
export const defineEvent = workflowEvent<{ 
  graph: GraphData;
  paperPath: string;
  refinementHints?: string[]; // Added for refinement loop
}>();

// ... rest of events ...
```

### Step 4: Enhance Extractor to Accept Hints

**File**: `src/pipeline/extract/index.ts` (Add method)

```typescript
export class Extractor implements IExtractor {
    name = "The Dreamer";

    // Existing process method
    async process(text: string): Promise<GraphData> {
        // ... existing implementation ...
    }

    // NEW: Process with quality improvement hints
    async processWithHints(text: string, hints: string[]): Promise<GraphData> {
        console.log(`[${this.name}] Processing with ${hints.length} improvement hints...`);

        const llm = Settings.llm;
        
        // Augment the prompt with hints
        const hintsSection = hints.length > 0 
            ? `\n\nIMPORTANT IMPROVEMENTS NEEDED:\n${hints.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n`
            : '';
        
        const formattedPrompt = EXTRACT_PROMPT.format({ text: text }) + hintsSection;

        // Use same extraction logic as process()
        try {
            if (typeof (llm as any).exec === 'function') {
                console.log(`[${this.name}] Using llm.exec with structured output...`);
                const { object } = await (llm as any).exec({
                    messages: [
                        { role: "user", content: formattedPrompt }
                    ],
                    responseFormat: GraphDataSchema
                });
                console.log(`[${this.name}] Extracted ${object.entities?.length || 0} entities and ${object.relationships?.length || 0} relationships.`);
                return object as unknown as GraphData;
            }
        } catch (execError) {
            console.warn(`[${this.name}] llm.exec failed, falling back to regular chat:`, (execError as Error).message);
        }

        // Fallback to chat-based parsing
        const response = await llm.chat({
            messages: [
                { role: "user", content: formattedPrompt + "\n\nRespond with valid JSON only." }
            ],
        });

        // ... same JSON parsing logic as process() ...
        const rawOutput = response.message.content;
        let jsonData: any;

        if (typeof rawOutput === 'string') {
            const jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)\s*```/) || rawOutput.match(/```\s*([\s\S]*?)\s*```/);
            const jsonStr = (jsonMatch && jsonMatch[1]) ? jsonMatch[1].trim() : rawOutput.trim();
            try {
                jsonData = JSON.parse(jsonStr);
            } catch (e) {
                console.error(`[${this.name}] JSON Parse Error. Raw output:`, rawOutput.substring(0, 500));
                return { entities: [], relationships: [] };
            }
        } else {
            jsonData = rawOutput;
        }

        if (jsonData) {
            const extractedEntities = Array.isArray(jsonData.entities) ? jsonData.entities :
                Array.isArray(jsonData.nodes) ? jsonData.nodes : [];
            const extractedRelationships = Array.isArray(jsonData.relationships) ? jsonData.relationships :
                Array.isArray(jsonData.edges) ? jsonData.edges : [];

            const validEntities = extractedEntities.map((n: any) => ({
                id: n.id || n.name,
                name: n.name || n.id,
                type: n.type || "Concept",
                description: n.description || "",
                metadata: n.metadata
            })).filter((n: any) => n.name && typeof n.name === 'string');

            const validRelationships = extractedRelationships.map((e: any) => ({
                sourceId: e.sourceId || e.source,
                targetId: e.targetId || e.target,
                type: e.type || e.relation || "related_to",
                description: e.description,
                metadata: e.metadata
            })).filter((e: any) => e.sourceId && e.targetId && e.type);

            console.log(`[${this.name}] Extracted ${validEntities.length} entities and ${validRelationships.length} relationships.`);
            return { entities: validEntities, relationships: validRelationships } as GraphData;
        }

        return { entities: [], relationships: [] };
    }
}
```

### Step 5: Add Type Quality Check to Define Handler

**File**: `src/pipeline/workflow/edcWorkflow.ts` (Update Define Handler)

```typescript
// ============================================
// HANDLER 3: Define & Refine Types (WITH QUALITY LOOP)
// ============================================
workflow.handle([defineEvent], async (context, event) => {
  const { sendEvent, state } = context;
  const { graph, paperPath, refinementHints } = event.data;

  console.log(`[Define Handler] Refining ${graph.entities.length} entities (attempt ${state.attempts.definition + 1})...`);
  
  if (refinementHints && refinementHints.length > 0) {
    console.log(`[Define Handler] Refinement hints:`);
    refinementHints.forEach((hint, i) => console.log(`   ${i + 1}. ${hint}`));
  }
  
  const defineStartTime = Date.now();
  state.attempts.definition += 1;

  try {
    const definer = new Definer();
    const refinedGraph = await definer.process(graph);

    // Update state
    state.defineTime = Date.now() - defineStartTime;
    state.intermediateOutputs.definition = refinedGraph;
    state.metrics.refinedEntityCount = refinedGraph.entities.length;

    // QUALITY CHECK: Type distribution
    const assessor = new QualityAssessor();
    const qualityScores = assessor.assess(refinedGraph);
    state.qualityScores.definitionQuality = qualityScores.overall;

    console.log(`[Define Handler] Type Quality Score: ${(qualityScores.typeDistribution * 100).toFixed(1)}%`);

    // Save debug output
    const debugDir = path.resolve("debug");
    await fs.writeFile(
      path.join(debugDir, `02_definition_attempt_${state.attempts.definition}.json`),
      JSON.stringify({
        graph: refinedGraph,
        qualityScores: {
          typeDistribution: qualityScores.typeDistribution,
          overall: qualityScores.overall,
        },
        metadata: {
          defineTime: state.defineTime,
          attempt: state.attempts.definition,
          beforeCount: state.metrics.rawEntityCount,
          afterCount: state.metrics.refinedEntityCount,
        }
      }, null, 2)
    );

    // QUALITY DECISION: Check type distribution
    const maxAttempts = 2; // Fewer attempts for definition
    const typeQualityGood = qualityScores.typeDistribution >= 0.7;

    if (!typeQualityGood && state.attempts.definition < maxAttempts) {
      console.log(`[Define Handler] ⚠️  Type distribution needs improvement, refining again...`);
      
      // LOOP BACK with original extraction for re-definition
      sendEvent(defineEvent.with({ 
        graph: state.intermediateOutputs.extraction!, // Use original extraction
        paperPath,
        refinementHints: ["Reduce use of generic 'Concept' type", "Be more specific with Method, Metric, Dataset, Task types"]
      }));
    } else {
      console.log(`[Define Handler] Types refined in ${state.defineTime}ms`);

      // Proceed to canonicalization
      sendEvent(canonicalizeEvent.with({ graph: refinedGraph, paperPath }));
    }
  } catch (error) {
    state.errors.push({
      stage: "define",
      message: (error as Error).message,
      timestamp: Date.now(),
    });
    
    console.error(`[Define Handler] Error:`, error);
    sendEvent(errorEvent.with({
      stage: "define",
      error: (error as Error).message,
      paperPath,
    }));
  }
});
```

### Step 6: Update State Type for Quality Tracking

**File**: `src/pipeline/workflow/state.ts` (Already done in Phase 2, verify it has quality fields)

```typescript
// Ensure state includes:
export type EDCState = {
  // ... existing fields ...
  
  // Quality tracking
  qualityScores: {
    extractionQuality?: number;
    definitionQuality?: number;
    overallQuality?: number;
  };
  
  // ... rest of fields ...
};
```

### Step 7: Add Loop Prevention Safeguards

**File**: `src/pipeline/workflow/loopGuard.ts`

```typescript
import type { EDCState } from "./state.js";

/**
 * Prevents infinite loops in workflow
 */
export class LoopGuard {
  private static readonly MAX_TOTAL_ATTEMPTS = 10;
  
  /**
   * Check if workflow should stop due to too many total attempts
   */
  static shouldStop(state: EDCState): boolean {
    const totalAttempts = 
      state.attempts.extraction + 
      state.attempts.definition + 
      state.attempts.canonicalization;
    
    if (totalAttempts >= this.MAX_TOTAL_ATTEMPTS) {
      console.warn(`[LoopGuard] Maximum total attempts (${this.MAX_TOTAL_ATTEMPTS}) reached. Stopping loops.`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if a specific stage has exceeded its limit
   */
  static stageExceeded(state: EDCState, stage: 'extraction' | 'definition' | 'canonicalization', max: number): boolean {
    return state.attempts[stage] >= max;
  }
  
  /**
   * Log loop statistics
   */
  static logStats(state: EDCState): void {
    console.log(`[LoopGuard] Attempt statistics:`);
    console.log(`  Extraction:      ${state.attempts.extraction}`);
    console.log(`  Definition:      ${state.attempts.definition}`);
    console.log(`  Canonicalization: ${state.attempts.canonicalization}`);
    console.log(`  Total:           ${state.attempts.extraction + state.attempts.definition + state.attempts.canonicalization}`);
  }
}
```

## Testing Strategy

### Test Quality Assessment

```typescript
describe("Quality Assessment", () => {
  it("should detect low-quality extraction", () => {
    const assessor = new QualityAssessor();
    
    const lowQualityGraph: GraphData = {
      entities: [
        { id: "1", name: "our method", type: "Concept" },
        { id: "2", name: "this approach", type: "Concept" },
      ],
      relationships: [],
    };
    
    const scores = assessor.assess(lowQualityGraph);
    expect(scores.overall).toBeLessThan(0.6);
    expect(assessor.meetsThreshold(scores)).toBe(false);
  });
  
  it("should generate appropriate hints", () => {
    const assessor = new QualityAssessor();
    const scores = {
      entityCount: 0.5,
      entitySpecificity: 0.4,
      typeDistribution: 0.8,
      relationshipRatio: 0.6,
      descriptionCompleteness: 0.7,
      overall: 0.55,
    };
    
    const hints = assessor.generateHints(scores);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints.some(h => h.includes("specific names"))).toBe(true);
  });
});
```

### Test Loop Behavior

```typescript
describe("Quality Loops", () => {
  it("should retry extraction when quality is low", async () => {
    const workflow = createEDCWorkflow();
    const { stream, sendEvent } = workflow.createContext(
      createInitialState("/test/paper.pdf")
    );
    
    // Mock low-quality then high-quality responses
    // (requires mocking LLM responses)
    
    sendEvent(loadEvent.with({ paperPath: "/test/paper.pdf" }));
    
    let extractionAttempts = 0;
    for await (const event of stream) {
      if (extractEvent.include(event)) {
        extractionAttempts++;
      }
      if (completeEvent.include(event)) break;
    }
    
    // Should have retried at least once
    expect(extractionAttempts).toBeGreaterThan(1);
  });
  
  it("should stop after max attempts", async () => {
    // Test that loop guard prevents infinite loops
    const state = createInitialState("/test/paper.pdf");
    state.attempts.extraction = 10;
    
    expect(LoopGuard.shouldStop(state)).toBe(true);
  });
});
```

## Migration Checklist

- [ ] Create `src/pipeline/workflow/qualityAssessment.ts`
- [ ] Create `src/pipeline/workflow/loopGuard.ts`
- [ ] Update extract handler with quality loop
- [ ] Update define handler with type quality check
- [ ] Add `processWithHints` method to Extractor
- [ ] Update event definitions to include hints
- [ ] Add loop prevention safeguards to all handlers
- [ ] Test quality assessment functions
- [ ] Test loop behavior with mock data
- [ ] Verify max attempts prevent infinite loops
- [ ] Update documentation

## Success Criteria

✅ **Quality Detection**: Low-quality extractions are detected
✅ **Loop Functionality**: Handlers can retry with improvement hints
✅ **Loop Prevention**: Max attempts prevent infinite loops
✅ **Hint Generation**: Meaningful hints generated from quality gaps
✅ **Graceful Degradation**: Pipeline proceeds even if quality isn't perfect
✅ **State Tracking**: All quality scores and attempts tracked in state

## Benefits Unlocked

1. **Improved Output**: Iterative refinement produces better results
2. **Adaptive Processing**: System learns from quality feedback
3. **Robustness**: Can handle varied paper quality and formats
4. **Transparency**: Quality scores visible in debug outputs
5. **Configurability**: Quality thresholds can be tuned per use case

## Configuration Options

Add to environment or config file:

```typescript
// config/quality.ts
export const QUALITY_CONFIG = {
  extraction: {
    maxAttempts: 3,
    minQualityScore: 0.6,
    enableHints: true,
  },
  definition: {
    maxAttempts: 2,
    minTypeQualityScore: 0.7,
    enableRefinement: true,
  },
  global: {
    maxTotalAttempts: 10,
    enableLoopGuard: true,
  },
};
```

## Advanced Patterns (Future Extensions)

### Parallel Quality Checks
```typescript
// Check extraction quality while definition is running
workflow.handle([extractEvent], async (context, event) => {
  const { sendEvent } = context;
  
  // Send to BOTH definition AND quality assessment
  sendEvent(defineEvent.with({ graph: rawGraph }));
  sendEvent(qualityCheckEvent.with({ graph: rawGraph, stage: "extraction" }));
});
```

### Checkpoint/Resume
```typescript
// Save state at each quality decision point
workflow.handle([extractEvent], async (context, event) => {
  const { state } = context;
  
  // Save checkpoint
  await saveCheckpoint(state, "post-extraction");
  
  // Can resume from here if needed
});
```

### A/B Testing Different Prompts
```typescript
// Try multiple extraction strategies in parallel
workflow.handle([extractEvent], async (context, event) => {
  const { sendEvent } = context;
  
  // Fan-out to multiple extractors
  sendEvent(extractVariantAEvent.with({ text, strategy: "detailed" }));
  sendEvent(extractVariantBEvent.with({ text, strategy: "concise" }));
  
  // Fan-in: Pick best quality result
});
```

## Performance Considerations

| Aspect | Impact | Mitigation |
|--------|--------|-----------|
| Multiple LLM calls | Increased latency | Async processing, caching |
| Loop iterations | 2-3x processing time | Strict max attempts |
| Quality computation | Negligible | Pure functions, O(n) |
| State size growth | More memory | Prune old attempts |

## Estimated Effort

- **Implementation**: 6-8 hours
- **Testing**: 3-4 hours
- **Tuning thresholds**: 2-3 hours
- **Documentation**: 1-2 hours
- **Total**: 1.5-2 days

## Success Metrics

After Phase 3 completion, measure:

- **Quality Improvement**: Compare scores before/after loops
- **Convergence Rate**: How often does quality improve on retry?
- **Attempt Distribution**: What % of papers need retries?
- **Time vs Quality Trade-off**: Is the extra time worth it?

## Next Steps

After Phase 3, the workflow is production-ready for:
- Batch processing multiple papers
- Integration with API endpoints
- Real-time quality monitoring
- Further optimization based on metrics