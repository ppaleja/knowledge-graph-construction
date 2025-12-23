# EDC Workflow Refactoring - Master TODO Checklist

## Overview

This document consolidates all tasks from the three-phase refactoring plan to migrate the current custom orchestrator to LlamaIndex's native Workflow system with state management and quality loops.

**Estimated Total Effort**: 3-4 days of development work

---

## 📋 Pre-Refactoring Tasks

- [ ] Review all three phase documents thoroughly
- [ ] Backup current working codebase
- [ ] Create feature branch: `git checkout -b feature/workflow-refactoring`
- [ ] Set up test fixtures and sample papers for validation
- [ ] Document current baseline metrics (timing, entity counts)
- [ ] Install required dependencies: `npm install @llamaindex/workflow-core`
- [ ] Archive legacy orchestrator as `orchestrator.legacy.ts`

---

## 🎯 Phase 1: Convert to Basic LlamaIndex Workflow

**Goal**: Replace linear orchestrator with event-driven workflow  
**Estimated Time**: 1 day (8 hours)

### 1.1 Project Structure
- [ ] Create `src/pipeline/workflow/` directory
- [ ] Create `src/pipeline/workflow/events.ts`
- [ ] Create `src/pipeline/workflow/edcWorkflow.ts`

### 1.2 Event Definitions
- [ ] Define `loadEvent` for paper loading
- [ ] Define `extractEvent` for entity extraction
- [ ] Define `defineEvent` for type refinement
- [ ] Define `canonicalizeEvent` for deduplication
- [ ] Define `saveEvent` for database persistence
- [ ] Define `completeEvent` for pipeline completion
- [ ] Define `errorEvent` for error handling

### 1.3 Workflow Handlers
- [ ] Implement Load Handler (integrates LlamaParseLoader)
- [ ] Implement Extract Handler (wraps Extractor class)
- [ ] Implement Define Handler (wraps Definer class)
- [ ] Implement Canonicalize Handler (wraps Canonicalizer class)
- [ ] Implement Save Handler (integrates DrizzleGraphStore)
- [ ] Implement Error Handler (unified error processing)

### 1.4 Entry Point Updates
- [ ] Update `src/index.ts` to use workflow
- [ ] Add workflow context creation
- [ ] Add event stream processing
- [ ] Add completion event handling
- [ ] Maintain backward compatibility with command-line arguments

### 1.5 Testing & Validation
- [ ] Test with existing sample paper
- [ ] Verify all debug outputs are generated (`01_extraction.json`, `02_definition.json`, `03_canonicalization.json`)
- [ ] Verify database persistence works correctly
- [ ] Compare output with legacy orchestrator
- [ ] Benchmark performance vs legacy implementation
- [ ] Write unit tests for individual handlers
- [ ] Write integration test for full pipeline

### 1.6 Documentation
- [ ] Update README with workflow architecture diagram
- [ ] Document event flow and handler responsibilities
- [ ] Add code comments to all handlers
- [ ] Create migration guide from legacy orchestrator

### 1.7 Phase 1 Completion
- [ ] All tests passing
- [ ] Output matches legacy orchestrator
- [ ] Performance acceptable (within 10% of legacy)
- [ ] Code review completed
- [ ] Commit: `git commit -m "Phase 1: Convert to LlamaIndex Workflow"`

---

## 🔄 Phase 2: Add State Management with Middleware

**Goal**: Enable centralized state tracking and metrics  
**Estimated Time**: 0.75 days (6-7 hours)

### 2.1 State Type Definition
- [ ] Create `src/pipeline/workflow/state.ts`
- [ ] Define `EDCState` type with all required fields:
  - [ ] Input metadata (paperPath, paperName)
  - [ ] Timing metrics (loadTime, extractTime, defineTime, etc.)
  - [ ] Intermediate outputs (rawText, extraction, definition, canonicalization)
  - [ ] Processing metrics (entity counts, deduplication ratio)
  - [ ] Attempt tracking (extraction, definition, canonicalization)
  - [ ] Quality scores (for Phase 3)
  - [ ] Error tracking array
  - [ ] Status flags (isComplete, isSuccess)
- [ ] Implement `createInitialState()` factory function

### 2.2 Stateful Middleware Integration
- [ ] Import `createStatefulMiddleware` from LlamaIndex
- [ ] Wrap base workflow with state middleware
- [ ] Update workflow factory to return stateful workflow
- [ ] Test state initialization

### 2.3 Update All Handlers with State
- [ ] **Load Handler**: 
  - [ ] Track loadTime
  - [ ] Store rawText in intermediateOutputs
  - [ ] Update metrics.textLength
  - [ ] Log errors to state.errors
- [ ] **Extract Handler**: 
  - [ ] Increment attempts.extraction
  - [ ] Track extractTime
  - [ ] Store extraction in intermediateOutputs
  - [ ] Update metrics (rawEntityCount, rawRelationshipCount)
  - [ ] Save metadata to debug output
- [ ] **Define Handler**: 
  - [ ] Increment attempts.definition
  - [ ] Track defineTime
  - [ ] Store definition in intermediateOutputs
  - [ ] Update metrics.refinedEntityCount
  - [ ] Save before/after counts to debug
- [ ] **Canonicalize Handler**: 
  - [ ] Increment attempts.canonicalization
  - [ ] Track canonicalizeTime
  - [ ] Store canonicalization in intermediateOutputs
  - [ ] Calculate deduplication ratio
  - [ ] Update final entity/relationship counts
- [ ] **Save Handler**: 
  - [ ] Track saveTime
  - [ ] Calculate totalTime
  - [ ] Set isComplete and isSuccess flags
  - [ ] Save state summary to `04_state_summary.json`
- [ ] **Error Handler**: 
  - [ ] Update state with failure info
  - [ ] Save error state to JSON

### 2.4 Entry Point State Initialization
- [ ] Update `src/index.ts` to create initial state
- [ ] Pass state to workflow.createContext()
- [ ] Display state summary on completion

### 2.5 State Inspection Utilities
- [ ] Create `src/pipeline/workflow/stateInspector.ts`
- [ ] Implement `StateInspector.summarize()` method
- [ ] Implement `StateInspector.shouldRetry()` method
- [ ] Implement `StateInspector.calculateQuality()` method
- [ ] Add formatted console output for state summary

### 2.6 Testing & Validation
- [ ] Test state persistence across handlers
- [ ] Verify all metrics are calculated correctly
- [ ] Verify state summary JSON is created
- [ ] Test error state tracking
- [ ] Write tests for state inspector utilities
- [ ] Verify timing metrics are accurate

### 2.7 Phase 2 Completion
- [ ] All state fields populated correctly
- [ ] Debug outputs include metadata
- [ ] State summary provides useful insights
- [ ] Tests passing
- [ ] Code review completed
- [ ] Commit: `git commit -m "Phase 2: Add State Management"`

---

## 🔁 Phase 3: Implement Quality Checking and Retry Loops

**Goal**: Add intelligent quality assessment and iterative refinement  
**Estimated Time**: 1.5-2 days (12-16 hours)

### 3.1 Quality Assessment Framework
- [ ] Create `src/pipeline/workflow/qualityAssessment.ts`
- [ ] Define `QualityScores` interface
- [ ] Define `QualityConfig` interface
- [ ] Create `DEFAULT_QUALITY_CONFIG` constant
- [ ] Implement `QualityAssessor` class with methods:
  - [ ] `assess()` - full quality assessment
  - [ ] `meetsThreshold()` - check if quality acceptable
  - [ ] `generateHints()` - create improvement suggestions
  - [ ] `assessEntityCount()` - evaluate entity quantity
  - [ ] `assessEntitySpecificity()` - detect generic names
  - [ ] `assessTypeDistribution()` - check type diversity
  - [ ] `assessRelationshipRatio()` - evaluate connectivity
  - [ ] `assessDescriptionCompleteness()` - check descriptions

### 3.2 Loop Prevention
- [ ] Create `src/pipeline/workflow/loopGuard.ts`
- [ ] Implement `LoopGuard.shouldStop()` - prevent infinite loops
- [ ] Implement `LoopGuard.stageExceeded()` - check stage limits
- [ ] Implement `LoopGuard.logStats()` - display attempt statistics
- [ ] Define maximum attempt constants

### 3.3 Event Updates for Hints
- [ ] Update `extractEvent` to include optional `qualityHints` field
- [ ] Update `defineEvent` to include optional `refinementHints` field
- [ ] Test event schema changes

### 3.4 Extractor Enhancement
- [ ] Add `processWithHints()` method to Extractor class
- [ ] Implement hint integration into prompt
- [ ] Test hint-based extraction improves quality
- [ ] Maintain backward compatibility with `process()`

### 3.5 Extract Handler Quality Loop
- [ ] Add quality assessment after extraction
- [ ] Store quality score in state.qualityScores.extractionQuality
- [ ] Implement quality decision logic:
  - [ ] If quality low AND attempts < max: retry with hints
  - [ ] If quality low AND attempts >= max: proceed anyway
  - [ ] If quality good: proceed to next stage
- [ ] Generate improvement hints from quality gaps
- [ ] Update debug output naming: `01_extraction_attempt_N.json`
- [ ] Add quality scores to debug JSON
- [ ] Integrate LoopGuard checks
- [ ] Log quality scores and decisions

### 3.6 Define Handler Quality Loop
- [ ] Add type distribution quality check
- [ ] Store quality score in state.qualityScores.definitionQuality
- [ ] Implement refinement loop:
  - [ ] If type quality low AND attempts < max: retry
  - [ ] Use original extraction for retry (from state)
  - [ ] Pass refinement hints to next attempt
- [ ] Update debug output naming: `02_definition_attempt_N.json`
- [ ] Add type quality metrics to debug JSON
- [ ] Integrate LoopGuard checks

### 3.7 State Updates for Quality
- [ ] Verify `qualityScores` object exists in state type
- [ ] Ensure quality fields are initialized
- [ ] Test quality score persistence across loops

### 3.8 Configuration System
- [ ] Create `config/quality.ts` (optional)
- [ ] Define configurable thresholds:
  - [ ] Max attempts per stage
  - [ ] Minimum quality scores
  - [ ] Enable/disable features
- [ ] Allow environment variable overrides

### 3.9 Testing & Validation
- [ ] Test quality assessment accuracy
  - [ ] Low-quality graph detection
  - [ ] High-quality graph detection
  - [ ] Hint generation appropriateness
- [ ] Test loop behavior
  - [ ] Extraction retries on low quality
  - [ ] Definition refinement on type issues
  - [ ] Max attempts prevent infinite loops
  - [ ] LoopGuard prevents runaway loops
- [ ] Test graceful degradation
  - [ ] Pipeline completes even with low quality
  - [ ] Appropriate warnings logged
- [ ] Test with various paper qualities
- [ ] Benchmark quality improvement from loops
- [ ] Write comprehensive test suite

### 3.10 Documentation
- [ ] Document quality scoring algorithm
- [ ] Document threshold tuning guide
- [ ] Add examples of quality improvements
- [ ] Document loop patterns and safeguards
- [ ] Create troubleshooting guide for loops

### 3.11 Phase 3 Completion
- [ ] Quality assessment working correctly
- [ ] Loops improve output quality measurably
- [ ] No infinite loops observed
- [ ] Performance acceptable (2-3x base time max)
- [ ] All tests passing
- [ ] Code review completed
- [ ] Commit: `git commit -m "Phase 3: Add Quality Loops"`

---

## 🚀 Post-Refactoring Tasks

### Integration & Deployment
- [ ] Merge feature branch to main
- [ ] Update production deployment scripts
- [ ] Update CI/CD pipeline if needed
- [ ] Monitor first production runs

### Documentation
- [ ] Update main README with workflow architecture
- [ ] Create architecture decision record (ADR)
- [ ] Document configuration options
- [ ] Create runbook for common issues
- [ ] Update API documentation (if applicable)

### Optimization & Monitoring
- [ ] Set up metrics collection for:
  - [ ] Pipeline duration
  - [ ] Quality scores
  - [ ] Retry rates
  - [ ] Success rates
- [ ] Create dashboard for monitoring
- [ ] Profile performance bottlenecks
- [ ] Tune quality thresholds based on data

### Future Enhancements (Optional)
- [ ] Batch processing multiple papers
- [ ] Parallel paper processing (fan-out/fan-in)
- [ ] Checkpoint/resume functionality
- [ ] Workflow persistence to database
- [ ] A/B testing different extraction strategies
- [ ] Cross-paper entity resolution
- [ ] Incremental updates for new papers
- [ ] API endpoints for workflow status
- [ ] Real-time streaming to frontend
- [ ] Workflow visualization UI

---

## 📊 Success Metrics

Track these metrics before and after refactoring:

### Functionality
- [ ] ✅ Output parity with legacy system (100% of test cases)
- [ ] ✅ All debug outputs generated correctly
- [ ] ✅ Database persistence working
- [ ] ✅ Error handling robust

### Quality
- [ ] 📈 Average extraction quality score
- [ ] 📈 Entity specificity improvement
- [ ] 📈 Type distribution improvement
- [ ] 📈 Relationship density improvement

### Performance
- [ ] ⏱️ Base case timing (no retries) within 10% of legacy
- [ ] ⏱️ Average timing (with retries) acceptable (< 3x base)
- [ ] 🔄 Retry rate (should be < 30% of papers)
- [ ] 🔄 Loop convergence rate (quality improves on retry > 70%)

### Code Quality
- [ ] 🧪 Test coverage > 80%
- [ ] 📝 All code documented
- [ ] ♻️ No code duplication
- [ ] 🏗️ Clean architecture maintained

---

## 🆘 Troubleshooting Checklist

If issues arise during refactoring:

### Pipeline Not Running
- [ ] Check workflow context creation
- [ ] Verify event definitions match handler signatures
- [ ] Check for TypeScript compilation errors
- [ ] Verify LlamaIndex version compatibility

### State Not Persisting
- [ ] Verify middleware is applied correctly
- [ ] Check state initialization in entry point
- [ ] Confirm state is accessed via `context.state`
- [ ] Check for state mutation vs reassignment issues

### Infinite Loops
- [ ] Verify LoopGuard is enabled
- [ ] Check max attempt limits are set
- [ ] Ensure quality checks don't always fail
- [ ] Add debug logs to track event flow

### Quality Not Improving
- [ ] Review hint generation logic
- [ ] Check if hints are passed to extractor
- [ ] Verify prompt augmentation with hints
- [ ] Test quality assessment accuracy
- [ ] Consider lowering quality thresholds

### Performance Degradation
- [ ] Profile where time is spent
- [ ] Reduce max retry attempts
- [ ] Cache LLM responses if possible
- [ ] Consider parallel processing

---

## 📅 Timeline

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| Pre-work | 2 hours | Backups, branch setup, dependencies |
| Phase 1 | 1 day | Event-driven workflow |
| Phase 2 | 0.75 days | State management |
| Phase 3 | 1.5-2 days | Quality loops |
| Testing | 0.5 days | Comprehensive validation |
| Documentation | 0.25 days | Updated docs |
| **Total** | **3-4 days** | Production-ready workflow |

---

## ✅ Final Sign-off

Before considering refactoring complete:

- [ ] All checklist items above completed
- [ ] Code reviewed by team
- [ ] Tests passing in CI/CD
- [ ] Documentation updated
- [ ] Stakeholders demoed new capabilities
- [ ] Production deployment plan approved
- [ ] Rollback plan documented
- [ ] Monitoring in place

---

## 📚 Reference Documents

- [Phase 1: Workflow Conversion](./PHASE_1_WORKFLOW_CONVERSION.md)
- [Phase 2: State Management](./PHASE_2_STATE_MANAGEMENT.md)
- [Phase 3: Quality Loops](./PHASE_3_QUALITY_LOOPS.md)
- [LlamaIndex Workflow Docs](https://developers.llamaindex.ai/typescript/workflows)
- [Original Assignment](../data/papers/Take%20Home%20Assignment.pdf.md)

---

**Last Updated**: [Current Date]  
**Owner**: [Your Name]  
**Status**: 🟡 In Progress / 🟢 Complete / 🔴 Blocked