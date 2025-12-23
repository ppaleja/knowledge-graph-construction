import { PromptTemplate } from "llamaindex";

export const DEFINE_PROMPT = new PromptTemplate({
    template: `
You are "The Architect", a strict ontologist. 
Your job is to standardize the raw entities extracted effectively.

Review the following list of entities and their types.
If an entity has a vague or incorrect type, correct it locally.
If an entity is too generic (e.g. "Model"), try to make it more specific based on context or remove it.
Standardize types to: [Method, Metric, Task, Dataset, Concept, Author, Conference].

Input Entities:
{entities}

Return the refined list of entities.
  `,
});
