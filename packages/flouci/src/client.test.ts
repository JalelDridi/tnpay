import { ApiError } from "@tnpay/core";
import { describe, expect, it, vi } from "vitest";
import { Flouci } from "./client";

function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

const keys = { publicKey: "pub", privateKey: "priv" };

describe("Flouci.payments.create", () => {
  it("posts Flouci's snake_case body with the bearer pair", async () => {
    const { fetch, calls } = stubFetch(200, {
      result: {
        success: true,
        payment_id: "AgCKuBm0",
        link: "https://checkout.flouci.com/shop/AgCKuBm0",
        developer_tracking_id: "order-7",
      },
    });
    const flouci = new Flouci({ ...keys, fetch });

    const result = await flouci.payments.create({
      amount: 40300,
      successLink: "https://shop.test/ok",
      failLink: "https://shop.test/ko",
      webhook: "https://shop.test/hook",
      trackingId: "order-7",
      acceptCard: true,
    });

    expect(result).toEqual({
      payUrl: "https://checkout.flouci.com/shop/AgCKuBm0",
      paymentId: "AgCKuBm0",
    });
    expect(calls[0]?.url).toBe(
      "https://developers.flouci.com/api/v2/generate_payment",
    );
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(
      "Bearer pub:priv",
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      amount: "40300",
      success_link: "https://shop.test/ok",
      fail_link: "https://shop.test/ko",
      webhook: "https://shop.test/hook",
      developer_tracking_id: "order-7",
      accept_card: true,
    });
  });

  it("turns Flouci's 200-with-an-error into an ApiError", async () => {
    const { fetch } = stubFetch(200, {
      result: { status: 400, message: "Bad Request" },
    });
    const flouci = new Flouci({ ...keys, fetch });

    const error = await flouci.payments
      .create({ amount: 1, successLink: "a", failLink: "b" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  });
});

describe("Flouci.payments.get", () => {
  it("verifies the payment and maps it", async () => {
    const { fetch, calls } = stubFetch(200, {
      success: true,
      result: {
        type: "wallet",
        amount: 1250,
        status: "SUCCESS",
        details: { name: "FOULEN BEN FOULEN" },
        developer_tracking_id: "order-7",
        settlement_status: "AVAILABLE",
      },
      status_code: 200,
    });
    const flouci = new Flouci({ ...keys, fetch });

    const payment = await flouci.payments.get("AgCKuBm0");

    expect(calls[0]?.url).toBe(
      "https://developers.flouci.com/api/v2/verify_payment/AgCKuBm0",
    );
    expect(payment.status).toBe("paid");
    expect(payment.paymentId).toBe("AgCKuBm0");
    expect(payment.amount).toBe(1250);
    expect(payment.currency).toBe("TND");
    expect(payment.trackingId).toBe("order-7");
    expect(payment.raw.settlement_status).toBe("AVAILABLE");
  });

  it("reports an unknown payment as a 404 ApiError", async () => {
    const { fetch } = stubFetch(404, {
      result: { status: 404, message: "Payment not found" },
    });
    const flouci = new Flouci({ ...keys, fetch });

    const error = await flouci.payments.get("nope").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
  });

  it("treats success:false as an error even on a 200", async () => {
    const { fetch } = stubFetch(200, {
      success: false,
      result: { status: 403, message: "Forbidden" },
    });
    const flouci = new Flouci({ ...keys, fetch });

    const error = await flouci.payments.get("x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
  });
});

describe("Flouci configuration", () => {
  it("lets a baseUrl override the default", async () => {
    const { fetch, calls } = stubFetch(200, {
      success: true,
      result: { type: "NA", amount: 1, status: "PENDING" },
    });
    await new Flouci({
      ...keys,
      baseUrl: "http://127.0.0.1:7321/api/v2",
      fetch,
    }).payments.get("x");

    expect(calls[0]?.url).toBe("http://127.0.0.1:7321/api/v2/verify_payment/x");
  });

  it("refuses to start without both keys", () => {
    expect(() => new Flouci({ publicKey: "", privateKey: "p" })).toThrow(
      /publicKey/,
    );
    expect(() => new Flouci({ publicKey: "p", privateKey: "" })).toThrow(
      /privateKey/,
    );
  });
});
