/**
 * Resilience Utility
 * 
 * Provides robust retry logic for IO-bound operations (Network, DB, API).
 */

const RETRY_DEFAULTS = {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 10000,
};

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps an async operation with exponential backoff retry logic.
 * 
 * @param operation The async function to retry
 * @param options Retry configuration
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    options: Partial<typeof RETRY_DEFAULTS> & { name?: string } = {}
): Promise<T> {
    const config = { ...RETRY_DEFAULTS, ...options };
    const name = options.name || 'Operation';

    let lastError: any;

    for (let attempt = 1; attempt <= config.retries + 1; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            // Fail fast on certain errors (e.g. 401 Unauthorized, 400 Bad Request)
            // But we specifically want to retry transient (500, network) and even some rate limits if handled elsewhere.
            // For now, retry on everything except explicit breaks.
            const isRetryable = shouldRetry(error);

            if (!isRetryable || attempt > config.retries) {
                console.error(`[Resilience] ${name} failed on attempt ${attempt}. Giving up.`);
                throw error;
            }

            const delay = Math.min(
                config.minTimeout * Math.pow(config.factor, attempt - 1),
                config.maxTimeout
            );

            console.warn(`[Resilience] ${name} failed (Attempt ${attempt}/${config.retries}). Retrying in ${delay}ms... Error: ${error.message}`);
            await sleep(delay);
        }
    }

    throw lastError;
}

function shouldRetry(error: any): boolean {
    // 1. Quota errors (402) - typically fatal unless we have a fallback strategy, 
    // but this util just retries. The Caller handles fallback.
    // However, LlamaParse 402 is NOT retryable.
    if (error.message?.includes('Payment Required') || error.message?.includes('402')) {
        return false;
    }

    // 2. Authentication errors
    if (error.message?.includes('Unauthorized') || error.message?.includes('401')) {
        return false;
    }

    // 3. 404s often aren't retryable
    if (error.status === 404) return false;

    // Retry everything else (Network, 5xx, timeouts)
    return true;
}
