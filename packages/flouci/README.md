# @tnpay/flouci

Typed [Flouci](https://flouci.com) client for TypeScript, with a webhook handler that verifies every payment with Flouci before acting, and a fake Flouci server for tests.

```bash
pnpm add @tnpay/flouci
```

```ts
import { Flouci, tnd } from "@tnpay/flouci";

const flouci = new Flouci({
  publicKey: process.env.FLOUCI_PUBLIC_KEY!,
  privateKey: process.env.FLOUCI_PRIVATE_KEY!,
});

const { payUrl, paymentId } = await flouci.payments.create({
  amount: tnd(25),
  successLink: "https://shop.example/orders/1042?paid=1",
  failLink: "https://shop.example/orders/1042?failed=1",
  webhook: "https://shop.example/api/flouci/webhook",
  trackingId: "1042",
  acceptCard: true,
});

// Any runtime with Request and Response, for example a Next.js route handler:
export const GET = flouci.webhooks.handler({
  onPaid: async (payment) => markPaid(payment.trackingId!),
});
```

Flouci's webhook is `GET ?payment_id=…&success=True|False`, unsigned. The handler ignores the `success` flag, verifies the payment with Flouci, and runs `onPaid` once per payment however many times the webhook is delivered. The same `payment_id` is appended to your success and fail links: verify it there too with `payments.get()`, never trust the redirect alone.

Also: `payments.get(id)` (status `pending` | `paid` | `failed` | `expired`, Flouci's object on `raw`, including `settlement_status`) and `payments.refund(id)`.

Test without an account:

```ts
import { createFakeFlouci } from "@tnpay/flouci/fake";
const fake = await createFakeFlouci();
```

Sandbox and production share the same URL at Flouci; only the keys change.

Full guide: [github.com/JalelDridi/tnpay](https://github.com/JalelDridi/tnpay#readme). MIT. Not affiliated with Flouci.
