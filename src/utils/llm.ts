import { Gemini, GEMINI_MODEL } from "@llamaindex/google";
import { Settings } from "llamaindex";
import * as dotenv from "dotenv";

dotenv.config();

export const initLLM = () => {
  Settings.llm = new Gemini({
    model:
      (process.env.GEMINI_MODEL as GEMINI_MODEL) ||
      GEMINI_MODEL.GEMINI_2_5_FLASH_LATEST,
    temperature: 0,
  });
};

export const getLLM = () => {
  return Settings.llm;
};
