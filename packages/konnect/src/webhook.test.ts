import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Konnect } from "./client";
import { createFakeKonnect, type FakeKonnect } from "./fake/index";
import type { Payment } from "./types";

/**
 * Runs the handler behind a real HTTP server, the way a merchant would, so
 * the fake's deliveries go through the network like Konnect's do.
 */
async function serve(handler: (request: Request) => Promise<Response>) {
  const responses: { status: number; body: unknown }[] = [];
  const server: Server = createServer(async (req, res) => {
    const url = `http://127.0.0.1${req.url ?? "/"}`;
    const response = await handler(
      new Request(url, { method: req.method ?? "GET" }),
    );
    const text = await response.text();
    responses.push({ status: response.status, body: JSON.parse(text) });
    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(text);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/konnect/webhook`,
    responses,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe("webhook handler", () => {
  let fake: FakeKonnect;
  let konnect: Konnect;
  let onPaid: ReturnType<typeof vi.fn<(p: Payment) => Promise<void>>>;
  let onPending: ReturnType<typeof vi.fn<(p: Payment) => Promise<void>>>;
  let onFailed: ReturnType<typeof vi.fn<(p: Payment) => Promise<void>>>;
  let site: Awaited<ReturnType<typeof serve>>;

  beforeEach(async () => {
    fake = await createFakeKonnect();
    konnect = new Konnect({
      apiKey: fake.apiKey,
      walletId: "wallet-1",
      baseUrl: fake.baseUrl,
    });
    onPaid = vi.fn(async () => {});
    onPending = vi.fn(async () => {});
    onFailed = vi.fn(async () => {});
    site = await serve(
      konnect.webhooks.handler({ onPaid, onPending, onFailed }),
    );
  });

  afterEach(async () => {
    await site.close();
    await fake.close();
  });

  const create = () =>
    konnect.payments.create({ amount: 5000, orderId: "o1", webhook: site.url });

  it("answers 400 when the reference is missing", async () => {
    const response = await fetch(site.url);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "missing_payment_ref" });
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("answers 404 for a reference Konnect does not know", async () => {
    await fake.fireWebhook("6ac11e8ad1f77a6d50d6ad00", { url: site.url });

    expect(site.responses).toEqual([
      { status: 404, body: { error: "unknown_payment" } },
    ]);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("answers 400 for a malformed reference without calling Konnect", async () => {
    const before = fake.requests.length;

    await fake.fireWebhook("forged", { url: site.url });

    expect(site.responses).toEqual([
      { status: 400, body: { error: "invalid_payment_ref" } },
    ]);
    expect(fake.requests.length).toBe(before);
  });

  it("calls onPaid once with the verified payment", async () => {
    const { paymentRef } = await create();

    await fake.pay(paymentRef);

    expect(onPaid).toHaveBeenCalledTimes(1);
    const payment = onPaid.mock.calls[0]?.[0];
    expect(payment?.status).toBe("paid");
    expect(payment?.paymentRef).toBe(paymentRef);
    expect(payment?.orderId).toBe("o1");
    expect(site.responses).toEqual([
      { status: 200, body: { ok: true, status: "paid" } },
    ]);
  });

  it("applies a webhook delivered twice only once", async () => {
    const { paymentRef } = await create();

    await fake.pay(paymentRef, { times: 2 });

    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(site.responses.map((r) => r.body)).toEqual([
      { ok: true, status: "paid" },
      { ok: true, status: "paid", duplicate: true },
    ]);
  });

  it("answers 500 when onPaid throws, and lets the next delivery retry", async () => {
    onPaid.mockRejectedValueOnce(new Error("database down"));
    const { paymentRef } = await create();

    await fake.pay(paymentRef);
    await fake.fireWebhook(paymentRef);

    expect(onPaid).toHaveBeenCalledTimes(2);
    expect(site.responses.map((r) => r.status)).toEqual([500, 200]);
  });

  it("reports pending without calling onPaid", async () => {
    const { paymentRef } = await create();

    await fake.fireWebhook(paymentRef);

    expect(onPending).toHaveBeenCalledTimes(1);
    expect(onPaid).not.toHaveBeenCalled();
    expect(site.responses[0]?.body).toEqual({ ok: true, status: "pending" });
  });

  it("routes failed and expired payments to onFailed", async () => {
    const a = await create();
    const b = await create();

    await fake.fail(a.paymentRef);
    await fake.expire(b.paymentRef);

    expect(onFailed).toHaveBeenCalledTimes(2);
    expect(onFailed.mock.calls.map((c) => c[0].status)).toEqual([
      "failed",
      "expired",
    ]);
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("answers 502 when Konnect cannot be reached", async () => {
    const { paymentRef } = await create();
    await fake.close();

    const response = await fetch(`${site.url}?payment_ref=${paymentRef}`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "NetworkError" });
    // Re-open so afterEach can close it cleanly.
    fake = await createFakeKonnect();
  });

  it("can read the reference from a custom query parameter", async () => {
    const custom = await serve(
      konnect.webhooks.handler({ onPaid, queryParam: "ref" }),
    );
    const { paymentRef } = await konnect.payments.create({ amount: 100 });
    await fake.pay(paymentRef);

    await fetch(`${custom.url}?ref=${paymentRef}`);

    expect(onPaid).toHaveBeenCalledTimes(1);
    await custom.close();
  });
});
