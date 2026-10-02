import { formatMoney, tnd } from "@tnpay/konnect";
import { getMode } from "@/lib/konnect";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    brand: "Visa",
    result: "succeeds",
    number: "4509 2111 1111 1119",
    exp: "12/26",
    cvc: "748",
  },
  {
    brand: "Mastercard",
    result: "succeeds",
    number: "5440 2127 1111 1110",
    exp: "12/26",
    cvc: "665",
  },
  {
    brand: "Mastercard",
    result: "fails",
    number: "5471 2511 1111 1116",
    exp: "11/23",
    cvc: "858",
  },
];

export default async function Home() {
  const mode = getMode();
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">
          A Konnect checkout, done safely
        </h1>
        <p className="mt-3 text-lg text-stone-600">
          This shop uses{" "}
          <code className="rounded bg-stone-200 px-1">@tnpay/konnect</code>. Pay
          for the cookie, and watch the order flip to paid when Konnect&apos;s
          webhook arrives and is verified.
        </p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-xl font-semibold">Chocolate chip cookie</h2>
            <p className="mt-1 text-stone-600">
              Baked this morning. One per order.
            </p>
          </div>
          <p className="text-2xl font-semibold">{formatMoney(tnd(5), "TND")}</p>
        </div>
        {mode === "unconfigured" ? (
          <p className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            This deployment has no Konnect sandbox credentials yet, so the
            checkout is switched off. Run it locally with{" "}
            <code>pnpm --filter demo dev</code> and it uses the fake Konnect.
          </p>
        ) : (
          <form method="post" action="/api/checkout" className="mt-6">
            <button
              type="submit"
              className="rounded-full bg-stone-900 px-6 py-3 text-base font-medium text-white hover:bg-stone-700"
            >
              Pay with Konnect
            </button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        {mode === "sandbox" ? (
          <>
            <h2 className="font-semibold">Sandbox test cards</h2>
            <p className="mt-1 text-sm text-stone-600">
              Nothing real is charged. On Konnect&apos;s page, pay by card with
              one of these.
            </p>
            <table className="mt-4 w-full text-sm">
              <thead className="text-left text-stone-500">
                <tr>
                  <th className="py-1 pr-3 font-medium">Card</th>
                  <th className="py-1 pr-3 font-medium">Number</th>
                  <th className="py-1 pr-3 font-medium">Exp</th>
                  <th className="py-1 font-medium">CVC</th>
                </tr>
              </thead>
              <tbody>
                {CARDS.map((card) => (
                  <tr key={card.number} className="border-t border-stone-100">
                    <td className="py-2 pr-3">
                      {card.brand}, {card.result}
                    </td>
                    <td className="py-2 pr-3 font-mono">{card.number}</td>
                    <td className="py-2 pr-3 font-mono">{card.exp}</td>
                    <td className="py-2 font-mono">{card.cvc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : mode === "unconfigured" ? (
          <>
            <h2 className="font-semibold">Waiting for sandbox credentials</h2>
            <p className="mt-1 text-sm text-stone-600">
              Once <code>KONNECT_API_KEY</code> and{" "}
              <code>KONNECT_WALLET_ID</code> are set on this deployment, this
              page takes real sandbox payments.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-semibold">Running against the fake Konnect</h2>
            <p className="mt-1 text-sm text-stone-600">
              No credentials are set, so the demo started the package&apos;s
              fake Konnect server in this process. The payment page it shows has
              Pay and Fail buttons instead of a card form; the webhook is
              delivered exactly as Konnect would.
            </p>
          </>
        )}
      </section>

      <section className="text-sm text-stone-600">
        <h2 className="font-semibold text-stone-900">What the code does</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            <code>payments.create()</code> makes the payment and gets a pay URL.
          </li>
          <li>
            Konnect calls <code>/api/konnect/webhook?payment_ref=…</code>. There
            is no signature, so the handler fetches the payment from Konnect
            before believing anything.
          </li>
          <li>
            <code>onPaid</code> runs once per payment, even if the webhook is
            delivered twice.
          </li>
        </ol>
      </section>
    </div>
  );
}
