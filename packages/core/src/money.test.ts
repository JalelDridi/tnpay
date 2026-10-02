import { describe, expect, it } from "vitest";
import { formatMoney, tnd, toMinor } from "./money.js";

describe("tnd", () => {
  it("converts dinars to millimes", () => {
    expect(tnd(12.5)).toBe(12500);
    expect(tnd(0.001)).toBe(1);
    expect(tnd(5)).toBe(5000);
  });

  it("survives floating point noise", () => {
    expect(tnd(0.1 + 0.2)).toBe(300);
    expect(tnd(19.99)).toBe(19990);
  });

  it("rejects amounts finer than a millime, negatives and non-numbers", () => {
    expect(() => tnd(0.0005)).toThrow(RangeError);
    expect(() => tnd(-1)).toThrow(RangeError);
    expect(() => tnd(Number.NaN)).toThrow(RangeError);
    expect(() => tnd(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("toMinor", () => {
  it("uses millimes for TND and cents for EUR and USD", () => {
    expect(toMinor(12.5, "TND")).toBe(12500);
    expect(toMinor(12.5, "EUR")).toBe(1250);
    expect(toMinor(12.5, "USD")).toBe(1250);
  });

  it("rejects fractions of a cent", () => {
    expect(() => toMinor(0.005, "EUR")).toThrow(RangeError);
  });
});

describe("formatMoney", () => {
  it("formats each currency the way Tunisians read it", () => {
    expect(formatMoney(12500, "TND")).toBe("12.500 DT");
    expect(formatMoney(5000, "TND")).toBe("5.000 DT");
    expect(formatMoney(1250, "EUR")).toBe("12.50 €");
    expect(formatMoney(1250, "USD")).toBe("$12.50");
  });

  it("rejects non-integer minor amounts", () => {
    expect(() => formatMoney(12.5, "TND")).toThrow(RangeError);
  });
});
