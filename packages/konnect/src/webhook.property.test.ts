import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Konnect } from "./client";
import { createFakeKonnect, type FakeKonnect } from "./fake/index";

type Delivery = "pending" | "pay" | "repeat";

/**
 * Whatever Konnect delivers, in whatever order and however many times,
 * `onPaid` runs at most once, and exactly once if the payment was paid.
 */
describe("webhook handler under any delivery sequence", () => {
  let fake: FakeKonnect;
  let konnect: Konnect;

  beforeAll(async () => {
    fake = await createFakeKonnect();
    konnect = new Konnect({
      apiKey: fake.apiKey,
      walletId: "w",
      baseUrl: fake.baseUrl,
    });
  });

  afterAll(() => fake.close());

  it("calls onPaid at most once, and once if paid", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<Delivery>("pending", "pay", "repeat"), {
          minLength: 1,
          maxLength: 8,
        }),
        async (sequence) => {
          let paidCalls = 0;
          const handler = konnect.webhooks.handler({
            onPaid: async () => {
              paidCalls += 1;
            },
          });
          const { paymentRef } = await konnect.payments.create({ amount: 100 });
          const deliver = () =>
            handler(
              new Request(
                `http://merchant.test/hook?payment_ref=${paymentRef}`,
              ),
            );

          let paid = false;
          for (const step of sequence) {
            if (step === "pay" && !paid) {
              paid = true;
              // Mark it paid on the fake without a network delivery, then deliver by hand.
              await fake.pay(paymentRef, { times: 0 });
            }
            await deliver();
          }

          expect(paidCalls).toBe(paid ? 1 : 0);
          expect((await konnect.payments.get(paymentRef)).status).toBe(
            paid ? "paid" : "pending",
          );
        },
      ),
      { numRuns: 40 },
    );
  });
});
