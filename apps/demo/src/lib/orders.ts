import { randomBytes } from "node:crypto";

export type Order = {
  id: string;
  item: string;
  amount: number;
  currency: "TND";
  status: "pending" | "paid" | "failed";
  paymentRef?: string;
  payUrl?: string;
  createdAt: string;
  paidAt?: string;
  /** Every webhook delivery, newest last, so the page can show them. */
  events: { at: string; note: string }[];
};

// In memory on purpose: this is a demo, and a database would be a cost.
const shared = globalThis as unknown as { __tnpayOrders?: Map<string, Order> };
const orders = (shared.__tnpayOrders ??= new Map<string, Order>());

export function createOrder(item: string, amount: number): Order {
  const order: Order = {
    id: randomBytes(5).toString("hex"),
    item,
    amount,
    currency: "TND",
    status: "pending",
    createdAt: new Date().toISOString(),
    events: [],
  };
  orders.set(order.id, order);
  return order;
}

export function getOrder(id: string): Order | undefined {
  return orders.get(id);
}

export function findOrderByPayment(paymentRef: string): Order | undefined {
  for (const order of orders.values()) {
    if (order.paymentRef === paymentRef) return order;
  }
  return undefined;
}

export function note(order: Order, text: string) {
  order.events.push({ at: new Date().toISOString(), note: text });
}
