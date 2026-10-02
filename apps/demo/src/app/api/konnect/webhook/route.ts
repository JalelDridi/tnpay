import { getKonnect, getMode } from "@/lib/konnect";
import { findOrderByPayment, note } from "@/lib/orders";

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
  const handler = client.webhooks.handler({
    onPaid(payment) {
      const order = findOrderByPayment(payment.paymentRef);
      if (!order) return;
      order.status = "paid";
      order.paidAt = new Date().toISOString();
      note(
        order,
        "Webhook received. Konnect confirms the payment is complete. Order marked paid.",
      );
    },
    onPending(payment) {
      const order = findOrderByPayment(payment.paymentRef);
      if (order)
        note(
          order,
          "Webhook received. Konnect says the payment is still pending.",
        );
    },
    onFailed(payment) {
      const order = findOrderByPayment(payment.paymentRef);
      if (!order) return;
      order.status = "failed";
      note(
        order,
        `Webhook received. Konnect reports the payment as ${payment.status}.`,
      );
    },
  });
  const response = await handler(request);
  const order = findOrderByPayment(
    new URL(request.url).searchParams.get("payment_ref") ?? "",
  );
  if (
    order &&
    response.status === 200 &&
    (await response.clone().json()).duplicate
  ) {
    note(
      order,
      "Webhook delivered again. Already applied, so nothing happened.",
    );
  }
  return response;
}
