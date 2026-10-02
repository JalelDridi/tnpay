import { describe, expect, it } from "vitest";
import { mapStatus } from "./status";
import type { KonnectPayment } from "./types";

const now = new Date("2026-10-02T12:00:00Z");
const base: KonnectPayment = {
  id: "p1",
  status: "pending",
  amount: 5000,
  token: "TND",
};

describe("mapStatus", () => {
  it("maps completed to paid", () => {
    expect(mapStatus({ ...base, status: "completed" }, now)).toBe("paid");
  });

  it("maps pending to pending", () => {
    expect(mapStatus(base, now)).toBe("pending");
    expect(
      mapStatus({ ...base, expirationDate: "2026-10-02T13:00:00Z" }, now),
    ).toBe("pending");
  });

  it("maps a pending payment past its expiry to expired", () => {
    expect(
      mapStatus({ ...base, expirationDate: "2026-10-02T11:59:00Z" }, now),
    ).toBe("expired");
  });

  it("maps a pending payment whose last attempt failed to failed", () => {
    const failed = {
      ...base,
      transactions: [{ status: "success" }, { status: "failed" }],
    };
    expect(mapStatus(failed, now)).toBe("failed");
    expect(
      mapStatus({ ...base, transactions: [{ status: "DECLINED" }] }, now),
    ).toBe("failed");
  });

  it("stays pending when the last attempt is still in progress", () => {
    expect(
      mapStatus(
        {
          ...base,
          transactions: [{ status: "failed" }, { status: "pending" }],
        },
        now,
      ),
    ).toBe("pending");
  });

  it("treats completed as paid even with a failed attempt in the history", () => {
    expect(
      mapStatus(
        { ...base, status: "completed", transactions: [{ status: "failed" }] },
        now,
      ),
    ).toBe("paid");
  });

  it("treats an unknown status as pending", () => {
    expect(mapStatus({ ...base, status: "whatever" }, now)).toBe("pending");
  });
});
