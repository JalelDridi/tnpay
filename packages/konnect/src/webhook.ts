import {
  ApiError,
  createMemoryStore,
  type IdempotencyStore,
} from "@tnpay/core";
import type { Konnect } from "./client.js";
import type { Payment } from "./types.js";

export interface WebhookContext {
  paymentRef: string;
  request: Request;
}

type Callback = (payment: Payment, ctx: WebhookContext) => Promise<void> | void;

export interface WebhookOptions {
  /** Called once per payment, after Konnect has confirmed it is paid. */
  onPaid: Callback;
  /** Called on every delivery for a payment that is still pending. */
  onPending?: Callback;
  /** Called on every delivery for a failed or expired payment. */
  onFailed?: Callback;
  /** Where "already handled" is remembered. Default: in memory, per process. */
  store?: IdempotencyStore;
  /** Query parameter carrying the reference. Default `payment_ref`. */
  queryParam?: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Konnect's webhook is a bare `GET ?payment_ref=…` with no signature, so the
 * request itself proves nothing. The handler takes only the reference from
 * it, asks Konnect for the payment, and acts on Konnect's answer. `onPaid`
 * runs once per payment, however many times the webhook is delivered.
 */
export function createWebhookHandler(
  client: Konnect,
  options: WebhookOptions,
): (request: Request) => Promise<Response> {
  const store = options.store ?? createMemoryStore();
  const param = options.queryParam ?? "payment_ref";

  return async (request) => {
    const paymentRef = new URL(request.url).searchParams.get(param)?.trim();
    if (!paymentRef) return json(400, { error: "missing_payment_ref" });

    let payment: Payment;
    try {
      payment = await client.payments.get(paymentRef);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return json(404, { error: "unknown_payment" });
      }
      const name = error instanceof Error ? error.name : "Error";
      return json(502, { error: name });
    }

    const ctx: WebhookContext = { paymentRef, request };

    switch (payment.status) {
      case "paid": {
        const key = `konnect:paid:${paymentRef}`;
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
