import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

test("skip link is the first tab stop and moves focus into the content", async ({
  page,
}) => {
  await page.goto("/about");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: /skip to content/i });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  // Focus must leave the skip link and land in or on the main content.
  const inMain = await page.evaluate(() => {
    const active = document.activeElement;
    return Boolean(active?.closest("main") || active?.id === "app");
  });
  expect(inMain).toBe(true);
});

test("there is exactly one skip link", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /skip to/i })).toHaveCount(1);
});

test("desktop shows the navigation beside the content, with no accessibility violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "About" }),
  ).toBeVisible();
  const violations = await axeViolations(page, { excludeMap: true });
  expect(violations).toEqual([]);
  const box = await page.locator("#map").boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(300);
  await page.screenshot({ path: "test-results/desktop.png" });
});

test("phone: the drawer opens, navigates and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open menu" });
  await expect(toggle).toBeVisible();
  await page.screenshot({ path: "test-results/phone-closed.png" });
  await toggle.click();
  const about = page.getByRole("link", { name: "About", exact: true });
  await expect(about).toBeVisible();
  await page.screenshot({ path: "test-results/phone-open.png" });
  await about.click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(about).toBeHidden();
  const violations = await axeViolations(page);
  expect(violations).toEqual([]);
});

test("phone: the toolbar is a compact and nothing overflows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  const buttons = ["Add point", "Pick on map", "Options"].map((name) =>
    page.getByRole("button", { name }),
  );
  const boxes = await Promise.all(buttons.map((b) => b.boundingBox()));
  // Filled and outlined buttons differ by a pixel of border, so compare centres
  // with a small tolerance rather than exact tops.
  const centres = boxes.map((b) => (b?.y ?? -100) + (b?.height ?? 0) / 2);
  expect(Math.max(...centres) - Math.min(...centres)).toBeLessThan(3);
  const toolbar = await page.locator(".map-toolbar").boundingBox();
  // Two rows now: the three actions, then the line and area drawing buttons.
  expect(toolbar?.height ?? 999).toBeLessThan(100);
  const map = await page.locator("#map").boundingBox();
  expect(map?.height ?? 0).toBeGreaterThan(560);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: "test-results/phone-toolbar.png" });
});

test("very narrow screen with the picking message: no clipping or horizontal scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "Pick on map" }).click();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  await expect(
    page.getByText("Click the map where you want the point."),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  for (const name of ["Add point", "Cancel", "Options"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: "test-results/phone-320-picking.png" });
});
