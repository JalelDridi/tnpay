import { Konnect } from "@tnpay/konnect";
import type { FakeKonnect } from "@tnpay/konnect/fake";

/**
 * One client for the whole process. With real credentials it talks to the
 * Konnect sandbox; without them (or with DEMO_FAKE=1) it starts the fake
 * Konnect in-process, so the demo runs anywhere with nothing to sign up for.
 */
export type Mode = "sandbox" | "fake" | "unconfigured";

type Shared = {
  client?: Konnect;
  fake?: FakeKonnect;
  mode?: Mode;
};
const shared = globalThis as unknown as { __tnpayDemo?: Shared };
const state: Shared = (shared.__tnpayDemo ??= {});

/** Where the demo is pointed. "unconfigured" only happens on Vercel without keys. */
export function getMode(): Mode {
  const apiKey = process.env.KONNECT_API_KEY;
  const walletId = process.env.KONNECT_WALLET_ID;
  if (process.env.DEMO_FAKE === "1") return "fake";
  if (apiKey && walletId) return "sandbox";
  // The fake binds a local port, which a serverless function cannot offer visitors.
  return process.env.VERCEL ? "unconfigured" : "fake";
}

export async function getKonnect(): Promise<{ client: Konnect; mode: Mode }> {
  if (state.client && state.mode)
    return { client: state.client, mode: state.mode };

  const apiKey = process.env.KONNECT_API_KEY;
  const walletId = process.env.KONNECT_WALLET_ID;
  const mode = getMode();
  if (mode === "unconfigured") {
    throw new Error(
      "Set KONNECT_API_KEY and KONNECT_WALLET_ID to run the demo",
    );
  }

  if (mode === "fake") {
    const { createFakeKonnect } = await import("@tnpay/konnect/fake");
    state.fake ??= await createFakeKonnect({ port: 7320 });
    state.client = new Konnect({
      apiKey: state.fake.apiKey,
      walletId: "demo-wallet",
      baseUrl: state.fake.baseUrl,
    });
    state.mode = "fake";
  } else {
    state.client = new Konnect({
      apiKey: apiKey!,
      walletId: walletId!,
      environment: "sandbox",
    });
    state.mode = "sandbox";
  }
  return { client: state.client, mode: state.mode };
}
