import { ApiError, createHttp, type Http } from "@tnpay/core";
import { mapStatus } from "./status";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  FlouciPayment,
  Payment,
  RefundResult,
} from "./types";
import { createWebhookHandler, type WebhookOptions } from "./webhook";

/** Sandbox and production share the URL; only the keys differ. */
export const BASE_URL = "https://developers.flouci.com/api/v2";

export interface FlouciOptions {
  /** The app's public token, from the Flouci dashboard. */
  publicKey: string;
  /** The app's private token. Backend only; never commit it. */
  privateKey: string;
  /** Overrides the API URL; used to point at the fake server. */
  baseUrl?: string;
  /** Per-request timeout. Default 10 seconds. */
  timeoutMs?: number;
  /** Injected for tests and custom agents. */
  fetch?: typeof globalThis.fetch;
}

type GenerateResponse = {
  result?: {
    success?: boolean;
    payment_id?: string;
    link?: string;
    developer_tracking_id?: string;
    status?: number;
    message?: string;
  };
};

type VerifyResponse = {
  success?: boolean;
  result?: FlouciPayment | { status?: number; message?: string };
  status_code?: number;
};

type RefundResponse = {
  result?: {
    refund_id?: string;
    payment_id?: string;
    amount?: string | number;
    status?: string;
    refunded_at?: string;
  };
  status?: string;
  message?: string;
  code?: string;
};

/** Turns Flouci's verify result into the SDK's Payment. */
export function toPayment(paymentId: string, raw: FlouciPayment): Payment {
  const payment: Payment = {
    status: mapStatus(raw.status),
    paymentId,
    amount: raw.amount,
    currency: "TND",
    raw,
  };
  if (typeof raw.developer_tracking_id === "string") {
    payment.trackingId = raw.developer_tracking_id;
  }
  return payment;
}

export class Flouci {
  private readonly http: Http;
  private readonly baseUrl: string;

  constructor(options: FlouciOptions) {
    if (!options.publicKey) throw new Error("Flouci: publicKey is required");
    if (!options.privateKey) throw new Error("Flouci: privateKey is required");
    this.baseUrl = options.baseUrl ?? BASE_URL;
    const httpOptions: Parameters<typeof createHttp>[0] = {
      baseUrl: this.baseUrl,
      headers: {
        authorization: `Bearer ${options.publicKey}:${options.privateKey}`,
      },
    };
    if (options.timeoutMs !== undefined)
      httpOptions.timeoutMs = options.timeoutMs;
    if (options.fetch !== undefined) httpOptions.fetch = options.fetch;
    this.http = createHttp(httpOptions);
  }

  readonly payments = {
    /** Creates a payment and returns where to send the payer. */
    create: async (input: CreatePaymentInput): Promise<CreatePaymentResult> => {
      // Flouci documents the amount as a string of millimes.
      const body: Record<string, unknown> = {
        amount: String(input.amount),
        success_link: input.successLink,
        fail_link: input.failLink,
      };
      if (input.webhook !== undefined) body.webhook = input.webhook;
      if (input.trackingId !== undefined)
        body.developer_tracking_id = input.trackingId;
      if (input.sessionTimeoutSecs !== undefined)
        body.session_timeout_secs = input.sessionTimeoutSecs;
      if (input.acceptCard !== undefined) body.accept_card = input.acceptCard;
      if (input.imageUrl !== undefined) body.image_url = input.imageUrl;

      const response = await this.http.post<GenerateResponse>(
        "/generate_payment",
        body,
      );
      const result = response.result;
      if (!result?.success || !result.payment_id || !result.link) {
        // Flouci can answer 200 with { result: { status: 400, message } }.
        throw new ApiError(
          result?.status ?? 502,
          response,
          `${this.baseUrl}/generate_payment`,
        );
      }
      return { payUrl: result.link, paymentId: result.payment_id };
    },

    /** Reads the payment back from Flouci. The only trustworthy source of its status. */
    get: async (paymentId: string): Promise<Payment> => {
      const path = `/verify_payment/${encodeURIComponent(paymentId)}`;
      const response = await this.http.get<VerifyResponse>(path);
      if (
        !response.success ||
        !response.result ||
        !("status" in response.result)
      ) {
        const failure = response.result as
          { status?: number; message?: string } | undefined;
        throw new ApiError(
          failure?.status ?? response.status_code ?? 502,
          response,
          `${this.baseUrl}${path}`,
        );
      }
      return toPayment(paymentId, response.result as FlouciPayment);
    },

    /** Refunds a completed payment to the payer's original payment method. */
    refund: async (paymentId: string): Promise<RefundResult> => {
      const response = await this.http.post<RefundResponse>("/refund_payment", {
        payment_id: paymentId,
      });
      const result = response.result;
      if (response.status === "error" || !result?.refund_id) {
        throw new ApiError(422, response, `${this.baseUrl}/refund_payment`);
      }
      const refund: RefundResult = {
        refundId: result.refund_id,
        paymentId: result.payment_id ?? paymentId,
        amount: Number(result.amount ?? 0),
        status: result.status ?? "success",
        raw: response,
      };
      if (result.refunded_at) refund.refundedAt = result.refunded_at;
      return refund;
    },
  };

  readonly webhooks = {
    /** A `Request => Response` function that verifies with Flouci before calling you. */
    handler: (options: WebhookOptions) => createWebhookHandler(this, options),
  };
}
