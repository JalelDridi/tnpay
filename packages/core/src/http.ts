import { ApiError, NetworkError, TimeoutError } from "./errors";

export type HttpOptions = {
  baseUrl: string;
  headers?: Record<string, string>;
  /** Per-request timeout. Default 10 seconds. */
  timeoutMs?: number;
  /** Injected for tests and custom agents. Default: the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Base delay between GET retries; multiplied by the attempt number. */
  retryDelayMs?: number;
};

export type Http = {
  get<T = unknown>(path: string): Promise<T>;
  post<T = unknown>(path: string, body: unknown): Promise<T>;
};

const GET_ATTEMPTS = 3;

/**
 * A small JSON client with timeouts and typed errors. GETs are retried on
 * network errors, timeouts and 5xx; POSTs never are, because none of the
 * gateways here document an idempotency key, so a retry could pay twice.
 */
export function createHttp(options: HttpOptions): Http {
  const {
    baseUrl,
    headers = {},
    timeoutMs = 10_000,
    fetch = globalThis.fetch,
    retryDelayMs = 250,
  } = options;
  const root = baseUrl.replace(/\/+$/, "");

  async function once<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${root}/${path.replace(/^\/+/, "")}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      const init: RequestInit = {
        method,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json" }),
          ...headers,
        },
        signal: controller.signal,
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      response = await fetch(url, init);
    } catch (cause) {
      if (controller.signal.aborted) throw new TimeoutError(url, timeoutMs);
      throw new NetworkError(url, cause);
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    let parsed: unknown = undefined;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) throw new ApiError(response.status, parsed, url);
    return parsed as T;
  }

  const retryable = (error: unknown) =>
    error instanceof NetworkError ||
    error instanceof TimeoutError ||
    (error instanceof ApiError && error.status >= 500);

  return {
    async get<T>(path: string): Promise<T> {
      for (let attempt = 1; ; attempt++) {
        try {
          return await once<T>("GET", path);
        } catch (error) {
          if (attempt >= GET_ATTEMPTS || !retryable(error)) throw error;
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelayMs * attempt),
          );
        }
      }
    },
    post<T>(path: string, body: unknown): Promise<T> {
      return once<T>("POST", path, body);
    },
  };
}
