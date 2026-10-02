import { describe, expect, it } from "vitest";
import { Konnect } from "./client.js";

const apiKey = process.env.KONNECT_API_KEY;
const walletId = process.env.KONNECT_WALLET_ID;

/**
 * Talks to the real Konnect sandbox. Skipped unless both variables are set,
 * so CI without the secrets stays green. Never prints the values.
 */
describe.skipIf(!apiKey || !walletId)("Konnect sandbox", () => {
  it("creates a 1 TND payment and reads it back as pending", async () => {
    const konnect = new Konnect({
      apiKey: apiKey!,
      walletId: walletId!,
      environment: "sandbox",
    });

    const { payUrl, paymentRef } = await konnect.payments.create({
      amount: 1000,
      description: "tnpay sandbox smoke test",
      lifespan: 5,
    });

    expect(payUrl).toContain("konnect.network");
    expect(paymentRef).toMatch(/^[0-9a-f]{24}$/);

    const payment = await konnect.payments.get(paymentRef);
    expect(payment.status).toBe("pending");
    expect(payment.amount).toBe(1000);
    expect(payment.currency).toBe("TND");
  });
});
