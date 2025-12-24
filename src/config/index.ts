import "dotenv/config";

/**
 * Centralized configuration module
 * Single source of truth for all environment variables and app configuration
 */

export const config = {
    llamaCloud: {
        apiKey: process.env.LLAMA_CLOUD_API_KEY!,
        baseUrl: "https://api.cloud.llamaindex.ai",
    },
    openAlex: {
        email: process.env.OPEN_ALEX_EMAIL,
        apiUrl: "https://api.openalex.org",
    },
    google: {
        apiKey: process.env.GOOGLE_API_KEY,
    },
    supabase: {
        url: process.env.DATABASE_URL,
    },
    paths: {
        downloadDir: "data/papers/corpus",
        debugDir: "debug",
    },
} as const;

/**
 * Validates that all required environment variables are present
 * @throws Error if required env vars are missing
 */
export function validateConfig() {
    const required = ["LLAMA_CLOUD_API_KEY", "DATABASE_URL"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
}
