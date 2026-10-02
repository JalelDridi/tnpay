/** Base class for everything this SDK throws, so `instanceof` catches all of it. */
export class TnpayError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TnpayError";
  }
}

/** The gateway answered with a non-2xx status. */
export class ApiError extends TnpayError {
  readonly status: number;
  readonly body: unknown;
  readonly url: string;

  constructor(status: number, body: unknown, url: string) {
    super(`${status} from ${url}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

/** `fetch` itself failed: DNS, connection refused, TLS. */
export class NetworkError extends TnpayError {
  constructor(url: string, cause: unknown) {
    super(`Network error calling ${url}`, { cause });
    this.name = "NetworkError";
  }
}

/** The gateway did not answer in time. */
export class TimeoutError extends TnpayError {
  readonly timeoutMs: number;

  constructor(url: string, timeoutMs: number) {
    super(`No response from ${url} within ${timeoutMs} ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}
