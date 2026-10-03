import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import type { KonnectPayment, KonnectTransaction } from "../types";

export interface FakeKonnectOptions {
  /** The key the fake accepts. Default "fake-api-key". */
  apiKey?: string;
  /** Default 0: any free port. */
  port?: number;
  /** Used to deliver webhooks. Default: the global fetch. */
  fetch?: typeof globalThis.fetch;
}

export interface FakeRequest {
  method: string;
  path: string;
  body?: unknown;
}

export interface FakeDelivery {
  url: string;
  status: number;
}

export interface FakeKonnect {
  /** Pass to the client as `baseUrl`. Ends in `/api/v2`. */
  baseUrl: string;
  /** The origin without the API path; `payUrl`s live here. */
  origin: string;
  apiKey: string;
  /** Every API call the fake received. */
  requests: FakeRequest[];
  /** Every webhook the fake delivered, with the response status it got. */
  deliveries: FakeDelivery[];
  /** Marks the payment completed and fires its webhook, `times` times (default 1). */
  pay(paymentRef: string, options?: { times?: number }): Promise<void>;
  /** Records a failed attempt (status stays pending) and fires the webhook. */
  fail(paymentRef: string): Promise<void>;
  /** Moves the expiry into the past and fires the webhook. */
  expire(paymentRef: string): Promise<void>;
  /** Delivers the webhook as Konnect would, to the payment's URL or `url`. Works with unknown refs. */
  fireWebhook(
    paymentRef: string,
    options?: { url?: string; times?: number },
  ): Promise<void>;
  close(): Promise<void>;
}

type Stored = KonnectPayment & { transactions: KonnectTransaction[] };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function page(ref: string, payment: Stored | undefined): string {
  const state = payment?.status ?? "unknown";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake Konnect</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:17px/1.5 system-ui;margin:0;padding:2rem;background:#f4f4f2;color:#1b1b1a}main{max-width:28rem;margin:auto;background:#fff;border-radius:1rem;padding:2rem;box-shadow:0 2px 12px #0001}button{font:inherit;padding:.7rem 1.2rem;border-radius:.6rem;border:1px solid #ccc;background:#fff;cursor:pointer;margin-right:.5rem}button.pay{background:#1b1b1a;color:#fff;border-color:#1b1b1a}code{background:#eee;padding:.1rem .3rem;border-radius:.3rem}</style></head>
<body><main><h1>Fake Konnect</h1><p>This stands in for Konnect's payment page. Payment <code>${ref}</code> is <strong>${state}</strong>${payment ? `, ${payment.amount} ${payment.token}` : ""}.</p>
<form method="post" action="/__fake/pay?payment_ref=${encodeURIComponent(ref)}" style="display:inline"><button class="pay">Pay</button></form>
<form method="post" action="/__fake/fail?payment_ref=${encodeURIComponent(ref)}" style="display:inline"><button>Fail</button></form>
<p style="color:#666;font-size:.9rem">Pressing a button updates the payment and calls the merchant's webhook, exactly as Konnect does.</p></main></body></html>`;
}

/**
 * An in-process Konnect: the three documented endpoints with the documented
 * shapes, plus controls to "pay" and fire webhooks. For tests and local work.
 */
export async function createFakeKonnect(
  options: FakeKonnectOptions = {},
): Promise<FakeKonnect> {
  const apiKey = options.apiKey ?? "fake-api-key";
  const fetch = options.fetch ?? globalThis.fetch;
  const payments = new Map<string, Stored>();
  const requests: FakeRequest[] = [];
  const deliveries: FakeDelivery[] = [];
  let origin = "";

  async function fireWebhook(
    ref: string,
    opts: { url?: string; times?: number } = {},
  ) {
    const url = opts.url ?? payments.get(ref)?.webhook;
    if (!url) return;
    const target = new URL(url);
    target.searchParams.set("payment_ref", ref);
    for (let i = 0; i < (opts.times ?? 1); i++) {
      let status = 0;
      try {
        const response = await fetch(target, { method: "GET" });
        status = response.status;
      } catch {
        status = 0;
      }
      deliveries.push({ url: target.toString(), status });
    }
  }

  async function pay(ref: string, opts: { times?: number } = {}) {
    const payment = payments.get(ref);
    if (!payment) throw new Error(`Fake Konnect: unknown payment ${ref}`);
    payment.status = "completed";
    payment.reachedAmount = payment.amount;
    payment.amountDue = 0;
    payment.successfulTransactions = (payment.successfulTransactions ?? 0) + 1;
    payment.updatedAt = new Date().toISOString();
    payment.transactions.push({
      id: `tx_${randomBytes(6).toString("hex")}`,
      status: "success",
      amount: payment.amount,
      method: "bank_card",
    });
    await fireWebhook(ref, opts);
  }

  async function fail(ref: string) {
    const payment = payments.get(ref);
    if (!payment) throw new Error(`Fake Konnect: unknown payment ${ref}`);
    payment.transactions.push({
      id: `tx_${randomBytes(6).toString("hex")}`,
      status: "failed",
      amount: payment.amount,
      method: "bank_card",
    });
    payment.failedTransactions = (payment.failedTransactions ?? 0) + 1;
    payment.updatedAt = new Date().toISOString();
    await fireWebhook(ref);
  }

  // As the real sandbox does: the status itself becomes "expired".
  async function expire(ref: string) {
    const payment = payments.get(ref);
    if (!payment) throw new Error(`Fake Konnect: unknown payment ${ref}`);
    payment.status = "expired";
    payment.updatedAt = new Date().toISOString();
    await fireWebhook(ref);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", origin);
    const method = req.method ?? "GET";
    const path = url.pathname;

    // Konnect's hosted payment page, reduced to two buttons.
    if (method === "GET" && path === "/pay") {
      const ref = url.searchParams.get("payment_ref") ?? "";
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(ref, payments.get(ref)));
      return;
    }

    // Controls that only the fake has.
    if (method === "POST" && path.startsWith("/__fake/")) {
      const ref = url.searchParams.get("payment_ref") ?? "";
      const action = path.slice("/__fake/".length);
      try {
        if (action === "pay") await pay(ref);
        else if (action === "fail") await fail(ref);
        else if (action === "expire") await expire(ref);
        else return send(res, 404, { error: "unknown control" });
      } catch (error) {
        return send(res, 404, { error: String(error) });
      }
      res.writeHead(303, {
        location: `/pay?payment_ref=${encodeURIComponent(ref)}`,
      });
      res.end();
      return;
    }

    // The API proper.
    const raw = await readBody(req);
    let body: unknown = undefined;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const entry: FakeRequest = { method, path };
    if (body !== undefined) entry.body = body;
    requests.push(entry);

    if (!path.startsWith("/api/v2/"))
      return send(res, 404, { error: "Not found" });
    if (req.headers["x-api-key"] !== apiKey) {
      return send(res, 401, { error: "Unauthorized" });
    }

    if (method === "POST" && path === "/api/v2/payments/init-payment") {
      const input = (body ?? {}) as Record<string, unknown>;
      if (
        typeof input.receiverWalletId !== "string" ||
        !input.receiverWalletId
      ) {
        return send(res, 400, { error: "receiverWalletId is required" });
      }
      if (!Number.isInteger(input.amount) || (input.amount as number) <= 0) {
        return send(res, 400, { error: "amount must be a positive integer" });
      }
      const id = randomBytes(12).toString("hex");
      const payment: Stored = {
        id,
        status: "pending",
        amount: input.amount as number,
        amountDue: input.amount as number,
        reachedAmount: 0,
        token: typeof input.token === "string" ? input.token : "TND",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        failedTransactions: 0,
        successfulTransactions: 0,
        shortId: id.slice(0, 8),
        link: `${origin}/pay?payment_ref=${id}`,
        type: typeof input.type === "string" ? input.type : "immediate",
        acceptedPaymentMethods: Array.isArray(input.acceptedPaymentMethods)
          ? (input.acceptedPaymentMethods as string[])
          : ["wallet", "bank_card", "e-DINAR"],
        receiverWallet: { id: input.receiverWalletId },
        transactions: [],
      };
      if (typeof input.webhook === "string") payment.webhook = input.webhook;
      if (typeof input.orderId === "string") payment.orderId = input.orderId;
      if (typeof input.description === "string")
        payment.details = input.description;
      payments.set(id, payment);
      return send(res, 200, { payUrl: payment.link, paymentRef: id });
    }

    const match = /^\/api\/v2\/payments\/([^/]+)$/.exec(path);
    if (method === "GET" && match) {
      const payment = payments.get(decodeURIComponent(match[1] ?? ""));
      if (!payment) return send(res, 404, { error: "Payment not found" });
      return send(res, 200, { payment });
    }

    send(res, 404, { error: "Not found" });
  });

  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, "127.0.0.1", resolve),
  );
  const { port } = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${port}`;

  return {
    baseUrl: `${origin}/api/v2`,
    origin,
    apiKey,
    requests,
    deliveries,
    pay,
    fail,
    expire,
    fireWebhook,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
