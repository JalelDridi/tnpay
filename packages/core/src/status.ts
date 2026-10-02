/**
 * The four states every gateway's payment is mapped to. The gateway's own
 * object is always exposed next to it, so nothing is lost in the mapping.
 */
export type PaymentStatus = "pending" | "paid" | "failed" | "expired";
