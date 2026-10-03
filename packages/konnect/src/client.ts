import { ApiError, createHttp, type Http } from "@tnpay/core";
import { mapStatus } from "./status";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  KonnectPayment,
  Payment,
} from "./types";
import { createWebhookHandler, type WebhookOptions } from "./webhook";

export const BASE_URLS = {
  sandbox: "https://api.sandbox.konnect.network/api/v2",
  production: "https://api.konnect.network/api/v2",
} as const;

export interface KonnectOptions {
  /** From the Konnect dashboard. Never commit it. */
  apiKey: string;
  /** The wallet that receives payments. */
  walletId: string;
  /** Default `sandbox`, so nothing real moves until you say so. */
  environment?: keyof typeof BASE_URLS;
  /** Overrides the environment's URL; used to point at the fake server. */
  baseUrl?: string;
  /** Per-request timeout. Default 10 seconds. */
  timeoutMs?: number;
  /** Injected for tests and custom agents. */
  fetch?: typeof globalThis.fetch;
}

/** Turns Konnect's response into the SDK's Payment. */
export function toPayment(raw: KonnectPayment): Payment {
  const payment: Payment = {
    status: mapStatus(raw),
    paymentRef: raw.id,
    amount: raw.amount,
    currency: raw.token,
    raw,
  };
  if (raw.orderId !== undefined) payment.orderId = raw.orderId;
  return payment;
}

/** Konnect references are 24 hex characters. Anything else makes its API answer 500. */
export const isPaymentRef = (value: string) => /^[0-9a-f]{24}$/i.test(value);

export class Konnect {
  readonly walletId: string;
  readonly baseUrl: string;
  private readonly http: Http;

  constructor(options: KonnectOptions) {
    if (!options.apiKey) throw new Error("Konnect: apiKey is required");
    if (!options.walletId) throw new Error("Konnect: walletId is required");
    this.walletId = options.walletId;
    this.baseUrl =
      options.baseUrl ?? BASE_URLS[options.environment ?? "sandbox"];
    const httpOptions: Parameters<typeof createHttp>[0] = {
      baseUrl: this.baseUrl,
      headers: { "x-api-key": options.apiKey },
    };
    if (options.timeoutMs !== undefined)
      httpOptions.timeoutMs = options.timeoutMs;
    if (options.fetch !== undefined) httpOptions.fetch = options.fetch;
    this.http = createHttp(httpOptions);
  }

  readonly payments = {
    /** Creates a payment and returns where to send the payer. */
    create: async (input: CreatePaymentInput): Promise<CreatePaymentResult> => {
      const body = { receiverWalletId: this.walletId, ...input };
      const result = await this.http.post<CreatePaymentResult>(
        "/payments/init-payment",
        body,
      );
      return { payUrl: result.payUrl, paymentRef: result.paymentRef };
    },

    /** Reads the payment back from Konnect. The only trustworthy source of its status. */
    get: async (paymentRef: string): Promise<Payment> => {
      const path = `/payments/${encodeURIComponent(paymentRef)}`;
      // Refuse locally what Konnect would answer 500 to (and we would retry).
      if (!isPaymentRef(paymentRef)) {
        throw new ApiError(
          404,
          { error: "malformed payment reference" },
          `${this.baseUrl}${path}`,
        );
      }
      const result = await this.http.get<{ payment: KonnectPayment }>(
        `/payments/${encodeURIComponent(paymentRef)}`,
      );
      return toPayment(result.payment);
    },
  };

  readonly webhooks = {
    /** A `Request => Response` function that verifies with Konnect before calling you. */
    handler: (options: WebhookOptions) => createWebhookHandler(this, options),
  };
}
