# Idempotency stores

The webhook handler remembers which payments it has already applied through a small interface:

```ts
interface IdempotencyStore {
  /** Claims the key. Returns false if it was already claimed. */
  claim(key: string): Promise<boolean>;
  /** Gives the key back, so a failed attempt can be retried. */
  release(key: string): Promise<void>;
}
```

Keys look like `konnect:paid:<paymentRef>`.

## The default

`createMemoryStore()` keeps claims in a `Set` in the process. It is right for development, tests and a single long-lived server. It is wrong for anything with more than one instance, or on serverless platforms where each request may land on a fresh process: two instances would each believe they were first.

## PostgreSQL

One table and one statement:

```sql
CREATE TABLE idempotency_keys (
  key        text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

```ts
import type { IdempotencyStore } from "@tnpay/konnect";
import { sql } from "./db"; // any client that runs parameterised SQL

export const store: IdempotencyStore = {
  async claim(key) {
    const rows = await sql`
      INSERT INTO idempotency_keys (key) VALUES (${key})
      ON CONFLICT DO NOTHING
      RETURNING key`;
    return rows.length === 1;
  },
  async release(key) {
    await sql`DELETE FROM idempotency_keys WHERE key = ${key}`;
  },
};
```

`INSERT … ON CONFLICT DO NOTHING RETURNING` is atomic: of two concurrent claims, exactly one gets a row back. That is the same guarantee the ledger in [Payout Ledger](https://github.com/JalelDridi/payout-ledger) relies on.

## Doing the work in the same transaction

For the strongest guarantee, claim the key and apply the order change in one database transaction, and let the handler's `onPaid` be that transaction. If it throws, the handler releases the claim; if it commits, the claim and the order change land together.

## Redis

`SET key 1 NX` returns `OK` only for the first caller; `DEL key` releases. Add an expiry only if you are sure a late duplicate after that time is acceptable.
