import { describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError, TimeoutError } from "./errors.js";
import { createHttp } from "./http.js";

type Reply = { status: number; body?: unknown } | Error | "hang";

/** A fetch stub that answers from a script and records every call. */
function stubFetch(script: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const reply = script.shift();
    if (reply === undefined) throw new Error("script exhausted");
    if (reply instanceof Error) throw reply;
    if (reply === "hang") {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    }
    return new Response(
      reply.body === undefined ? null : JSON.stringify(reply.body),
      { status: reply.status, headers: { "content-type": "application/json" } },
    );
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const base = { baseUrl: "https://api.example.test/v2", retryDelayMs: 0 };

describe("createHttp", () => {
  it("joins the base URL, sends headers and parses JSON", async () => {
    const { fetch, calls } = stubFetch([{ status: 200, body: { ok: 1 } }]);
    const http = createHttp({ ...base, headers: { "x-api-key": "k" }, fetch });

    const result = await http.get<{ ok: number }>("/payments/abc");

    expect(result).toEqual({ ok: 1 });
    expect(calls[0]?.url).toBe("https://api.example.test/v2/payments/abc");
    expect(new Headers(calls[0]?.init.headers).get("x-api-key")).toBe("k");
  });

  it("posts JSON with the content type set", async () => {
    const { fetch, calls } = stubFetch([{ status: 200, body: { id: "x" } }]);
    const http = createHttp({ ...base, fetch });

    await http.post("/payments/init-payment", { amount: 5 });

    expect(calls[0]?.init.method).toBe("POST");
    expect(calls[0]?.init.body).toBe('{"amount":5}');
    expect(new Headers(calls[0]?.init.headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("turns a 404 into an ApiError carrying status, body and url", async () => {
    const { fetch } = stubFetch([{ status: 404, body: { error: "nope" } }]);
    const http = createHttp({ ...base, fetch });

    const error = await http.get("/payments/missing").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.body).toEqual({ error: "nope" });
    expect(error.url).toBe("https://api.example.test/v2/payments/missing");
  });

  it("retries a GET after a 5xx and returns the later success", async () => {
    const { fetch, calls } = stubFetch([
      { status: 503 },
      { status: 200, body: { ok: true } },
    ]);
    const http = createHttp({ ...base, fetch });

    await expect(http.get("/x")).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("gives up a GET after three attempts", async () => {
    const { fetch, calls } = stubFetch([
      { status: 500 },
      { status: 500 },
      { status: 500 },
    ]);
    const http = createHttp({ ...base, fetch });

    await expect(http.get("/x")).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(3);
  });

  it("never retries a POST", async () => {
    const { fetch, calls } = stubFetch([{ status: 500 }, { status: 200 }]);
    const http = createHttp({ ...base, fetch });

    await expect(http.post("/x", {})).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });

  it("wraps a failed fetch in NetworkError, retrying only GETs", async () => {
    const boom = new TypeError("fetch failed");
    const get = stubFetch([boom, boom, boom]);
    const post = stubFetch([boom]);

    await expect(
      createHttp({ ...base, fetch: get.fetch }).get("/x"),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(get.calls).toHaveLength(3);

    await expect(
      createHttp({ ...base, fetch: post.fetch }).post("/x", {}),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(post.calls).toHaveLength(1);
  });

  it("aborts after the timeout and reports a TimeoutError", async () => {
    const { fetch } = stubFetch(["hang"]);
    const http = createHttp({ ...base, fetch, timeoutMs: 20 });

    const error = await http.post("/slow", {}).catch((e) => e);

    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.timeoutMs).toBe(20);
  });

  it("returns undefined for an empty body", async () => {
    const { fetch } = stubFetch([{ status: 204 }]);
    const http = createHttp({ ...base, fetch });

    await expect(http.get("/empty")).resolves.toBeUndefined();
  });
});
