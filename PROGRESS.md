# Project Progress & Feature Report

**Assignment:** Alaris Security AI Engineer Take-Home
**Repository Status:** MVP Complete (Simulated Agentic Integration)

## 📊 Progress Overview

We have built a functional, event-driven backend system that successfully:
1.  **Ingests** academic papers (tested on *Gaussian Splatting* domain).
2.  **Extracts** entities and relationships using LLM agents.
3.  **Refines & Canonicalizes** data within a single paper.
4.  **Integrates** new data into a persistent Postgres Knowledge Graph, resolving duplicates via Semantic Matching.

### Assignment Deliverables Checklist

| Deliverable | Status | Notes |
| :--- | :--- | :--- |
| **Backend Codebase** | ✅ **Done** | TypeScript + LlamaIndex Workflows. Full "EDC" (Extract-Define-Canonicalize) pipeline. |
| **Graph Database** | ✅ **Done** | Postgres (Supabase) + Drizzle ORM. Tables for `Entities`, `Relationships`. |
| **End-to-End Pipeline** | ✅ **Done** | CLI tool processes PDFs -> DB. Includes duplicate resolution. |
| **Documentation** | ✅ **Done** | `walkthrough.md` covers architecture. This file covers features. |
| **Agentic Reasoning** | ✅ **Done** | Agents for Type Refinement ("The Architect") and Entity Resolution ("The Historian"). |
| **Scalability Design** | ✅ **Done** | Event-driven architecture allows async/batch processing. |

---

## 🚀 Current Feature Set

### 1. The EDC Pipeline (Extract-Define-Canonicalize)
This is the core processing engine, running sequentially for each paper.

*   **File Loader**: Checks for cached Markdown to avoid re-parsing PDFs (Cost/Time saving).
*   **"The Dreamer" (Extraction Agent)**:
    *   Uses `LlamaParse` for high-fidelity text extraction.
    *   Extracts initial entities/relationships matching the domain (Paper, Method, Metric, etc.).
*   **"The Architect" (Refinement Agent)**:
    *   Critiques extracted entities.
    *   Standardizes types (e.g., changes "Algo" to "Method").
*   **"The Librarian" (Canonicalization Agent)**:
    *   Deduplicates entities *within* the current paper (e.g., "NeRF" == "Neural Radiance Field").

### 2. The Integration Workflow (Entity Resolution)
A separate, decoupled workflow that merges new data into the master graph.

*   **Candidate Retrieval**:
    *   Queries `entities` table using fuzzy text matching (`ILIKE`) to find potential duplicates.
    *   *Note*: Fast and effective for names with slight variations.
*   **LLM Resolution ("The Historian")**:
    *   Compares the New Entity vs. Candidate Entities.
    *   Decides to **MERGE** (use existing ID) or **CREATE** (new ID).
    *   *Example Success*: Successfully identified that "Gaussian Splatting" (New) is the same as "3D Gaussian Splatting" (Existing).
*   **Shared Persistence**:
    *   Updates the Postgres database transactionally.
    *   Handles connection lifecycle to prevent leaks.

### 3. Infrastructure & Tooling
*   **Database**: Postgres with `pgvector` extension enabled (ready for Phase 2).
*   **ORM**: Drizzle ORM for type-safe database interactions.
*   **CLI**: Simple command-line interface with flags (e.g., `--integrate`).

---

## 🧪 Validation Runs

We have successfully tested the pipeline on two distinct inputs:

1.  **`Take Home Assignment.pdf`** (Self-Test)
    *   *Result*: Extracted 9 entities (Concepts like "Knowledge Graph", "Semantic Relationships").
    *   *Integration*: Merged "Gaussian Splatting" concepts successfully.
    
2.  **`guassian-splatting.pdf`** (Target Domain)
    *   *Result*: Extracted 27 entities and 33 relationships.
    *   *Key Entities*: "3D Gaussian Splatting", "NeRF", "SSIM", "LPIPS".
    *   *Integration*: Successfully created a rich initial graph.

---

## 🔮 Roadmap / "What's Next"

While the MVP works, the following would be the immediate next steps for a production system:

1.  **Vector Semantic Search (Phase 2)**
    *   *Current*: Text matching (`ILIKE`). Limits finding synonyms with no overlapping words.
    *   *Upgrade*: Generate embeddings (OpenAI/Gemini) for entities. Use `cosineDistance` to find candidates.

2.  **Schema Alignment Agent**
    *   *Current*: LLM tries to adhere to prompt instructions.
    *   *Upgrade*: A dedicated agent to enforce a strict Ontology (e.g., ensure all "3D Methods" map to `class: Method` property `subclass: 3D`).

3.  **Conflict Resolution**
    *   *Current*: Merges blindly or prefers existing.
    *   *Upgrade*: When Paper A disputes Paper B, create a "Conflict" node or edge property to represent scientific disagreement.

---

## 🛠 How to Run

**Build:**
```bash
npm run build
```

**Run (Extraction + Integration):**
```bash
node dist/index.js data/papers/your-paper.pdf --integrate
```
