import { Konnect } from "@tnpay/konnect";
import type { FakeKonnect } from "@tnpay/konnect/fake";

/**
 * One client for the whole process. With real credentials it talks to the
 * Konnect sandbox; without them (or with DEMO_FAKE=1) it starts the fake
 * Konnect in-process, so the demo runs anywhere with nothing to sign up for.
 */
type Shared = {
  client?: Konnect;
  fake?: FakeKonnect;
  mode?: "sandbox" | "fake";
};
const shared = globalThis as unknown as { __tnpayDemo?: Shared };
const state: Shared = (shared.__tnpayDemo ??= {});

export async function getKonnect(): Promise<{
  client: Konnect;
  mode: "sandbox" | "fake";
}> {
  if (state.client && state.mode)
    return { client: state.client, mode: state.mode };

  const apiKey = process.env.KONNECT_API_KEY;
  const walletId = process.env.KONNECT_WALLET_ID;
  const useFake = process.env.DEMO_FAKE === "1" || !apiKey || !walletId;

  if (useFake) {
    const { createFakeKonnect } = await import("@tnpay/konnect/fake");
    state.fake ??= await createFakeKonnect({ port: 7320 });
    state.client = new Konnect({
      apiKey: state.fake.apiKey,
      walletId: "demo-wallet",
      baseUrl: state.fake.baseUrl,
    });
    state.mode = "fake";
  } else {
    state.client = new Konnect({ apiKey, walletId, environment: "sandbox" });
    state.mode = "sandbox";
  }
  return { client: state.client, mode: state.mode };
}
