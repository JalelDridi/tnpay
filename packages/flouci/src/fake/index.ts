import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { randomBytes } from "node:crypto";
import type { FlouciPayment, FlouciStatus } from "../types";

export interface FakeFlouciOptions {
  /** The public key the fake accepts. Default "fake-public". */
  publicKey?: string;
  /** The private key the fake accepts. Default "fake-private". */
  privateKey?: string;
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

export interface FakeFlouci {
  /** Pass to the client as `baseUrl`. Ends in `/api/v2`. */
  baseUrl: string;
  /** The origin without the API path; pay links live here. */
  origin: string;
  publicKey: string;
  privateKey: string;
  /** Every API call the fake received. */
  requests: FakeRequest[];
  /** Every webhook the fake delivered, with the response status it got. */
  deliveries: FakeDelivery[];
  /** Marks the payment SUCCESS and fires its webhook, `times` times (default 1). */
  pay(paymentId: string, options?: { times?: number }): Promise<void>;
  /** Marks the payment FAILURE and fires the webhook with success=False. */
  fail(paymentId: string): Promise<void>;
  /** Marks the payment EXPIRED and fires the webhook with success=False. */
  expire(paymentId: string): Promise<void>;
  /** Delivers the webhook as Flouci would. Works with unknown ids. */
  fireWebhook(
    paymentId: string,
    options?: { url?: string; times?: number; success?: boolean },
  ): Promise<void>;
  close(): Promise<void>;
}

type Stored = {
  id: string;
  payment: FlouciPayment;
  webhook?: string;
  successLink: string;
  failLink: string;
  refunded: boolean;
};

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

function page(id: string, stored: Stored | undefined): string {
  const state = stored?.payment.status ?? "unknown";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fake Flouci</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:17px/1.5 system-ui;margin:0;padding:2rem;background:#f3f4f8;color:#14171f}main{max-width:28rem;margin:auto;background:#fff;border-radius:1rem;padding:2rem;box-shadow:0 2px 12px #0001}button{font:inherit;padding:.7rem 1.2rem;border-radius:.6rem;border:1px solid #ccc;background:#fff;cursor:pointer;margin-right:.5rem}button.pay{background:#1d4ed8;color:#fff;border-color:#1d4ed8}code{background:#eee;padding:.1rem .3rem;border-radius:.3rem}</style></head>
<body><main><h1>Fake Flouci</h1><p>This stands in for Flouci's checkout page. Payment <code>${id}</code> is <strong>${state}</strong>${stored ? `, ${stored.payment.amount} millimes` : ""}.</p>
<form method="post" action="/__fake/pay?payment_id=${encodeURIComponent(id)}" style="display:inline"><button class="pay">Pay</button></form>
<form method="post" action="/__fake/fail?payment_id=${encodeURIComponent(id)}" style="display:inline"><button>Fail</button></form>
<p style="color:#666;font-size:.9rem">Pressing a button updates the payment, calls the merchant's webhook as Flouci does, then follows the success or fail link.</p></main></body></html>`;
}

/**
 * An in-process Flouci: generate, verify and refund with the documented
 * shapes, plus controls to "pay" and fire webhooks. For tests and local work.
 */
export async function createFakeFlouci(
  options: FakeFlouciOptions = {},
): Promise<FakeFlouci> {
  const publicKey = options.publicKey ?? "fake-public";
  const privateKey = options.privateKey ?? "fake-private";
  const fetch = options.fetch ?? globalThis.fetch;
  const payments = new Map<string, Stored>();
  const requests: FakeRequest[] = [];
  const deliveries: FakeDelivery[] = [];
  let origin = "";

  async function fireWebhook(
    id: string,
    opts: { url?: string; times?: number; success?: boolean } = {},
  ) {
    const url = opts.url ?? payments.get(id)?.webhook;
    if (!url) return;
    const target = new URL(url);
    target.searchParams.set("payment_id", id);
    target.searchParams.set(
      "success",
      opts.success === false ? "False" : "True",
    );
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

  function setStatus(id: string, status: FlouciStatus) {
    const stored = payments.get(id);
    if (!stored) throw new Error(`Fake Flouci: unknown payment ${id}`);
    stored.payment.status = status;
    stored.payment.settlement_status =
      status === "SUCCESS" ? "AVAILABLE" : "NOT_APPLICABLE";
    if (status === "SUCCESS") {
      stored.payment.type = "card";
      stored.payment.details = {
        name: "FOULEN BEN FOULEN",
        approval_code: randomBytes(3).toString("hex"),
      };
    }
    return stored;
  }

  async function pay(id: string, opts: { times?: number } = {}) {
    setStatus(id, "SUCCESS");
    await fireWebhook(id, { ...opts, success: true });
  }

  async function fail(id: string) {
    setStatus(id, "FAILURE");
    await fireWebhook(id, { success: false });
  }

  async function expire(id: string) {
    setStatus(id, "EXPIRED");
    await fireWebhook(id, { success: false });
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", origin);
    const method = req.method ?? "GET";
    const path = url.pathname;

    // Flouci's hosted checkout page, reduced to two buttons.
    if (method === "GET" && path.startsWith("/checkout/")) {
      const id = path.split("/").at(-1) ?? "";
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(page(id, payments.get(id)));
      return;
    }

    // Controls that only the fake has. After paying, Flouci redirects the payer.
    if (method === "POST" && path.startsWith("/__fake/")) {
      const id = url.searchParams.get("payment_id") ?? "";
      const action = path.slice("/__fake/".length);
      try {
        if (action === "pay") await pay(id);
        else if (action === "fail") await fail(id);
        else if (action === "expire") await expire(id);
        else return send(res, 404, { error: "unknown control" });
      } catch (error) {
        return send(res, 404, { error: String(error) });
      }
      const stored = payments.get(id);
      const back = action === "pay" ? stored?.successLink : stored?.failLink;
      const location = new URL(back ?? `/checkout/${id}`, origin);
      location.searchParams.set("payment_id", id);
      res.writeHead(303, { location: location.toString() });
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
    if (req.headers.authorization !== `Bearer ${publicKey}:${privateKey}`) {
      return send(res, 401, {
        result: { status: 401, message: "Unauthorized" },
      });
    }

    if (method === "POST" && path === "/api/v2/generate_payment") {
      const input = (body ?? {}) as Record<string, unknown>;
      const amount = Number(input.amount);
      if (!Number.isInteger(amount) || amount <= 0) {
        return send(res, 200, {
          result: { status: 400, message: "Bad Request" },
        });
      }
      if (
        typeof input.success_link !== "string" ||
        typeof input.fail_link !== "string"
      ) {
        return send(res, 200, {
          result: { status: 400, message: "Bad Request" },
        });
      }
      const id = randomBytes(16).toString("base64url");
      const stored: Stored = {
        id,
        payment: {
          type: "NA",
          amount,
          status: "PENDING",
          details: {},
          developer_tracking_id:
            typeof input.developer_tracking_id === "string"
              ? input.developer_tracking_id
              : null,
          settlement_status: "NOT_APPLICABLE",
        },
        successLink: input.success_link,
        failLink: input.fail_link,
        refunded: false,
      };
      if (typeof input.webhook === "string") stored.webhook = input.webhook;
      payments.set(id, stored);
      return send(res, 200, {
        result: {
          success: true,
          payment_id: id,
          link: `${origin}/checkout/fake-shop/${id}`,
          developer_tracking_id: stored.payment.developer_tracking_id,
        },
        name: "developers",
        code: 0,
        version: "v2",
      });
    }

    const verify = /^\/api\/v2\/verify_payment\/([^/]+)$/.exec(path);
    if (method === "GET" && verify) {
      const stored = payments.get(decodeURIComponent(verify[1] ?? ""));
      if (!stored) {
        return send(res, 404, {
          result: { status: 404, message: "Payment not found" },
        });
      }
      return send(res, 200, {
        success: true,
        result: stored.payment,
        status_code: 200,
        name: "developers",
        code: 0,
        version: "2.0.0",
      });
    }

    if (method === "POST" && path === "/api/v2/refund_payment") {
      const id = String(
        (body as Record<string, unknown> | undefined)?.payment_id ?? "",
      );
      const stored = payments.get(id);
      if (!stored || stored.payment.status !== "SUCCESS" || stored.refunded) {
        return send(res, 200, {
          status: "error",
          message: "Payment cannot be refunded",
          code: "REFUND_NOT_ALLOWED",
        });
      }
      stored.refunded = true;
      stored.payment.settlement_status = "NOT_APPLICABLE";
      return send(res, 200, {
        result: {
          refund_id: `ref_${randomBytes(4).toString("hex")}`,
          payment_id: id,
          amount: String(stored.payment.amount),
          status: "success",
          refunded_at: new Date().toISOString(),
        },
        status: "success",
      });
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
    publicKey,
    privateKey,
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
