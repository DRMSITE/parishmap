// The sign-in gate, against a normal build (port 4174). Completing a sign-in needs a
// real account and authenticator, so these tests cover what an anonymous visitor sees
// and that nothing behind the gate is reachable. They make no Firebase sign-in calls.

import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

test.use({ baseURL: "http://localhost:4174" });

test("an anonymous visitor sees only the sign-in form", async ({ page }) => {
  const errors = /** @type {string[]} */ ([]);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 1, name: "Sign in" }),
  ).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Password" })).toBeVisible();
  await expect(page).toHaveTitle(/Sign in/);

  // Nothing from behind the gate is rendered or offered.
  await expect(page.locator(".leaflet-container")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Points" })).toBeHidden();

  expect(await axeViolations(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("the forgotten password form opens and has no accessibility violations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Forgotten your password?").click();
  await expect(page.getByLabel("Account email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send link" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
});

test.describe("every page is behind the gate", () => {
  for (const path of [
    "/",
    "/list",
    "/about",
    "/help",
    "/people",
    "/activity",
    "/nowhere",
  ]) {
    test(`${path} shows the sign-in form`, async ({ page }) => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: "Sign in" }),
      ).toBeVisible();
      await expect(page.locator(".leaflet-container")).toHaveCount(0);
      await expect(page.locator("[data-point-dialog]")).toHaveCount(0);
    });
  }
});

test("asks for both fields before contacting the server", async ({ page }) => {
  const requests = /** @type {string[]} */ ([]);
  page.on("request", (r) => {
    if (/identitytoolkit|googleapis/.test(r.url())) requests.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByLabel("Email address")).toBeVisible();
  const before = requests.length;

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Enter your email address and password.",
  );
  expect(requests.length).toBe(before);
});

test("the form works on a phone without horizontal scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await expect(page.getByLabel("Email address")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("is not indexed by search engines", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});
