import type { IdempotencyStore } from "@tnpay/core";
import type { Konnect } from "./client.js";
import type { Payment } from "./types.js";

export interface WebhookContext {
  paymentRef: string;
  request: Request;
}

export interface WebhookOptions {
  onPaid: (payment: Payment, ctx: WebhookContext) => Promise<void> | void;
  onPending?: (payment: Payment, ctx: WebhookContext) => Promise<void> | void;
  onFailed?: (payment: Payment, ctx: WebhookContext) => Promise<void> | void;
  store?: IdempotencyStore;
  queryParam?: string;
}

export function createWebhookHandler(
  _client: Konnect,
  _options: WebhookOptions,
): (request: Request) => Promise<Response> {
  return async () => new Response(null, { status: 501 });
}
