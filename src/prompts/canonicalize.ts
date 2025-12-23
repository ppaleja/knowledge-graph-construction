import { PromptTemplate } from "llamaindex";

export const CANONICALIZE_PROMPT = new PromptTemplate({
  template: `
You are "The Librarian". You are tasked with determining if two entities refer to the same real-world concept.

Entity A: {entityA}
Entity B: {entityB}

Are these the same? Consider aliases, abbreviations (e.g. "3DGS" vs "3D Gaussian Splatting"), and context.
Are these the same? Consider aliases, abbreviations (e.g. "3DGS" vs "3D Gaussian Splatting"), and context.
  `,
});
