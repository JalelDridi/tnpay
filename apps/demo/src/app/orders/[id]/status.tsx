"use client";

import { formatMoney } from "@tnpay/konnect";
import { useEffect, useState } from "react";
import type { Order } from "@/lib/orders";

const LABEL: Record<Order["status"], string> = {
  pending: "Waiting for payment",
  paid: "Paid",
  failed: "Payment failed",
};

/** Shows the order and polls until the webhook has settled it. */
export function OrderStatus({ initial }: { initial: Order }) {
  const [order, setOrder] = useState(initial);

  useEffect(() => {
    if (order.status !== "pending") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/orders/${order.id}`, {
        cache: "no-store",
      });
      if (response.ok) setOrder(await response.json());
    }, 2000);
    return () => clearInterval(timer);
  }, [order.id, order.status]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="font-mono text-sm text-stone-500">Order {order.id}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          {order.item} · {formatMoney(order.amount, order.currency)}
        </h1>
      </div>

      <div
        role="status"
        className={
          "rounded-2xl border p-6 " +
          (order.status === "paid"
            ? "border-emerald-300 bg-emerald-50"
            : order.status === "failed"
              ? "border-red-300 bg-red-50"
              : "border-stone-200 bg-white")
        }
      >
        <p className="text-2xl font-semibold">{LABEL[order.status]}</p>
        {order.status === "pending" && order.payUrl && (
          <>
            <p className="mt-2 text-stone-600">
              Pay on Konnect in a new tab, then come back here. This page checks
              every two seconds.
            </p>
            <a
              href={order.payUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block rounded-full bg-stone-900 px-6 py-3 font-medium text-white hover:bg-stone-700"
            >
              Pay {formatMoney(order.amount, order.currency)} on Konnect
            </a>
          </>
        )}
        {order.status === "paid" && (
          <p className="mt-2 text-stone-700">
            Konnect confirmed the payment and the webhook was applied once.
          </p>
        )}
      </div>

      <section>
        <h2 className="font-semibold">What happened</h2>
        <ol className="mt-2 flex flex-col gap-2 text-sm">
          {order.events.map((event, index) => (
            <li key={index} className="flex gap-3">
              <span className="shrink-0 font-mono text-stone-400">
                {new Date(event.at).toLocaleTimeString("en-GB")}
              </span>
              <span>{event.note}</span>
            </li>
          ))}
        </ol>
      </section>

      <a
        href="/"
        className="text-sm text-stone-600 underline underline-offset-4"
      >
        Back to the shop
      </a>
    </div>
  );
}
