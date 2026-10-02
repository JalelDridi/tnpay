import type { PaymentStatus } from "@tnpay/core";

/** Body of `POST /payments/init-payment`, as documented by Konnect. */
export interface CreatePaymentInput {
  /** In millimes for TND, cents for EUR and USD. Use `tnd()` from @tnpay/core. */
  amount: number;
  /** Defaults to the wallet's currency on Konnect's side. */
  token?: "TND" | "EUR" | "USD";
  /** `immediate` (full payment, the default) or `partial`. */
  type?: "immediate" | "partial";
  /** Shown to the payer on the gateway page. */
  description?: string;
  acceptedPaymentMethods?: ("wallet" | "bank_card" | "e-DINAR")[];
  /** Minutes until the payment link expires. */
  lifespan?: number;
  /** Ask the payer to fill a checkout form before paying. */
  checkoutForm?: boolean;
  /** Add Konnect's fees to the amount the payer sees. Default false. */
  addPaymentFeesToAmount?: boolean;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  /** Your own order identifier; comes back on the payment. */
  orderId?: string;
  /** Konnect calls `GET <webhook>?payment_ref=<ref>` when the status changes. */
  webhook?: string;
  theme?: "light" | "dark";
  /** Overrides the wallet given to the client. */
  receiverWalletId?: string;
}

export interface CreatePaymentResult {
  /** Send the payer here. */
  payUrl: string;
  /** Konnect's reference for the payment. */
  paymentRef: string;
}

/** One attempt by the payer, as Konnect reports it. Fields beyond these pass through. */
export interface KonnectTransaction {
  id?: string;
  status?: string;
  amount?: number;
  method?: string;
  [key: string]: unknown;
}

/** The `payment` object from `GET /payments/:id`. Fields beyond these pass through. */
export interface KonnectPayment {
  id: string;
  status: "completed" | "pending" | (string & {});
  amount: number;
  amountDue?: number;
  reachedAmount?: number;
  token: string;
  convertedAmount?: number;
  exchangeRate?: number;
  expirationDate?: string;
  shortId?: string;
  link?: string;
  webhook?: string;
  orderId?: string;
  type?: string;
  details?: string;
  acceptedPaymentMethods?: string[];
  receiverWallet?: unknown;
  transactions?: KonnectTransaction[];
  [key: string]: unknown;
}

/** A payment as this SDK presents it: the mapped status plus Konnect's object. */
export interface Payment {
  status: PaymentStatus;
  paymentRef: string;
  amount: number;
  currency: string;
  orderId?: string;
  raw: KonnectPayment;
}
