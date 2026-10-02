# tnpay Konnect SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@tnpay/core` and `@tnpay/konnect`, a typed Konnect client with a safe webhook handler and a fake Konnect server, plus a demo checkout on Vercel.

**Architecture:** A pnpm workspace. `core` holds gateway-neutral money, HTTP, idempotency and status code. `konnect` holds the client, the webhook handler (Web `Request` → `Response`) and a Node-only fake server on a separate entry point. The demo is a Next.js app that uses the packages through the workspace.

**Tech Stack:** TypeScript 5 strict, pnpm 9, tsup, Vitest, fast-check, Changesets, Prettier, ESLint, GitHub Actions, Next.js 16 on Vercel Hobby.

## Global Constraints

- Node 20+ and edge runtimes for the main entry points: only `fetch`, `Request`, `Response`, `URL`, `AbortController`. `node:http` only in `@tnpay/konnect/fake`.
- `post` never retries. `get` retries twice on `NetworkError`, `TimeoutError` and 5xx.
- The webhook handler trusts nothing in the request except `payment_ref`; every fact about the payment comes from `payments.get`.
- Secrets (`KONNECT_API_KEY`, `KONNECT_WALLET_ID`, `NPM_TOKEN`) never printed, never committed. `.env.local` is gitignored.
- Free tiers only. MIT licence. Conventional commits ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Every check (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) passes before each commit.

---

## File structure

```
tnpay/
  package.json  pnpm-workspace.yaml  tsconfig.base.json  .gitignore  .prettierrc  eslint.config.mjs
  .changeset/config.json
  .github/workflows/ci.yml   .github/workflows/release.yml
  LICENSE  README.md  CLAUDE.md
  packages/core/
    package.json  tsconfig.json  tsup.config.ts  README.md
    src/index.ts          re-exports
    src/money.ts          tnd(), toMinor(), formatMoney()
    src/errors.ts         TnpayError, ApiError, NetworkError, TimeoutError
    src/http.ts           createHttp()
    src/idempotency.ts    IdempotencyStore, createMemoryStore()
    src/status.ts         PaymentStatus
    src/*.test.ts
  packages/konnect/
    package.json  tsconfig.json  tsup.config.ts  README.md
    src/index.ts          Konnect class, types, errors re-export
    src/types.ts          KonnectPayment, CreatePaymentInput, CreatePaymentResult
    src/client.ts         Konnect class (payments.create/get, webhooks.handler)
    src/status.ts         mapStatus(raw) → PaymentStatus
    src/webhook.ts        createWebhookHandler()
    src/fake/index.ts     createFakeKonnect()  (entry "@tnpay/konnect/fake")
    src/fake/cli.ts       bin: tnpay-konnect fake
    src/*.test.ts  src/webhook.property.test.ts  src/sandbox.test.ts
  apps/demo/              Next.js app
  docs/konnect-webhooks.md  docs/idempotency.md
```

---

### Task 1: Workspace, tooling, CI

**Files:** root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `.prettierrc`, `eslint.config.mjs`, `vitest.workspace.ts`, `.github/workflows/ci.yml`, `LICENSE`, `CLAUDE.md`, `.changeset/config.json`.

**Produces:** scripts `pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build` at the root, running across packages.

- [ ] Root `package.json` with `"private": true`, `"packageManager": "pnpm@9.15.0"`, devDependencies: typescript, tsup, vitest, fast-check, @changesets/cli, prettier, eslint, typescript-eslint, @types/node. Scripts: `build: pnpm -r --filter './packages/*' build`, `test: vitest run`, `typecheck: pnpm -r typecheck`, `lint: eslint .`, `format: prettier --write .`, `format:check: prettier --check .`.
- [ ] `tsconfig.base.json`: `strict`, `module: NodeNext`, `moduleResolution: NodeNext`, `target: ES2022`, `lib: ["ES2022", "DOM"]` (DOM for `Request`/`Response` types), `declaration`, `skipLibCheck`.
- [ ] CI: install, lint, format:check, typecheck, test, build on push to main and PRs. Node 22.
- [ ] `CLAUDE.md` under 40 lines: commands, layout, the rules from Global Constraints.
- [ ] Commit: `chore: scaffold the pnpm workspace with tooling and CI`.

### Task 2: `@tnpay/core` money and errors

**Files:** `packages/core/src/money.ts`, `errors.ts`, `status.ts`, `index.ts`, tests.

**Produces:**
```ts
tnd(major: number): number            // 12.5 → 12500; throws RangeError if not an integer result or negative
toMinor(major: number, currency: "TND" | "EUR" | "USD"): number  // TND ×1000, others ×100
formatMoney(minor: number, currency): string  // "12.500 DT" | "12.50 €" | "$12.50"
class TnpayError extends Error
class ApiError extends TnpayError { status: number; body: unknown; url: string }
class NetworkError extends TnpayError { cause: unknown }
class TimeoutError extends TnpayError { timeoutMs: number }
type PaymentStatus = "pending" | "paid" | "failed" | "expired"
```

- [ ] Tests: `tnd(12.5) === 12500`; `tnd(0.001) === 1`; `tnd(0.0005)` throws; `tnd(-1)` throws; `toMinor(12.5,"EUR") === 1250`; `formatMoney(12500,"TND") === "12.500 DT"`; `formatMoney(1250,"EUR") === "12.50 €"`; `formatMoney(1250,"USD") === "$12.50"`. Rounding: use `Math.round(major * factor)` and compare with `Number.isInteger(major*factor)` within 1e-9 to avoid float noise.
- [ ] Implement, run, commit: `feat(core): add money helpers, errors and the status type`.

### Task 3: `@tnpay/core` HTTP client

**Files:** `packages/core/src/http.ts`, `http.test.ts`.

**Produces:**
```ts
createHttp(options: { baseUrl: string; headers?: Record<string,string>; timeoutMs?: number; fetch?: typeof fetch; retryDelayMs?: number }): {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}
```
Behaviour: joins `baseUrl` and `path`; sets `content-type: application/json` on post; parses JSON (empty body → `undefined`); non-2xx → `ApiError`; `fetch` rejection → `NetworkError`; abort by timeout → `TimeoutError`. `get` retries up to 2 more times on `NetworkError`, `TimeoutError`, or `ApiError` with status ≥ 500, waiting `retryDelayMs` (default 250) × attempt. `post` never retries.

- [ ] Tests with an injected `fetch` stub (counting calls): get success parses JSON; get 404 → ApiError with status/body; get 500 then 200 → one retry, result returned; get 500×3 → ApiError after 3 calls; post 500 → ApiError after exactly 1 call; fetch rejects → NetworkError (get retries, post not); timeout: fetch that never resolves until `signal` aborts → TimeoutError (use `timeoutMs: 20`).
- [ ] Commit: `feat(core): add an HTTP client with timeouts, typed errors and GET retries`.

### Task 4: `@tnpay/core` idempotency store

**Files:** `packages/core/src/idempotency.ts`, test.

**Produces:**
```ts
interface IdempotencyStore { claim(key: string): Promise<boolean>; release(key: string): Promise<void> }
createMemoryStore(): IdempotencyStore
```

- [ ] Tests: first claim true, second false; release then claim true; keys independent; two concurrent claims of one key resolve to exactly one true (`Promise.all` of 10 claims → one true).
- [ ] Commit: `feat(core): add the idempotency store interface and an in-memory store`.

### Task 5: `@tnpay/konnect` types, status mapping and client

**Files:** `packages/konnect/src/types.ts`, `status.ts`, `client.ts`, `index.ts`, tests.

**Produces:**
```ts
interface CreatePaymentInput { amount: number; token?: "TND"|"EUR"|"USD"; type?: "immediate"|"partial"; description?: string; acceptedPaymentMethods?: ("wallet"|"bank_card"|"e-DINAR")[]; lifespan?: number; checkoutForm?: boolean; addPaymentFeesToAmount?: boolean; firstName?: string; lastName?: string; phoneNumber?: string; email?: string; orderId?: string; webhook?: string; theme?: "light"|"dark"; receiverWalletId?: string }
interface CreatePaymentResult { payUrl: string; paymentRef: string }
interface KonnectTransaction { id?: string; status?: string; amount?: number; method?: string; [k: string]: unknown }
interface KonnectPayment { id: string; status: "completed"|"pending"|string; amount: number; amountDue?: number; reachedAmount?: number; token: string; expirationDate?: string; orderId?: string; type?: string; link?: string; webhook?: string; acceptedPaymentMethods?: string[]; transactions?: KonnectTransaction[]; [k: string]: unknown }
interface Payment { status: PaymentStatus; paymentRef: string; amount: number; currency: string; orderId?: string; raw: KonnectPayment }
mapStatus(raw: KonnectPayment, now?: Date): PaymentStatus
class Konnect { constructor(opts: { apiKey: string; walletId: string; environment?: "sandbox"|"production"; baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch }); payments: { create(input): Promise<CreatePaymentResult>; get(paymentRef: string): Promise<Payment> }; webhooks: { handler(opts: WebhookOptions): (req: Request) => Promise<Response> } }
```
`mapStatus`: `completed` → `paid`; `pending` and `expirationDate` < now → `expired`; `pending` and last transaction status in `FAILED_STATUSES = ["failed","failure","declined","error"]` (case-insensitive; confirm against sandbox) → `failed`; `pending` otherwise → `pending`; anything else → `pending`.

- [ ] Tests for `mapStatus` (five cases) and for the client with an injected fetch: create sends `x-api-key`, posts to `/payments/init-payment` with `receiverWalletId` from config, returns `payUrl`/`paymentRef`; `create` with explicit `receiverWalletId` keeps it; `get` calls `/payments/<ref>` and returns a mapped `Payment`; sandbox and production base URLs; `baseUrl` override wins.
- [ ] Commit: `feat(konnect): add the typed client and status mapping`.

### Task 6: fake Konnect server

**Files:** `packages/konnect/src/fake/index.ts`, `fake/cli.ts`, `fake.test.ts`; `package.json` `exports["./fake"]` and `bin`.

**Produces:**
```ts
createFakeKonnect(opts?: { apiKey?: string; port?: number; fetch?: typeof fetch }): Promise<FakeKonnect>
interface FakeKonnect {
  baseUrl: string; apiKey: string;
  requests: { method: string; path: string; body?: unknown }[];
  deliveries: { url: string; status: number }[];
  pay(ref: string, opts?: { times?: number }): Promise<void>;
  fail(ref: string): Promise<void>;
  expire(ref: string): Promise<void>;
  fireWebhook(ref: string, opts?: { url?: string; times?: number }): Promise<void>;
  close(): Promise<void>;
}
```
Routes: `POST /api/v2/payments/init-payment` (401 if `x-api-key` ≠ apiKey; 400 if `amount` not a positive integer or `receiverWalletId` missing; returns `{ payUrl: baseUrl + "/pay?payment_ref=" + ref, paymentRef }`), `GET /api/v2/payments/:ref` (404 `{ error: "Payment not found" }` unknown; else `{ payment }` in the documented shape), `GET /pay?payment_ref=` (HTML with Pay/Fail buttons posting to `/__fake/pay` and `/__fake/fail`), `POST /__fake/pay`, `/__fake/fail`, `/__fake/expire`. `pay` sets `status: "completed"`, pushes a `success` transaction, fires `GET <webhook>?payment_ref=<ref>` `times` times (sequentially, recording status). `fail` pushes a `failed` transaction, status stays `pending`. `expire` sets `expirationDate` to one minute ago.

- [ ] Tests: create via real client against the fake; get returns `pending`; `pay` → `paid` and one delivery to the webhook URL given at create; `pay({times:2})` → two deliveries; wrong api key → `ApiError` 401; unknown ref → `ApiError` 404; `fail` → `failed`; `expire` → `expired`.
- [ ] Commit: `feat(konnect): add a fake Konnect server for tests and local development`.

### Task 7: webhook handler

**Files:** `packages/konnect/src/webhook.ts`, `webhook.test.ts`, `webhook.property.test.ts`.

**Produces:**
```ts
interface WebhookContext { paymentRef: string; request: Request; raw: KonnectPayment }
interface WebhookOptions { onPaid: (p: Payment, ctx: WebhookContext) => Promise<void> | void; onPending?: ...; onFailed?: ...; store?: IdempotencyStore; queryParam?: string }
createWebhookHandler(client: Konnect, opts: WebhookOptions): (request: Request) => Promise<Response>
```
Responses (JSON): 400 `{ error: "missing_payment_ref" }`; 404 `{ error: "unknown_payment" }`; 502 `{ error: "<ErrorName>" }`; 200 `{ ok: true, status, duplicate?: true }`; 500 `{ error: "handler_failed" }`. Claim key `konnect:paid:<ref>`.

- [ ] Integration tests using the fake server and a local `node:http` receiver that forwards to the handler: missing ref → 400; unknown ref → 404; paid once → `onPaid` once, 200; `pay({times:2})` → `onPaid` once, second delivery `duplicate: true`; `onPaid` throws → 500 and a further delivery calls it again; pending delivery → `onPending`, `onPaid` not called; failed → `onFailed`; expired → `onFailed`; fake closed → 502.
- [ ] Property test (fast-check): for a random sequence of 1–8 deliveries drawn from {pending, paid, duplicate paid}, `onPaid` is called at most once and the final status is `paid` iff a paid delivery occurred.
- [ ] Commit: `feat(konnect): add a webhook handler that verifies by fetching and applies once`.

### Task 8: sandbox smoke test and package metadata

- [ ] `sandbox.test.ts`: `describe.skipIf(!process.env.KONNECT_API_KEY)`; create 1 TND payment; get it back; expect `pending` and a `payUrl` on `konnect.network`.
- [ ] `package.json` for both packages: `name`, `version 0.0.0`, `license MIT`, `repository`, `exports` (types/import/require), `files: ["dist"]`, `sideEffects: false`, `engines.node >=20`, keywords. tsup: `format: ["esm","cjs"]`, `dts`, entries `src/index.ts` and (konnect) `src/fake/index.ts`, `src/fake/cli.ts`.
- [ ] `pnpm build`; `node -e "require('@tnpay/konnect')"` and an ESM import both work from a scratch dir.
- [ ] Commit: `chore: package metadata, dual builds and a sandbox smoke test`.

### Task 9: demo app

**Files:** `apps/demo` (Next.js 16, App Router, Tailwind). Routes: `/` (product + Pay), `/api/checkout` (POST → `payments.create` with `webhook` = `${origin}/api/konnect/webhook`, `orderId`, returns `payUrl`; stores order in memory), `/api/konnect/webhook` (`GET` = handler; `onPaid` marks the order paid), `/orders/[id]` (polls `/api/orders/[id]` every 2 s; shows pending → paid), `/api/orders/[id]`. `DEMO_FAKE=1` starts the fake server in-process (dev only) and points the client at it. Test cards shown on `/`.

- [ ] Works locally against the fake; works locally against the sandbox once keys exist; deployed to Vercel with `KONNECT_API_KEY`, `KONNECT_WALLET_ID` (set by Jalel), `NEXT_PUBLIC_ORIGIN`.
- [ ] One Playwright test against the fake: click Pay, click "Pay" on the fake page, order page shows "Paid".
- [ ] Commit: `feat(demo): add a checkout demo against the fake server and the sandbox`.

### Task 10: docs, changesets, release

- [ ] Root README (what, install, five-line integration, why verify-by-fetch, fake server, Express adapter, links). Package READMEs. `docs/konnect-webhooks.md` with a Mermaid sequence diagram. `docs/idempotency.md` with a Postgres store (`INSERT INTO idempotency_keys(key) VALUES ($1) ON CONFLICT DO NOTHING RETURNING key`).
- [ ] `.changeset` for both packages at `0.1.0`; `release.yml` using `changesets/action` publishing with `NPM_TOKEN` (runs only when the secret exists).
- [ ] Create GitHub repo `JalelDridi/tnpay`, push, CI green.
- [ ] Commit: `docs: write the guides and prepare the 0.1.0 release`.

### Task 11: portfolio entry

- [ ] Add a project card and case study for tnpay in `portfolio/src/content.ts` (wording for Jalel's approval), with the npm badge once published.

---

## Self-review

- Spec coverage: money ✔ (T2), HTTP ✔ (T3), store ✔ (T4), client and mapping ✔ (T5), fake ✔ (T6), handler incl. 400/404/502/500 and claim/release ✔ (T7), property test ✔ (T7), sandbox smoke ✔ (T8), demo with fake fallback ✔ (T9), docs and release ✔ (T10), portfolio ✔ (T11). Express adapter is docs-only, as the spec says.
- Names consistent: `createHttp`, `createMemoryStore`, `mapStatus`, `createFakeKonnect`, `createWebhookHandler`, `Konnect.payments.create/get`, `Konnect.webhooks.handler`.
