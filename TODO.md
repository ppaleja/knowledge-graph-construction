```Alaris Takehome/TODO.md
# Master Implementation Plan: EDC Workflow Refactoring

This document tracks the migration from the legacy `PipelineOrchestrator` to a LlamaIndex-native event-driven workflow.

## Phase 1: Events and State Infrastructure

- [ ] **Install Dependencies**
  - Run `npm install @llamaindex/workflow-core`

- [ ] **Define Domain Events**
  - Create `src/pipeline/workflow/events.ts`
  - Implement `LoadEvent`, `ExtractEvent`, `DefineEvent`, `CanonicalizeEvent`, `SaveEvent`, `CompleteEvent`, `ErrorEvent`

- [ ] **Define Workflow State**
  - Create `src/pipeline/workflow/state.ts`
  - Define `EDCState` interface (inputs, artifacts, metrics, retries)

- [ ] **Configure Middleware**
  - Create `src/pipeline/workflow/factory.ts`
  - Implement `createStatefulMiddleware` with default state initialization

## Phase 2: Workflow Logic Implementation

- [ ] **Create Workflow Definition**
  - Create `src/pipeline/workflow/index.ts`
  - Import `createWorkflow` and domain classes

- [ ] **Implement Step Handlers**
  - [ ] **Load Handler**: Triggered by `LoadEvent` -> Emits `ExtractEvent`
  - [ ] **Extract Handler**: Triggered by `ExtractEvent` -> Emits `DefineEvent`
  - [ ] **Define Handler**: Triggered by `DefineEvent` -> Emits `CanonicalizeEvent`
  - [ ] **Canonicalize Handler**: Triggered by `CanonicalizeEvent` -> Emits `SaveEvent`
  - [ ] **Save Handler**: Triggered by `SaveEvent` -> Emits `CompleteEvent`

- [ ] **Assemble Workflow**
  - Register all handlers
  - Apply state middleware
  - Export `edcWorkflow`

## Phase 3: Execution & Cleanup

- [ ] **Refactor Entry Point**
  - Update `src/index.ts`
  - Initialize `edcWorkflow` context
  - Implement event streaming loop for console logging
  - Handle completion and error states

- [ ] **Deprecate Legacy Code**
  - Delete `src/pipeline/orchestrator.ts`
  - Verify no lingering references to the old orchestrator

## Verification

- [ ] **End-to-End Test**
  - Run `npm start <path_to_paper>`
  - Verify console output shows event progression
  - Check database for persisted entities and relationships
