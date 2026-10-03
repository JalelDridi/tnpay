import { describe, expect, it } from "vitest";
import { Flouci } from "./client";

const publicKey = process.env.FLOUCI_PUBLIC_KEY;
const privateKey = process.env.FLOUCI_PRIVATE_KEY;

/**
 * Talks to the real Flouci sandbox app. Skipped unless both variables are
 * set, so CI without the secrets stays green. Never prints the values.
 */
describe.skipIf(!publicKey || !privateKey)("Flouci sandbox", () => {
  it("creates a 1 TND payment and reads it back as pending", async () => {
    const flouci = new Flouci({
      publicKey: publicKey!,
      privateKey: privateKey!,
    });

    const { payUrl, paymentId } = await flouci.payments.create({
      amount: 1000,
      successLink: "https://example.com/ok",
      failLink: "https://example.com/ko",
      trackingId: "tnpay-smoke",
      sessionTimeoutSecs: 300,
    });

    expect(payUrl).toContain("flouci.com");
    expect(paymentId.length).toBeGreaterThan(8);

    const payment = await flouci.payments.get(paymentId);
    expect(payment.status).toBe("pending");
    expect(payment.amount).toBe(1000);
    expect(payment.trackingId).toBe("tnpay-smoke");
  });
});
