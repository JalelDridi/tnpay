# @tnpay/flouci

## 0.1.0

### Minor Changes

- 9a15c05: First release. `@tnpay/konnect`: typed client for `payments.create` and `payments.get`, a webhook handler that verifies each payment with Konnect and applies `onPaid` once, and a fake Konnect server on `@tnpay/konnect/fake`. `@tnpay/flouci`: typed client for `payments.create`, `payments.get` and `payments.refund`, the same verified webhook handler, and a fake Flouci server on `@tnpay/flouci/fake`. `@tnpay/core`: the shared verify-by-lookup webhook handler, money helpers, HTTP client with typed errors and GET retries, idempotency store, payment status type.

### Patch Changes

- Updated dependencies [9a15c05]
  - @tnpay/core@0.1.0
