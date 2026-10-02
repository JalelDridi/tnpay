# tnpay: a TypeScript SDK for Tunisian payment gateways. Konnect first.

Date: 2 October 2026 · Status: approved by Jalel in conversation

## Why

Tunisian developers integrate Konnect, Flouci and the other local gateways by hand. The one Konnect package on npm has 9 weekly downloads and was last published a year ago; Flouci has none. Konnect's webhook is an unsigned `GET` with a payment reference, which makes the naive handler unsafe: anyone who knows the URL can call it, and the docs do not state retries. The package exists to make the safe integration the easy one.

It is also Jalel's second public project, after Payout Ledger, and should show the same habits: nothing the outside world sends is trusted, duplicates do nothing, and every guarantee has a test.

## Scope of the first release

- `@tnpay/core` and `@tnpay/konnect` on npm.
- A demo checkout on Vercel that takes a real sandbox payment.
- A fake Konnect server so the tests, and users' tests, run without an account.

Not in the first release: Flouci, Paymee, ClicToPay, partial payments, refunds (Konnect has no refund endpoint in the public docs), framework adapters other than Web-standard `Request`/`Response` and one documented Express function.

## Runtimes

Node 20+ and edge runtimes. Only Web-standard APIs: `fetch`, `Request`, `Response`, `URL`, `AbortController`. The fake server uses `node:http` and is Node-only; it is a separate entry point (`@tnpay/konnect/fake`) so the main entry stays edge-safe.

## Repository

`github.com/JalelDridi/tnpay`, MIT, pnpm workspace.

```
packages/core       @tnpay/core
packages/konnect    @tnpay/konnect
apps/demo           Next.js demo (not published)
docs/               guides and this spec
```

Tooling: TypeScript strict, tsup (ESM + CJS + `.d.ts`), Vitest, Changesets, Prettier, ESLint, GitHub Actions (lint, typecheck, test, build on every PR; publish on a tagged release). Conventional commits with the `Co-Authored-By: Claude` trailer.

## `@tnpay/core`

Small and gateway-neutral. Everything a second gateway package would also need.

### Money

Konnect takes TND in millimes and EUR/USD in centimes, as integers.

```ts
tnd(12.5); // 12500
millimes(12500); // { amount: 12500, currency: "TND" } helpers for display
formatMoney(12500, "TND"); // "12.500 DT"; EUR/USD as "12.50 €" / "$12.50"
```

Amounts are `number` integers; the functions throw on non-integer results (`tnd(0.0005)`).

### HTTP

`createHttp({ baseUrl, headers, timeoutMs, fetch? })` returns `get(path)` and `post(path, body)`. Each call has a timeout via `AbortController`. Errors:

- `ApiError { status, body, url }` for non-2xx responses.
- `NetworkError { cause }` when `fetch` rejects.
- `TimeoutError` when the timeout fires.

All extend `TnpayError`. Retries: `get` retries twice on `NetworkError`, `TimeoutError` and 5xx with a short backoff; `post` never retries, because no gateway here documents an idempotency key.

### Idempotency store

```ts
interface IdempotencyStore {
  /** Returns true if this key was not claimed before. */
  claim(key: string): Promise<boolean>;
  release(key: string): Promise<void>;
}
```

`createMemoryStore()` is the default. The docs show a Postgres implementation (one table, `INSERT … ON CONFLICT DO NOTHING`) and explain that the memory store is per process, so it is for development and single-instance deployments only.

### Status model

```ts
type PaymentStatus = "pending" | "paid" | "failed" | "expired";
```

Each gateway maps its own statuses to these four. The raw gateway object is always exposed alongside, so nothing is lost.

## `@tnpay/konnect`

### Client

```ts
const konnect = new Konnect({
  apiKey: string,
  walletId: string,
  environment: "sandbox" | "production",
  timeoutMs?: number,       // default 10 000
  fetch?: typeof fetch,     // for tests and custom agents
});
```

Base URLs: `https://api.sandbox.konnect.network/api/v2` and `https://api.konnect.network/api/v2`. Header `x-api-key`.

`konnect.payments.create(input)` → `POST /payments/init-payment`. `input` is the documented request body with `receiverWalletId` filled from the config (overridable). Returns `{ payUrl, paymentRef }`.

`konnect.payments.get(paymentRef)` → `GET /payments/:paymentRef`. Returns `{ status: PaymentStatus, raw: KonnectPayment }` where `KonnectPayment` is the documented `payment` object. Mapping: Konnect `completed` → `paid`; `pending` with `expirationDate` in the past → `expired`; `pending` otherwise → `pending`; a `pending` payment whose latest transaction has a failure status → `failed`, with the exact transaction statuses confirmed against the sandbox during implementation and written into the mapping test.

Types are written from the public docs and checked against real sandbox responses once Jalel's account exists. Unknown extra fields pass through.

### Webhook handler

```ts
konnect.webhooks.handler({
  onPaid: (payment, ctx) => Promise<void>,
  onPending?: (payment, ctx) => Promise<void>,
  onFailed?: (payment, ctx) => Promise<void>,
  store?: IdempotencyStore,
  queryParam?: string,      // default "payment_ref"
}): (request: Request) => Promise<Response>
```

Behaviour, in order:

1. Read `payment_ref` from the request URL. Missing or empty → `400`, body `{ error: "missing_payment_ref" }`.
2. `konnect.payments.get(ref)`. `ApiError` with 404 → `404` (unknown reference; the caller is not Konnect, or the ref is wrong). Any other error → `502` with the error name, so a retry can succeed later.
3. Map the status.
   - `paid`: `store.claim("konnect:paid:" + ref)`. If false → `200` `{ ok: true, duplicate: true }` and `onPaid` is not called. If true → call `onPaid`; on success `200` `{ ok: true }`; if it throws, `store.release(...)` then `500`.
   - `pending`: call `onPending` if given; `200`.
   - `failed` / `expired`: call `onFailed` if given; `200`.
4. The handler never trusts anything in the request except the reference. Everything about the payment comes from Konnect.

`ctx` carries `{ paymentRef, request, raw }`. The handler accepts `GET` and `POST` so a future change at Konnect does not break it.

Express adapter in the docs, about ten lines, converting `req` to a `Request` and writing the `Response` back.

### Fake server (`@tnpay/konnect/fake`)

```ts
const fake = await createFakeKonnect({ apiKey?: string, port?: number });
fake.baseUrl                         // pass as baseUrl override to the client
await fake.pay(paymentRef, { times?: 1 })        // marks completed, fires the webhook
await fake.fail(paymentRef)                      // marks failed, fires the webhook
await fake.expire(paymentRef)
await fake.fireWebhook(paymentRef, { url?, times? })  // raw control, including bogus refs
fake.requests                        // log of received API calls, for assertions
await fake.close();
```

Implements `POST /payments/init-payment` (validates the documented fields, generates a `paymentRef`, returns `payUrl` and `paymentRef`), `GET /payments/:id` (documented response shape), and rejects a wrong `x-api-key` with 401. The webhook it fires is exactly Konnect's: `GET <webhook>?payment_ref=<ref>`, no body. It also serves a tiny HTML page at `payUrl` with "Pay" and "Fail" buttons that call the control API, so the demo can be clicked through without the real sandbox. The client accepts a `baseUrl` override so tests point at the fake.

`npx @tnpay/konnect fake` starts it on port 7320 and prints the base URL.

## Demo (`apps/demo`)

Next.js on Vercel Hobby, free. One product ("A chocolate chip cookie, 5 TND"), a Pay button that calls `payments.create` with the demo's webhook URL and returns the payer to the demo, and an order page that polls the demo's own order state until the webhook flips it to paid. Orders live in memory with a note that it is a demo (no database, no cost). Secrets `KONNECT_API_KEY` and `KONNECT_WALLET_ID` in Vercel and `.env.local`; never printed, never committed. The page shows the sandbox test cards so a visitor can complete a payment.

Fallback if Konnect's sandbox is unavailable: the same demo runs locally against the fake server with `DEMO_FAKE=1`.

## Tests

- Unit: money helpers; status mapping; HTTP retry rules (using an injected `fetch`).
- Integration against the fake server: create then get; webhook with missing ref → 400; unknown ref → 404; paid once → `onPaid` once and 200; paid twice → `onPaid` once, second response marks duplicate; `onPaid` throws → 500 and the next delivery calls `onPaid` again; pending then paid; failed; expired; wrong API key → `ApiError` 401; Konnect down → 502 from the handler.
- Property test: any sequence of deliveries for one reference (duplicates, interleaved pending and paid) calls `onPaid` at most once and ends in the same state.
- Sandbox smoke test: creates a 1 TND payment against the real sandbox and reads it back; runs only when `KONNECT_API_KEY` is set, so CI without the secret skips it. Jalel adds the key as a GitHub secret if he wants it on CI.

## Documentation

- `README.md` at the root: what it is, install, the five-line integration, why the webhook handler fetches instead of trusting, the fake server, links.
- `docs/konnect-webhooks.md`: how Konnect webhooks actually behave (GET, no signature, verify by fetching), with a sequence diagram.
- `docs/idempotency.md`: the store interface and the Postgres example.
- Each package has its own short README for npm.
- Later, on the portfolio site: a case study and the npm download count on the card, and the hero playground could gain a Konnect scenario.

## Prerequisites from Jalel

1. Create the Konnect sandbox account at https://dashboard.sandbox.konnect.network, get the API key and wallet ID, and put them in `apps/demo/.env.local` (and later in Vercel). I will not create accounts or handle the values.
2. Create the free npm organisation `tnpay` at https://www.npmjs.com/org/create and add an automation token as the `NPM_TOKEN` GitHub secret for publishing. Until then, the packages build and test but are not published.
3. Approve the final package names if `tnpay` is taken on npm.

## Order of work

1. Workspace, tooling, CI, `@tnpay/core` with tests.
2. `@tnpay/konnect` client and types.
3. Fake server.
4. Webhook handler with the integration and property tests.
5. Demo app, first against the fake server, then the sandbox.
6. Docs, Changesets, first release `0.1.0`.
7. Portfolio entry.
