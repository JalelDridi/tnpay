import { neon } from "@neondatabase/serverless";

export type Order = {
  /** The Konnect payment reference doubles as the order id. */
  id: string;
  item: string;
  amount: number;
  currency: "TND";
  status: "pending" | "paid" | "failed";
  payUrl: string;
  createdAt: string;
  paidAt?: string;
  /** Every webhook delivery, newest last, so the page can show them. */
  events: { at: string; note: string }[];
};

/**
 * Orders need to be visible from every serverless instance, so on Vercel
 * they go in Postgres (Neon, free tier) when DATABASE_URL is set. Without
 * it, an in-memory map: right for one local process, wrong for a fleet.
 */
export interface OrderStore {
  get(id: string): Promise<Order | undefined>;
  save(order: Order): Promise<void>;
}

const shared = globalThis as unknown as {
  __tnpayOrders?: Map<string, Order>;
  __tnpayStore?: OrderStore;
};

function memoryStore(): OrderStore {
  const orders = (shared.__tnpayOrders ??= new Map<string, Order>());
  return {
    async get(id) {
      return orders.get(id);
    },
    async save(order) {
      orders.set(order.id, order);
    },
  };
}

function postgresStore(url: string): OrderStore {
  const sql = neon(url);
  let ready: Promise<void> | undefined;
  const ensure = () =>
    (ready ??= sql`
      CREATE TABLE IF NOT EXISTS demo_orders (
        id text PRIMARY KEY,
        data jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      )`.then(() => undefined));
  return {
    async get(id) {
      await ensure();
      const rows = await sql`SELECT data FROM demo_orders WHERE id = ${id}`;
      return rows[0]?.data as Order | undefined;
    },
    async save(order) {
      await ensure();
      await sql`
        INSERT INTO demo_orders (id, data, updated_at)
        VALUES (${order.id}, ${JSON.stringify(order)}::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
    },
  };
}

export function getStore(): OrderStore {
  if (shared.__tnpayStore) return shared.__tnpayStore;
  const url = process.env.DATABASE_URL;
  shared.__tnpayStore = url ? postgresStore(url) : memoryStore();
  return shared.__tnpayStore;
}

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function newOrder(input: {
  id: string;
  item: string;
  amount: number;
  payUrl: string;
}): Order {
  return {
    ...input,
    currency: "TND",
    status: "pending",
    createdAt: new Date().toISOString(),
    events: [],
  };
}

export function note(order: Order, text: string) {
  order.events.push({ at: new Date().toISOString(), note: text });
}
