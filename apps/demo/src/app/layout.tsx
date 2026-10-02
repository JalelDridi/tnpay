import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "tnpay demo · Konnect checkout",
  description:
    "A checkout against the Konnect sandbox using @tnpay/konnect: typed client, verified webhooks, applied once.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
            <a href="/" className="text-lg font-semibold tracking-tight">
              tnpay <span className="text-stone-400">demo</span>
            </a>
            <a
              href="https://github.com/JalelDridi/tnpay"
              className="text-sm text-stone-600 underline underline-offset-4 hover:text-stone-900"
            >
              Source on GitHub
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-2xl px-5 py-10">{children}</main>
      </body>
    </html>
  );
}
