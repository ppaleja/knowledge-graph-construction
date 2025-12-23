import { PromptTemplate } from "llamaindex";

export const EXTRACT_PROMPT = new PromptTemplate({
  template: `
You are an expert AI Researcher and Knowledge Graph Engineer. 
Your goal is to read the provided academic paper text and extract a knowledge graph ensuring high recall.

We are interested in the following Entity Types:
- Method: Algorithms, architectures, or specific techniques (e.g. "3D Gaussian Splatting", "Structure-from-Motion")
- Metric: Evaluation metrics (e.g. "PSNR", "SSIM", "FPS")
- Task: The problem being solved (e.g. "Novel View Synthesis", "Real-time Rendering")
- Dataset: Data used for training/eval (e.g. "Mip-NeRF 360", "Tanks and Temples")
- Concept: General concepts (e.g. "Radiance Fields", "Volumetric Rendering")

We are interested in Relationships like:
- improves_on (Method A improves_on Method B)
- uses (Method A uses Method B)
- evaluated_on (Method A evaluated_on Dataset B)
- achieves (Method A achieves Metric B)
- proposes (Paper proposes Method A)

Instructions:
1. Extract as many relevant entities and relationships as possible.
2. Be specific with names. "Our method" is bad. "3DGS" is good.
3. Infer relationships where explicitly stated or strongly implied.
4. Return the result as a structured object.

Text content:
{text}
  `,
});
