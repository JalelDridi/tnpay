/**
 * Gateways take integers in the smallest unit: millimes for the dinar,
 * cents for euros and dollars. These helpers get there without floating
 * point surprises and refuse anything that would lose money.
 */

export type Currency = "TND" | "EUR" | "USD";

const MINOR_PER_MAJOR: Record<Currency, number> = {
  TND: 1000,
  EUR: 100,
  USD: 100,
};

/** Converts a major amount (12.5) to the minor integer unit (12500 for TND). */
export function toMinor(major: number, currency: Currency): number {
  if (!Number.isFinite(major) || major < 0) {
    throw new RangeError(
      `Amount must be a finite, non-negative number, got ${major}`,
    );
  }
  const factor = MINOR_PER_MAJOR[currency];
  const scaled = major * factor;
  const rounded = Math.round(scaled);
  // 0.1 + 0.2 is 0.30000000000000004; that is noise, not a fraction of a millime.
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new RangeError(
      `${major} ${currency} is finer than the smallest unit (1/${factor})`,
    );
  }
  return rounded;
}

/** Dinars to millimes: tnd(12.5) === 12500. */
export function tnd(major: number): number {
  return toMinor(major, "TND");
}

/** Formats a minor amount for display: "12.500 DT", "12.50 €", "$12.50". */
export function formatMoney(minor: number, currency: Currency): string {
  if (!Number.isInteger(minor)) {
    throw new RangeError(`Minor amount must be an integer, got ${minor}`);
  }
  const factor = MINOR_PER_MAJOR[currency];
  const decimals = Math.log10(factor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / factor);
  const fraction = String(abs % factor).padStart(decimals, "0");
  const number = `${whole}.${fraction}`;
  switch (currency) {
    case "TND":
      return `${sign}${number} DT`;
    case "EUR":
      return `${sign}${number} €`;
    case "USD":
      return `${sign}$${number}`;
  }
}
