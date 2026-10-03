# tnpay

Typed TypeScript SDKs for Tunisian payment gateways: Konnect and Flouci.

- **`@tnpay/konnect`**: a typed [Konnect](https://konnect.network) client, a webhook handler that verifies every payment with Konnect before it believes anything, and a fake Konnect server so your tests run without an account.
- **`@tnpay/flouci`**: the same for [Flouci](https://flouci.com): client, verified webhook handler, refunds, fake server. See [its README](packages/flouci/README.md).
- **`@tnpay/core`**: the shared pieces: money helpers for millimes and cents, an HTTP client with typed errors, an idempotency store, and the verify-by-lookup webhook handler both gateways use.

**Demo:** [tnpay-demo.vercel.app](https://tnpay-demo.vercel.app), a checkout against the Konnect sandbox. **Source:** [`apps/demo`](apps/demo).

## Install

```bash
pnpm add @tnpay/konnect
```

Node 20+, or any runtime with `fetch`, `Request` and `Response` (Vercel Edge, Cloudflare Workers, Bun, Deno). ESM and CommonJS.

## Take a payment

```ts
import { Konnect, tnd } from "@tnpay/konnect";

const konnect = new Konnect({
  apiKey: process.env.KONNECT_API_KEY!,
  walletId: process.env.KONNECT_WALLET_ID!,
  environment: "sandbox", // or "production"
});

const { payUrl, paymentRef } = await konnect.payments.create({
  amount: tnd(25), // 25.000 DT, as 25000 millimes
  orderId: order.id,
  webhook: "https://shop.example/api/konnect/webhook",
  description: "Order #1042",
});
// Send the customer to payUrl. Keep paymentRef on the order.
```

## Handle the webhook

Konnect notifies you with `GET https://shop.example/api/konnect/webhook?payment_ref=<ref>`. There is no body and no signature, so the request on its own proves nothing: anyone who knows the URL can call it with any reference. The handler takes only the reference from the request, fetches the payment from Konnect, and acts on Konnect's answer.

```ts
// app/api/konnect/webhook/route.ts (Next.js). Any Request → Response runtime works.
export const GET = konnect.webhooks.handler({
  onPaid: async (payment) => {
    await orders.markPaid(payment.orderId!, payment.paymentRef);
  },
});
```

- `onPaid` runs **once per payment**, however many times Konnect delivers the webhook. The default store is in memory; for more than one server instance, implement [`IdempotencyStore`](docs/idempotency.md) on your database (one `INSERT … ON CONFLICT DO NOTHING`).
- If `onPaid` throws, the claim is released and the handler answers `500`, so the next delivery tries again.
- `onPending` and `onFailed` are optional. `payment.status` is one of `pending`, `paid`, `failed`, `expired`; Konnect's full object is on `payment.raw`.
- Responses: `400` no reference · `404` Konnect does not know it · `502` Konnect unreachable · `200` handled (with `duplicate: true` when it was already applied).

Express:

```ts
app.get("/konnect/webhook", async (req, res) => {
  const url = new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`);
  const response = await handler(new Request(url, { method: "GET" }));
  res.status(response.status).send(await response.text());
});
```

## Check a payment yourself

```ts
const payment = await konnect.payments.get(paymentRef);
payment.status; // "pending" | "paid" | "failed" | "expired"
payment.raw; // Konnect's payment object, untouched
```

## Test without an account

```ts
import { createFakeKonnect } from "@tnpay/konnect/fake";

const fake = await createFakeKonnect();
const konnect = new Konnect({
  apiKey: fake.apiKey,
  walletId: "w",
  baseUrl: fake.baseUrl,
});

const { paymentRef } = await konnect.payments.create({
  amount: 5000,
  webhook: myWebhookUrl,
});
await fake.pay(paymentRef, { times: 2 }); // marks it paid and delivers the webhook twice
await fake.close();
```

The fake implements the three documented endpoints with Konnect's shapes, serves a payment page with Pay and Fail buttons, and delivers webhooks exactly as Konnect does. `npx tnpay-konnect fake` runs it on port 7320 for local development.

## Errors

Everything thrown extends `TnpayError`: `ApiError` (`status`, `body`, `url`), `NetworkError`, `TimeoutError`. `payments.get` retries twice on network errors, timeouts and 5xx. `payments.create` never retries, because Konnect documents no idempotency key and a retry could create two payments.

## Money

Konnect takes integers: millimes for TND, cents for EUR and USD.

```ts
tnd(12.5); // 12500
toMinor(12.5, "EUR"); // 1250
formatMoney(12500, "TND"); // "12.500 DT"
```

`tnd(0.0005)` throws rather than rounding money away.

## More

- [How Konnect webhooks really work](docs/konnect-webhooks.md)
- [Idempotency stores](docs/idempotency.md)
- [Design records](docs/superpowers/specs/)

## Develop

```bash
pnpm install
bash check.sh        # lint, format, typecheck, test, build
pnpm --filter demo dev
```

## Licence

MIT. Not affiliated with Konnect.
