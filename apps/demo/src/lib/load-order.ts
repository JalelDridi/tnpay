import { ApiError } from "@tnpay/konnect";
import { getKonnect, getMode } from "@/lib/konnect";
import {
  getStore,
  hasDatabase,
  newOrder,
  note,
  type Order,
} from "@/lib/orders";

/**
 * The stored order, or, if this instance has never seen it (no database),
 * a view built straight from Konnect so the page still tells the truth.
 */
export async function loadOrder(id: string): Promise<Order | undefined> {
  if (getMode() === "unconfigured") return undefined;
  const stored = await getStore().get(id);
  if (stored) return stored;

  const { client } = await getKonnect();
  try {
    const payment = await client.payments.get(id);
    const order = newOrder({
      id,
      item: "Chocolate chip cookie",
      amount: payment.amount,
      payUrl: payment.raw.link ?? "",
    });
    order.status =
      payment.status === "paid"
        ? "paid"
        : payment.status === "pending"
          ? "pending"
          : "failed";
    note(order, `Status read from Konnect directly: ${payment.status}.`);
    if (!hasDatabase()) {
      note(
        order,
        "This deployment has no database, so the webhook log is not kept between requests.",
      );
    }
    return order;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return undefined;
    throw error;
  }
}
