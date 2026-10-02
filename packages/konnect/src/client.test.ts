import { describe, expect, it, vi } from "vitest";
import { Konnect } from "./client.js";

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

const config = { apiKey: "key-123", walletId: "wallet-1" };

describe("Konnect.payments.create", () => {
  it("posts the documented body with the wallet and api key filled in", async () => {
    const { fetch, calls } = stubFetch(200, {
      payUrl: "https://pay.test/?payment_ref=abc",
      paymentRef: "abc",
    });
    const konnect = new Konnect({ ...config, environment: "sandbox", fetch });

    const result = await konnect.payments.create({
      amount: 5000,
      orderId: "order-9",
      webhook: "https://shop.test/hook",
    });

    expect(result).toEqual({
      payUrl: "https://pay.test/?payment_ref=abc",
      paymentRef: "abc",
    });
    expect(calls[0]?.url).toBe(
      "https://api.sandbox.konnect.network/api/v2/payments/init-payment",
    );
    expect(new Headers(calls[0]?.init.headers).get("x-api-key")).toBe(
      "key-123",
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      receiverWalletId: "wallet-1",
      amount: 5000,
      orderId: "order-9",
      webhook: "https://shop.test/hook",
    });
  });

  it("keeps an explicit receiverWalletId", async () => {
    const { fetch, calls } = stubFetch(200, { payUrl: "u", paymentRef: "r" });
    const konnect = new Konnect({ ...config, fetch });

    await konnect.payments.create({ amount: 1, receiverWalletId: "other" });

    expect(JSON.parse(String(calls[0]?.init.body)).receiverWalletId).toBe(
      "other",
    );
  });
});

describe("Konnect.payments.get", () => {
  it("fetches the payment and maps it", async () => {
    const { fetch, calls } = stubFetch(200, {
      payment: {
        id: "abc",
        status: "completed",
        amount: 5000,
        token: "TND",
        orderId: "order-9",
      },
    });
    const konnect = new Konnect({
      ...config,
      environment: "production",
      fetch,
    });

    const payment = await konnect.payments.get("abc");

    expect(calls[0]?.url).toBe(
      "https://api.konnect.network/api/v2/payments/abc",
    );
    expect(payment.status).toBe("paid");
    expect(payment.paymentRef).toBe("abc");
    expect(payment.amount).toBe(5000);
    expect(payment.currency).toBe("TND");
    expect(payment.orderId).toBe("order-9");
    expect(payment.raw.status).toBe("completed");
  });
});

describe("Konnect configuration", () => {
  it("defaults to the sandbox", async () => {
    const { fetch, calls } = stubFetch(200, {
      payment: { id: "x", status: "pending", amount: 1, token: "TND" },
    });
    await new Konnect({ ...config, fetch }).payments.get("x");

    expect(calls[0]?.url).toContain("https://api.sandbox.konnect.network/");
  });

  it("lets a baseUrl override the environment", async () => {
    const { fetch, calls } = stubFetch(200, {
      payment: { id: "x", status: "pending", amount: 1, token: "TND" },
    });
    await new Konnect({
      ...config,
      environment: "production",
      baseUrl: "http://127.0.0.1:7320/api/v2",
      fetch,
    }).payments.get("x");

    expect(calls[0]?.url).toBe("http://127.0.0.1:7320/api/v2/payments/x");
  });

  it("refuses to start without credentials", () => {
    expect(() => new Konnect({ apiKey: "", walletId: "w" })).toThrow(/apiKey/);
    expect(() => new Konnect({ apiKey: "k", walletId: "" })).toThrow(
      /walletId/,
    );
  });
});
