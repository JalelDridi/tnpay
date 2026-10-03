import type { PaymentStatus } from "@tnpay/core";
import type { KonnectPayment } from "./types";

/**
 * Transaction statuses that mean the payer's attempt did not go through.
 * Matched case-insensitively, so a new spelling still works.
 */
const FAILED_STATUSES = new Set(["failed", "failure", "declined", "error"]);

/**
 * Reduces Konnect's payment object to the four states the SDK exposes.
 * Observed in the sandbox: Konnect itself moves `status` from `pending` to
 * `expired` once the lifespan has passed (there is no expirationDate field,
 * whatever the docs say), and to `completed` when paid.
 */
export function mapStatus(
  raw: KonnectPayment,
  now = new Date(),
): PaymentStatus {
  switch (String(raw.status).toLowerCase()) {
    case "completed":
    case "paid":
      return "paid";
    case "expired":
      return "expired";
    case "failed":
    case "canceled":
    case "cancelled":
      return "failed";
  }

  // Defensive: honour an expiry date if Konnect ever sends one.
  if (raw.expirationDate) {
    const expiry = Date.parse(raw.expirationDate);
    if (!Number.isNaN(expiry) && expiry < now.getTime()) return "expired";
  }

  const last = raw.transactions?.at(-1);
  if (last?.status && FAILED_STATUSES.has(String(last.status).toLowerCase())) {
    return "failed";
  }

  return "pending";
}
