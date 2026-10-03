# tnpay

TypeScript SDK for Tunisian payment gateways. Konnect first. Spec: `docs/superpowers/specs/`, plan: `docs/superpowers/plans/`.

## Commands

- `pnpm lint` · `pnpm format:check` · `pnpm typecheck` · `pnpm test` · `pnpm build` — the CI checks, in order. Run all before committing.
- `bash check.sh` runs all of them and stops at the first failure.
- Demo: `pnpm --filter demo dev` (uses the fake Konnect unless `KONNECT_API_KEY` and `KONNECT_WALLET_ID` are set), `pnpm --filter demo build`, `pnpm --filter demo test:e2e` (needs the build).

## Layout

- `packages/core` — `@tnpay/core`: money helpers, HTTP client, idempotency store, status type. Gateway-neutral.
- `packages/konnect` — `@tnpay/konnect`: Konnect client, webhook handler, and the fake server on the `./fake` entry.
- `packages/flouci` — `@tnpay/flouci`: the same shape for Flouci, plus refunds.
- `apps/demo` — Next.js demo checkout (not published).
- `docs/` — guides.

## Rules

- Main entry points use only Web-standard APIs (`fetch`, `Request`, `Response`, `URL`, `AbortController`). `node:http` is allowed only under `packages/*/src/fake/`.
- `post` never retries. `get` retries twice on network errors, timeouts and 5xx.
- The webhook handler trusts nothing from the request except `payment_ref`; it fetches the payment from Konnect before acting.
- Never print, log or commit `KONNECT_API_KEY`, `KONNECT_WALLET_ID`, `FLOUCI_PUBLIC_KEY`, `FLOUCI_PRIVATE_KEY` or `NPM_TOKEN`.
- Free tiers only. MIT. Small conventional commits ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Jalel approves public wording (READMEs, docs) and architectural changes to the spec.
