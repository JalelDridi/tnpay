import { ApiError } from "@tnpay/core";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Flouci } from "./client";
import { createFakeFlouci, type FakeFlouci } from "./fake/index";
import type { Payment } from "./types";

/** A merchant endpoint that runs the handler and records what it receives. */
async function merchant(handler?: (request: Request) => Promise<Response>) {
  const hits: string[] = [];
  const responses: { status: number; body: unknown }[] = [];
  const server: Server = createServer(async (req, res) => {
    hits.push(req.url ?? "");
    if (!handler) {
      res.writeHead(200);
      res.end();
      return;
    }
    const response = await handler(
      new Request(`http://127.0.0.1${req.url ?? "/"}`, {
        method: req.method ?? "GET",
      }),
    );
    const text = await response.text();
    responses.push({ status: response.status, body: JSON.parse(text) });
    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(text);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/flouci/webhook`,
    hits,
    responses,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("createFakeFlouci with the client and the webhook handler", () => {
  let fake: FakeFlouci;
  let flouci: Flouci;
  let onPaid: ReturnType<typeof vi.fn<(p: Payment) => Promise<void>>>;
  let onFailed: ReturnType<typeof vi.fn<(p: Payment) => Promise<void>>>;
  let site: Awaited<ReturnType<typeof merchant>>;

  beforeEach(async () => {
    fake = await createFakeFlouci();
    flouci = new Flouci({
      publicKey: fake.publicKey,
      privateKey: fake.privateKey,
      baseUrl: fake.baseUrl,
    });
    onPaid = vi.fn(async () => {});
    onFailed = vi.fn(async () => {});
    site = await merchant(flouci.webhooks.handler({ onPaid, onFailed }));
  });

  afterEach(async () => {
    await site.close();
    await fake.close();
  });

  const create = () =>
    flouci.payments.create({
      amount: 5000,
      successLink: `${site.url}/../ok`,
      failLink: `${site.url}/../ko`,
      webhook: site.url,
      trackingId: "o1",
    });

  it("creates a pending payment with a pay link on the fake", async () => {
    const { payUrl, paymentId } = await create();

    expect(payUrl).toBe(`${fake.origin}/checkout/fake-shop/${paymentId}`);
    const payment = await flouci.payments.get(paymentId);
    expect(payment.status).toBe("pending");
    expect(payment.amount).toBe(5000);
    expect(payment.trackingId).toBe("o1");
  });

  it("pays, fires the webhook with success=True, and onPaid runs once", async () => {
    const { paymentId } = await create();

    await fake.pay(paymentId, { times: 2 });

    expect(site.hits).toEqual([
      `/flouci/webhook?payment_id=${paymentId}&success=True`,
      `/flouci/webhook?payment_id=${paymentId}&success=True`,
    ]);
    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(onPaid.mock.calls[0]?.[0].status).toBe("paid");
    expect(site.responses.map((r) => r.body)).toEqual([
      { ok: true, status: "paid" },
      { ok: true, status: "paid", duplicate: true },
    ]);
  });

  it("ignores success=True in the request when Flouci says otherwise", async () => {
    const { paymentId } = await create();

    await fake.fireWebhook(paymentId, { success: true });

    expect(onPaid).not.toHaveBeenCalled();
    expect(site.responses[0]?.body).toEqual({ ok: true, status: "pending" });
  });

  it("routes failures and expiries to onFailed", async () => {
    const a = await create();
    const b = await create();

    await fake.fail(a.paymentId);
    await fake.expire(b.paymentId);

    expect(onFailed.mock.calls.map((c) => c[0].status)).toEqual([
      "failed",
      "expired",
    ]);
    expect(site.hits[0]).toContain("success=False");
  });

  it("answers 404 for an id Flouci does not know", async () => {
    await fake.fireWebhook("forged", { url: site.url });

    expect(site.responses).toEqual([
      { status: 404, body: { error: "unknown_payment" } },
    ]);
  });

  it("refunds a paid payment once", async () => {
    const { paymentId } = await create();
    await fake.pay(paymentId);

    const refund = await flouci.payments.refund(paymentId);
    expect(refund.paymentId).toBe(paymentId);
    expect(refund.amount).toBe(5000);

    const again = await flouci.payments
      .refund(paymentId)
      .catch((e: unknown) => e);
    expect(again).toBeInstanceOf(ApiError);
    expect((again as ApiError).body).toMatchObject({
      code: "REFUND_NOT_ALLOWED",
    });
  });

  it("rejects wrong keys", async () => {
    const wrong = new Flouci({
      publicKey: "a",
      privateKey: "b",
      baseUrl: fake.baseUrl,
    });

    const error = await wrong.payments.get("x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it("serves a checkout page whose Pay button redirects to the success link", async () => {
    const { payUrl, paymentId } = await create();

    const html = await (await fetch(payUrl)).text();
    expect(html).toContain("Pay</button>");

    const response = await fetch(
      `${fake.origin}/__fake/pay?payment_id=${paymentId}`,
      { method: "POST", redirect: "manual" },
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("payment_id=");
    expect((await flouci.payments.get(paymentId)).status).toBe("paid");
    expect(onPaid).toHaveBeenCalledTimes(1);
  });
});
