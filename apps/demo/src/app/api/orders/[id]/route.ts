import { loadOrder } from "@/lib/load-order";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const order = await loadOrder(id);
  if (!order) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(order, { headers: { "cache-control": "no-store" } });
}
