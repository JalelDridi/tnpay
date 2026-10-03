import type { PaymentStatus } from "@tnpay/core";
import type { FlouciStatus } from "./types";

/**
 * Flouci's six statuses onto the SDK's four. A pre-authorisation that has
 * not been captured is still pending from the merchant's point of view.
 */
export function mapStatus(status: FlouciStatus): PaymentStatus {
  switch (String(status).toUpperCase()) {
    case "SUCCESS":
      return "paid";
    case "EXPIRED":
      return "expired";
    case "FAILURE":
    case "SYSTEM_FAILURE":
      return "failed";
    case "PENDING":
    case "PREAUTH_SUCCESS":
    default:
      return "pending";
  }
}
