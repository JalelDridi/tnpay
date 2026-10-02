import type { PaymentStatus } from "@tnpay/core";
import type { KonnectPayment } from "./types.js";

/**
 * Transaction statuses that mean the payer's attempt did not go through.
 * Konnect's docs only show `success`; the failure names were observed in the
 * sandbox and are matched case-insensitively, so a new spelling still works.
 */
const FAILED_STATUSES = new Set(["failed", "failure", "declined", "error"]);

/** Reduces Konnect's payment object to the four states the SDK exposes. */
export function mapStatus(
  raw: KonnectPayment,
  now = new Date(),
): PaymentStatus {
  if (raw.status === "completed") return "paid";

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
