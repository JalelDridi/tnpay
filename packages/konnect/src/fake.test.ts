import { ApiError } from "@tnpay/core";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Konnect } from "./client";
import { createFakeKonnect, type FakeKonnect } from "./fake/index";

/** A merchant endpoint that records the webhook calls it receives. */
async function receiver() {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(req.url ?? "");
    res.writeHead(200);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/hook`,
    hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("createFakeKonnect", () => {
  let fake: FakeKonnect;
  let hook: Awaited<ReturnType<typeof receiver>>;
  let konnect: Konnect;

  beforeEach(async () => {
    fake = await createFakeKonnect();
    hook = await receiver();
    konnect = new Konnect({
      apiKey: fake.apiKey,
      walletId: "wallet-1",
      baseUrl: fake.baseUrl,
    });
  });

  afterEach(async () => {
    await fake.close();
    await hook.close();
  });

  it("creates a pending payment with a payUrl on the fake", async () => {
    const { payUrl, paymentRef } = await konnect.payments.create({
      amount: 5000,
      orderId: "o1",
      webhook: hook.url,
    });

    expect(payUrl).toBe(`${fake.origin}/pay?payment_ref=${paymentRef}`);
    const payment = await konnect.payments.get(paymentRef);
    expect(payment.status).toBe("pending");
    expect(payment.amount).toBe(5000);
    expect(payment.orderId).toBe("o1");
    expect(payment.raw.webhook).toBe(hook.url);
  });

  it("marks a payment paid and fires the webhook once", async () => {
    const { paymentRef } = await konnect.payments.create({
      amount: 5000,
      webhook: hook.url,
    });

    await fake.pay(paymentRef);

    expect((await konnect.payments.get(paymentRef)).status).toBe("paid");
    expect(hook.hits).toEqual([`/hook?payment_ref=${paymentRef}`]);
    expect(fake.deliveries).toEqual([
      { url: `${hook.url}?payment_ref=${paymentRef}`, status: 200 },
    ]);
  });

  it("can deliver the same webhook twice", async () => {
    const { paymentRef } = await konnect.payments.create({
      amount: 100,
      webhook: hook.url,
    });

    await fake.pay(paymentRef, { times: 2 });

    expect(hook.hits).toHaveLength(2);
  });

  it("records a failed attempt and an expiry", async () => {
    const a = await konnect.payments.create({ amount: 100, webhook: hook.url });
    const b = await konnect.payments.create({ amount: 100, webhook: hook.url });

    await fake.fail(a.paymentRef);
    await fake.expire(b.paymentRef);

    expect((await konnect.payments.get(a.paymentRef)).status).toBe("failed");
    expect((await konnect.payments.get(b.paymentRef)).status).toBe("expired");
    expect(hook.hits).toHaveLength(2);
  });

  it("rejects a wrong api key and an unknown payment", async () => {
    const wrong = new Konnect({
      apiKey: "nope",
      walletId: "w",
      baseUrl: fake.baseUrl,
    });

    const unauthorized = await wrong.payments
      .get("6ac11e8ad1f77a6d50d6ad01")
      .catch((e: unknown) => e);
    expect(unauthorized).toBeInstanceOf(ApiError);
    expect((unauthorized as ApiError).status).toBe(401);

    const missing = await konnect.payments
      .get("does-not-exist")
      .catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(ApiError);
    expect((missing as ApiError).status).toBe(404);
  });

  it("validates the create body like Konnect would", async () => {
    const bad = await konnect.payments
      .create({ amount: 12.5 })
      .catch((e: unknown) => e);

    expect(bad).toBeInstanceOf(ApiError);
    expect((bad as ApiError).status).toBe(400);
  });

  it("serves a payment page with Pay and Fail buttons", async () => {
    const { payUrl, paymentRef } = await konnect.payments.create({
      amount: 100,
      webhook: hook.url,
    });

    const html = await (await fetch(payUrl)).text();
    expect(html).toContain("Pay</button>");
    expect(html).toContain("Fail</button>");

    // Pressing Pay is a form post that redirects back to the page.
    const response = await fetch(
      `${fake.origin}/__fake/pay?payment_ref=${paymentRef}`,
      { method: "POST", redirect: "manual" },
    );
    expect(response.status).toBe(303);
    expect((await konnect.payments.get(paymentRef)).status).toBe("paid");
    expect(hook.hits).toHaveLength(1);
  });
});
