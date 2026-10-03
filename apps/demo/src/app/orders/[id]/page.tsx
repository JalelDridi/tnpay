import { notFound } from "next/navigation";
import { loadOrder } from "@/lib/load-order";
import { OrderStatus } from "./status";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = await loadOrder(id);
  if (!order) notFound();
  return <OrderStatus initial={order} />;
}
