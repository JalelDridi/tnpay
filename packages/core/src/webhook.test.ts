import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./errors";
import type { PaymentStatus } from "./status";
import { createVerifiedWebhookHandler } from "./webhook";

type P = { status: PaymentStatus; ref: string };

function setup(statuses: Record<string, PaymentStatus>) {
  const onPaid = vi.fn<(p: P) => Promise<void>>(async () => {});
  const lookup = vi.fn(async (ref: string): Promise<P> => {
    const status = statuses[ref];
    if (!status) throw new ApiError(404, { error: "nope" }, "http://g/" + ref);
    return { status, ref };
  });
  const handler = createVerifiedWebhookHandler<P>({
    lookup,
    keyPrefix: "test",
    queryParam: "payment_id",
    onPaid,
  });
  return { handler, onPaid, lookup };
}

const hit = (handler: (r: Request) => Promise<Response>, query: string) =>
  handler(new Request(`http://merchant.test/hook${query}`));

describe("createVerifiedWebhookHandler", () => {
  it("reads the reference from a JSON body on POST", async () => {
    const { handler, onPaid } = setup({ abc: "paid" });

    const response = await handler(
      new Request("http://merchant.test/hook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payment_id: "abc", status: "whatever" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(onPaid).toHaveBeenCalledTimes(1);
  });

  it("names the missing parameter", async () => {
    const { handler } = setup({});

    const response = await hit(handler, "");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "missing_payment_id" });
  });

  it("never trusts a status in the request, only the lookup", async () => {
    const { handler, onPaid, lookup } = setup({ abc: "pending" });

    await hit(handler, "?payment_id=abc&success=True&status=SUCCESS");

    expect(lookup).toHaveBeenCalledWith("abc");
    expect(onPaid).not.toHaveBeenCalled();
  });

  it("applies a paid payment once across deliveries", async () => {
    const { handler, onPaid } = setup({ abc: "paid" });

    const first = await hit(handler, "?payment_id=abc");
    const second = await hit(handler, "?payment_id=abc");

    expect(onPaid).toHaveBeenCalledTimes(1);
    expect(await first.json()).toEqual({ ok: true, status: "paid" });
    expect(await second.json()).toEqual({
      ok: true,
      status: "paid",
      duplicate: true,
    });
  });
});
