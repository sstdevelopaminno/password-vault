const DEFAULT_RETRY_ATTEMPTS = 4;
const DEFAULT_RETRY_DELAY_MS = 650;

type FetchRetryOptions = {
  attempts?: number;
  delayMs?: number;
};

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function shouldRetryResponse(response: Response) {
  return response.status === 503 || response.status === 504;
}

export async function fetchWithSessionRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: FetchRetryOptions,
) {
  const attempts = Math.max(1, Math.floor(options?.attempts ?? DEFAULT_RETRY_ATTEMPTS));
  const baseDelayMs = Math.max(50, Math.floor(options?.delayMs ?? DEFAULT_RETRY_DELAY_MS));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(input, {
        ...init,
        credentials: init?.credentials ?? "same-origin",
      });
      if (!shouldRetryResponse(response) || attempt === attempts) {
        return response;
      }
    } catch (error) {
      if (attempt === attempts) {
        throw error;
      }
    }

    await delay(baseDelayMs * attempt);
  }

  return fetch(input, {
    ...init,
    credentials: init?.credentials ?? "same-origin",
  });
}
