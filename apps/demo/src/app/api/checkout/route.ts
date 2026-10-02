import { tnd } from "@tnpay/konnect";
import { getKonnect, getMode } from "@/lib/konnect";
import { createOrder, note } from "@/lib/orders";

export const runtime = "nodejs";

const ITEM = { name: "Chocolate chip cookie", price: tnd(5) };

/** Creates the order and the Konnect payment, then sends the browser to the order page. */
export async function POST(request: Request) {
  if (getMode() === "unconfigured") {
    return Response.json({ error: "demo_not_configured" }, { status: 503 });
  }
  const { client, mode } = await getKonnect();
  const origin = new URL(request.url).origin;
  const order = createOrder(ITEM.name, ITEM.price);

  const { payUrl, paymentRef } = await client.payments.create({
    amount: order.amount,
    token: "TND",
    description: `${ITEM.name} (tnpay demo)`,
    orderId: order.id,
    webhook: `${origin}/api/konnect/webhook`,
    lifespan: 30,
  });

  order.paymentRef = paymentRef;
  order.payUrl = payUrl;
  note(order, `Payment ${paymentRef} created on Konnect (${mode}).`);

  return Response.redirect(`${origin}/orders/${order.id}`, 303);
}
