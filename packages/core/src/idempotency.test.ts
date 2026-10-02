import { describe, expect, it } from "vitest";
import { createMemoryStore } from "./idempotency.js";

describe("createMemoryStore", () => {
  it("lets a key be claimed once", async () => {
    const store = createMemoryStore();

    expect(await store.claim("a")).toBe(true);
    expect(await store.claim("a")).toBe(false);
  });

  it("keeps keys independent", async () => {
    const store = createMemoryStore();

    expect(await store.claim("a")).toBe(true);
    expect(await store.claim("b")).toBe(true);
  });

  it("can be claimed again after release", async () => {
    const store = createMemoryStore();
    await store.claim("a");
    await store.release("a");

    expect(await store.claim("a")).toBe(true);
  });

  it("gives exactly one winner to concurrent claims", async () => {
    const store = createMemoryStore();

    const results = await Promise.all(
      Array.from({ length: 10 }, () => store.claim("race")),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
