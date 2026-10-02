/**
 * Remembers which work has already been done, so a webhook delivered twice
 * is applied once. Implement it on your database for anything that runs on
 * more than one instance; see docs/idempotency.md for a Postgres version.
 */
export interface IdempotencyStore {
  /** Claims the key. Returns false if it was already claimed. */
  claim(key: string): Promise<boolean>;
  /** Gives the key back, so a failed attempt can be retried. */
  release(key: string): Promise<void>;
}

/** Per-process store. Fine for development and a single instance; nothing more. */
export function createMemoryStore(): IdempotencyStore {
  const claimed = new Set<string>();
  return {
    async claim(key) {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    async release(key) {
      claimed.delete(key);
    },
  };
}
