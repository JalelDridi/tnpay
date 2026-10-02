# @tnpay/konnect

Typed [Konnect](https://konnect.network) client for TypeScript, with a webhook handler that verifies every payment with Konnect before acting, and a fake Konnect server for tests.

```bash
pnpm add @tnpay/konnect
```

```ts
import { Konnect, tnd } from "@tnpay/konnect";

const konnect = new Konnect({
  apiKey: process.env.KONNECT_API_KEY!,
  walletId: process.env.KONNECT_WALLET_ID!,
  environment: "sandbox",
});

const { payUrl, paymentRef } = await konnect.payments.create({
  amount: tnd(25),
  orderId: "1042",
  webhook: "https://shop.example/api/konnect/webhook",
});

// Any runtime with Request and Response, for example a Next.js route handler:
export const GET = konnect.webhooks.handler({
  onPaid: async (payment) => markPaid(payment.orderId!),
});
```

Konnect's webhook is an unsigned `GET ?payment_ref=…`. The handler fetches the payment from Konnect before calling you, and `onPaid` runs once per payment however many times the webhook is delivered.

Test without an account:

```ts
import { createFakeKonnect } from "@tnpay/konnect/fake";
const fake = await createFakeKonnect();
```

Full guide, webhook details and the fake server: [github.com/JalelDridi/tnpay](https://github.com/JalelDridi/tnpay#readme).

MIT. Not affiliated with Konnect.
