import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

async function openActivity(page, { viaLink = true } = {}) {
  await page.goto("/");
  // On a phone the navigation is a drawer, so go straight to the page there.
  if (viaLink)
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Activity" })
      .click();
  else await page.goto("/activity");
  await expect(
    page.getByRole("heading", { name: "Activity", level: 1 }),
  ).toBeVisible();
}

test("lists the newest activity, loads older entries, and has no accessibility violations", async ({
  page,
}) => {
  await openActivity(page);
  await expect(page.locator("tbody tr")).toHaveCount(50);
  await expect(page.locator("[data-status]")).toContainText("older ones");
  // The newest entry is first.
  await expect(page.locator("tbody tr").first()).toContainText("Invited");
  expect(await axeViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(60);
  await expect(page.getByRole("button", { name: "Load more" })).toBeHidden();
  await expect(page.locator("[data-status]")).toContainText(
    "60 entries shown.",
  );
});

test("phone: the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openActivity(page, { viaLink: false });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  expect(await axeViolations(page)).toEqual([]);
});
