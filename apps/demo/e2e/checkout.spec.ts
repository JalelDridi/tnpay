import { expect, test } from "@playwright/test";

test("a cookie can be bought, and the webhook settles the order", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A Konnect checkout, done safely" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Pay with Konnect" }).click();
  await expect(page).toHaveURL(/\/orders\/[0-9a-f]+$/);
  await expect(page.getByRole("status")).toContainText("Waiting for payment");

  // The pay link opens Konnect (here, the fake) in a new tab.
  const [konnect] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: /on Konnect$/ }).click(),
  ]);
  await konnect.getByRole("button", { name: "Pay" }).click();
  await expect(konnect.getByText("is completed")).toBeVisible();
  await konnect.close();

  // Back on the shop, polling picks up the webhook's work.
  await expect(page.getByRole("status")).toContainText("Paid", {
    timeout: 10_000,
  });
  await expect(page.getByText("Order marked paid")).toBeVisible();
});

test("a failed payment is reported, not marked paid", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pay with Konnect" }).click();

  const [konnect] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("link", { name: /on Konnect$/ }).click(),
  ]);
  await konnect.getByRole("button", { name: "Fail" }).click();
  await konnect.close();

  await expect(page.getByRole("status")).toContainText("Payment failed", {
    timeout: 10_000,
  });
});
