// The Content Security Policy in firebase.json is a hard allow-list: anything the app
// loads from an origin it does not name is silently blocked in production. The Hosting
// emulator does not apply custom headers, so this test adds the real policy to the page
// itself and fails on any violation while the main screens and dialogs are used.

import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const policy = JSON.parse(readFileSync("firebase.json", "utf8"))
  .hosting.headers.find((h) => h.source === "**")
  .headers.find((h) => h.key === "Content-Security-Policy").value;

test("the main screens and dialogs break none of the Content Security Policy", async ({
  page,
}) => {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() !== "document") return route.continue();
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": policy },
    });
  });
  await page.addInitScript(() => {
    /** @type {any} */ (window).__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      /** @type {any} */ (window).__violations.push(
        `${e.violatedDirective}: ${e.blockedURI.slice(0, 100)}`,
      );
    });
  });

  await page.goto("/");
  await expect(page.locator(".leaflet-tile-container")).toBeAttached();

  // The Add point dialog has its own map, which asks for tiles from other subdomains.
  await page.getByRole("button", { name: "Add point" }).click();
  await expect(page.locator("wc-location-field .lf-map")).toBeVisible();
  await expect(
    page.locator("wc-location-field .leaflet-tile-container"),
  ).toBeAttached();
  await page
    .locator("wa-dialog")
    .getByRole("button", { name: "Cancel" })
    .click();

  await page.getByRole("button", { name: "Options" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Draw an area" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();

  // The Projects page and its dialog.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Projects", exact: true })
    .click();
  await page.getByRole("button", { name: "New project" }).click();
  const projectDialog = page.locator("wa-dialog[data-project-dialog]");
  await expect(
    projectDialog.locator("select[name=responsible] option"),
  ).not.toHaveCount(0);
  await projectDialog.getByRole("button", { name: "Cancel" }).click();

  // One project's page, with its action and note dialogs.
  await page.getByRole("link", { name: "Village green refresh" }).click();
  await expect(page.locator("li.action-card").first()).toBeVisible();
  await page.getByRole("button", { name: "Add action" }).click();
  const actionDialog = page.locator("wa-dialog[data-action-dialog]");
  await expect(
    actionDialog.locator("select[name=assignee] option"),
  ).not.toHaveCount(1);
  await actionDialog.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Add note" }).click();
  await page
    .locator("wa-dialog[data-note-dialog]")
    .getByRole("button", { name: "Cancel" })
    .click();

  for (const link of ["Points", "People", "Activity", "Help", "About"]) {
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: link, exact: true })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  const violations = await page.evaluate(
    () => /** @type {any} */ (window).__violations,
  );
  expect(violations).toEqual([]);

  // A link from a project is a full page load, which starts a fresh list of violations,
  // so it is checked on its own.
  await page.goto("/?place=nothing-here");
  await expect(page.locator(".map-status")).toBeVisible();
  expect(
    await page.evaluate(() => /** @type {any} */ (window).__violations),
  ).toEqual([]);
});
