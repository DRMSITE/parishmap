import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

test("the Help page is in the navigation and has no accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Help" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Help", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Signing in" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Adding to the map" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true }),
  ).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("the Clerk's part is shown to someone who can manage people", async ({
  page,
}) => {
  // Local mode stands in for an administrator.
  await page.goto("/help");
  await expect(
    page.getByRole("heading", { name: "For the Clerk and administrators" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Inviting someone" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "When someone loses their phone" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Starting a project" }),
  ).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test("phone: the Help page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/help");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
