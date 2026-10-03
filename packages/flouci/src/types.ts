import type { PaymentStatus } from "@tnpay/core";

/** What you pass to `payments.create`. Sent to Flouci as `POST /generate_payment`. */
export interface CreatePaymentInput {
  /** In millimes. Use `tnd()` from @tnpay/core. */
  amount: number;
  /** Where Flouci sends the payer after a successful payment. */
  successLink: string;
  /** Where Flouci sends the payer after a failed payment. */
  failLink: string;
  /** Flouci calls `GET <webhook>?payment_id=<id>&success=True|False` when the payment completes. */
  webhook?: string;
  /** Your own reference. Flouci stores it and returns it, unchecked. */
  trackingId?: string;
  /** Payment session lifetime. Flouci's default is 1200 seconds. */
  sessionTimeoutSecs?: number;
  /** Accept bank cards as well as the Flouci wallet. Flouci's default is false. */
  acceptCard?: boolean;
  /** Image shown on the payment page. Defaults to the merchant's image. */
  imageUrl?: string;
}

export interface CreatePaymentResult {
  /** Send the payer here. */
  payUrl: string;
  /** Flouci's id for the payment. */
  paymentId: string;
}

/** Flouci's own statuses, as returned by `verify_payment`. */
export type FlouciStatus =
  | "SUCCESS"
  | "PENDING"
  | "EXPIRED"
  | "FAILURE"
  | "PREAUTH_SUCCESS"
  | "SYSTEM_FAILURE"
  | (string & {});

/** The `result` object of `GET /verify_payment/:id`. Fields beyond these pass through. */
export interface FlouciPayment {
  /** `card`, `wallet`, `mpayment` or `NA`. */
  type: string;
  /** In millimes. */
  amount: number;
  status: FlouciStatus;
  /** Buyer information; its shape depends on `type`. */
  details?: Record<string, unknown>;
  developer_tracking_id?: string | null;
  /** Where the money sits: PROCESSING, AVAILABLE, IN_PAYOUT, PAID or NOT_APPLICABLE. */
  settlement_status?: string;
  [key: string]: unknown;
}

/** A payment as this SDK presents it: the mapped status plus Flouci's object. */
export interface Payment {
  status: PaymentStatus;
  paymentId: string;
  amount: number;
  currency: "TND";
  trackingId?: string;
  raw: FlouciPayment;
}

export interface RefundResult {
  refundId: string;
  paymentId: string;
  amount: number;
  status: string;
  refundedAt?: string;
  raw: unknown;
}
