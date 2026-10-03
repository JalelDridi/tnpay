import {
  createVerifiedWebhookHandler,
  type IdempotencyStore,
  type WebhookCallback,
  type WebhookContext,
} from "@tnpay/core";
import type { Flouci } from "./client";
import type { Payment } from "./types";

export type { WebhookContext };

export interface WebhookOptions {
  /** Called once per payment, after Flouci has confirmed it is paid. */
  onPaid: WebhookCallback<Payment>;
  /** Called on every delivery for a payment that is still pending. */
  onPending?: WebhookCallback<Payment>;
  /** Called on every delivery for a failed or expired payment. */
  onFailed?: WebhookCallback<Payment>;
  /** Where "already handled" is remembered. Default: in memory, per process. */
  store?: IdempotencyStore;
  /** Query parameter carrying the id. Default `payment_id`. */
  queryParam?: string;
}

/**
 * Flouci's webhook is `GET ?payment_id=…&success=True|False`, unsigned. The
 * `success` flag is ignored on purpose: the handler asks Flouci for the
 * payment and acts on that. `onPaid` runs once per payment.
 */
export function createWebhookHandler(
  client: Flouci,
  options: WebhookOptions,
): (request: Request) => Promise<Response> {
  const shared: Parameters<typeof createVerifiedWebhookHandler<Payment>>[0] = {
    lookup: (reference) => client.payments.get(reference),
    keyPrefix: "flouci",
    queryParam: options.queryParam ?? "payment_id",
    onPaid: options.onPaid,
  };
  if (options.onPending) shared.onPending = options.onPending;
  if (options.onFailed) shared.onFailed = options.onFailed;
  if (options.store) shared.store = options.store;
  return createVerifiedWebhookHandler(shared);
}
