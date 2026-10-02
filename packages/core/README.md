# @tnpay/core

The shared pieces behind the tnpay gateway packages. You normally install a gateway package such as [`@tnpay/konnect`](https://www.npmjs.com/package/@tnpay/konnect), which re-exports all of this.

- `tnd(12.5)` → `12500` millimes; `toMinor(amount, "EUR" | "USD")`; `formatMoney(12500, "TND")` → `"12.500 DT"`. Throws instead of rounding money away.
- `createHttp()`: a JSON client on `fetch` with timeouts, `ApiError`, `NetworkError` and `TimeoutError`. GETs retry twice on network errors, timeouts and 5xx; POSTs never retry.
- `IdempotencyStore` and `createMemoryStore()`: remember which webhooks were already applied.
- `PaymentStatus`: `"pending" | "paid" | "failed" | "expired"`.

Guide: [github.com/JalelDridi/tnpay](https://github.com/JalelDridi/tnpay#readme). MIT.
