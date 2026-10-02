---
"@tnpay/core": minor
"@tnpay/konnect": minor
---

First release. `@tnpay/konnect`: typed client for `payments.create` and `payments.get`, a webhook handler that verifies each payment with Konnect and applies `onPaid` once, and a fake Konnect server on `@tnpay/konnect/fake`. `@tnpay/core`: money helpers, HTTP client with typed errors and GET retries, idempotency store, payment status type.
