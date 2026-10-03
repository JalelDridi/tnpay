import { describe, expect, it } from "vitest";
import { mapStatus } from "./status";

describe("mapStatus", () => {
  it("maps Flouci's statuses onto the four the SDK exposes", () => {
    expect(mapStatus("SUCCESS")).toBe("paid");
    expect(mapStatus("PENDING")).toBe("pending");
    expect(mapStatus("PREAUTH_SUCCESS")).toBe("pending");
    expect(mapStatus("EXPIRED")).toBe("expired");
    expect(mapStatus("FAILURE")).toBe("failed");
    expect(mapStatus("SYSTEM_FAILURE")).toBe("failed");
  });

  it("is case-insensitive and treats the unknown as pending", () => {
    expect(mapStatus("success")).toBe("paid");
    expect(mapStatus("SOMETHING_NEW")).toBe("pending");
  });
});
