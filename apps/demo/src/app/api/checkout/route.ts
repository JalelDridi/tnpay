import { tnd } from "@tnpay/konnect";
import { randomBytes } from "node:crypto";
import { getKonnect, getMode } from "@/lib/konnect";
import { getStore, newOrder, note } from "@/lib/orders";

export const runtime = "nodejs";

const ITEM = { name: "Chocolate chip cookie", price: tnd(5) };

/** Creates the Konnect payment and the order, then sends the browser to the order page. */
export async function POST(request: Request) {
  if (getMode() === "unconfigured") {
    return Response.json({ error: "demo_not_configured" }, { status: 503 });
  }
  const { client, mode } = await getKonnect();
  const origin = new URL(request.url).origin;
  const orderNumber = randomBytes(4).toString("hex");

  const { payUrl, paymentRef } = await client.payments.create({
    amount: ITEM.price,
    token: "TND",
    description: `${ITEM.name} (tnpay demo)`,
    orderId: orderNumber,
    webhook: `${origin}/api/konnect/webhook`,
    lifespan: 30,
  });

  // The payment reference is the order id, so the page can always ask Konnect.
  const order = newOrder({
    id: paymentRef,
    item: ITEM.name,
    amount: ITEM.price,
    payUrl,
  });
  note(order, `Payment ${paymentRef} created on Konnect (${mode}).`);
  await getStore().save(order);

  return Response.redirect(`${origin}/orders/${paymentRef}`, 303);
}
