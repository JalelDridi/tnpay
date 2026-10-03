import { ApiError } from "./errors";
import { createMemoryStore, type IdempotencyStore } from "./idempotency";
import type { PaymentStatus } from "./status";

export interface WebhookContext {
  /** The reference taken from the request. The only thing taken from it. */
  reference: string;
  request: Request;
}

export type WebhookCallback<P> = (
  payment: P,
  ctx: WebhookContext,
) => Promise<void> | void;

export interface VerifiedWebhookOptions<P extends { status: PaymentStatus }> {
  /** Fetches the payment from the gateway. Throw ApiError 404 for unknown references. */
  lookup: (reference: string) => Promise<P>;
  /** Namespace for idempotency keys, e.g. "konnect". */
  keyPrefix: string;
  /** Query parameter (and JSON body field) that carries the reference. */
  queryParam: string;
  onPaid: WebhookCallback<P>;
  onPending?: WebhookCallback<P>;
  onFailed?: WebhookCallback<P>;
  store?: IdempotencyStore;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Reads the reference from the query string, or from a JSON body on POST. */
async function readReference(
  request: Request,
  param: string,
): Promise<string | undefined> {
  const fromQuery = new URL(request.url).searchParams.get(param)?.trim();
  if (fromQuery) return fromQuery;
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  try {
    const body: unknown = await request.clone().json();
    const value =
      body && typeof body === "object"
        ? (body as Record<string, unknown>)[param]
        : undefined;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The webhook pattern shared by the Tunisian gateways: an unsigned call
 * carrying a reference, which proves nothing on its own. The handler takes
 * only the reference, looks the payment up at the gateway, and acts on the
 * gateway's answer. `onPaid` runs once per payment, however many times the
 * webhook is delivered.
 */
export function createVerifiedWebhookHandler<
  P extends { status: PaymentStatus },
>(options: VerifiedWebhookOptions<P>): (request: Request) => Promise<Response> {
  const store = options.store ?? createMemoryStore();

  return async (request) => {
    const reference = await readReference(request, options.queryParam);
    if (!reference)
      return json(400, { error: `missing_${options.queryParam}` });

    let payment: P;
    try {
      payment = await options.lookup(reference);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return json(404, { error: "unknown_payment" });
      }
      const name = error instanceof Error ? error.name : "Error";
      return json(502, { error: name });
    }

    const ctx: WebhookContext = { reference, request };

    switch (payment.status) {
      case "paid": {
        const key = `${options.keyPrefix}:paid:${reference}`;
        if (!(await store.claim(key))) {
          return json(200, { ok: true, status: "paid", duplicate: true });
        }
        try {
          await options.onPaid(payment, ctx);
        } catch {
          await store.release(key);
          return json(500, { error: "handler_failed" });
        }
        return json(200, { ok: true, status: "paid" });
      }
      case "pending":
        await options.onPending?.(payment, ctx);
        return json(200, { ok: true, status: "pending" });
      case "failed":
      case "expired":
        await options.onFailed?.(payment, ctx);
        return json(200, { ok: true, status: payment.status });
    }
  };
}
