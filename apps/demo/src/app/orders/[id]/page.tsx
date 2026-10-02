import { notFound } from "next/navigation";
import { getOrder } from "@/lib/orders";
import { OrderStatus } from "./status";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const order = getOrder(id);
  if (!order) notFound();
  return <OrderStatus initial={order} />;
}
