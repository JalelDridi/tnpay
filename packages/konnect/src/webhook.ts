import {
  createVerifiedWebhookHandler,
  type IdempotencyStore,
  type WebhookCallback,
  type WebhookContext,
} from "@tnpay/core";
import type { Konnect } from "./client";
import type { Payment } from "./types";

export type { WebhookContext };

export interface WebhookOptions {
  /** Called once per payment, after Konnect has confirmed it is paid. */
  onPaid: WebhookCallback<Payment>;
  /** Called on every delivery for a payment that is still pending. */
  onPending?: WebhookCallback<Payment>;
  /** Called on every delivery for a failed or expired payment. */
  onFailed?: WebhookCallback<Payment>;
  /** Where "already handled" is remembered. Default: in memory, per process. */
  store?: IdempotencyStore;
  /** Query parameter carrying the reference. Default `payment_ref`. */
  queryParam?: string;
}

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
  const shared: Parameters<typeof createVerifiedWebhookHandler<Payment>>[0] = {
    lookup: (reference) => client.payments.get(reference),
    keyPrefix: "konnect",
    queryParam: options.queryParam ?? "payment_ref",
    onPaid: options.onPaid,
  };
  if (options.onPending) shared.onPending = options.onPending;
  if (options.onFailed) shared.onFailed = options.onFailed;
  if (options.store) shared.store = options.store;
  return createVerifiedWebhookHandler(shared);
}
