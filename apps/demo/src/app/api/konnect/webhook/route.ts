import { getKonnect, getMode } from "@/lib/konnect";
import { getStore, note } from "@/lib/orders";

export const runtime = "nodejs";

/**
 * Konnect calls this with `?payment_ref=…`. The handler fetches the payment
 * from Konnect before anything happens, and `onPaid` runs once per payment.
 */
export async function GET(request: Request) {
  if (getMode() === "unconfigured") {
    return Response.json({ error: "demo_not_configured" }, { status: 503 });
  }
  const { client } = await getKonnect();
  const store = getStore();

  const handler = client.webhooks.handler({
    async onPaid(payment) {
      const order = await store.get(payment.paymentRef);
      if (!order) return;
      order.status = "paid";
      order.paidAt = new Date().toISOString();
      note(
        order,
        "Webhook received. Konnect confirms the payment is complete. Order marked paid.",
      );
      await store.save(order);
    },
    async onPending(payment) {
      const order = await store.get(payment.paymentRef);
      if (!order) return;
      note(
        order,
        "Webhook received. Konnect says the payment is still pending.",
      );
      await store.save(order);
    },
    async onFailed(payment) {
      const order = await store.get(payment.paymentRef);
      if (!order) return;
      order.status = "failed";
      note(
        order,
        `Webhook received. Konnect reports the payment as ${payment.status}.`,
      );
      await store.save(order);
    },
  });

  const response = await handler(request);

  const ref = new URL(request.url).searchParams.get("payment_ref") ?? "";
  if (response.status === 200 && (await response.clone().json()).duplicate) {
    const order = await store.get(ref);
    if (order) {
      note(
        order,
        "Webhook delivered again. Already applied, so nothing happened.",
      );
      await store.save(order);
    }
  }
  return response;
}
