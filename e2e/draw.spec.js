import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

const dialog = (page) => page.locator("wa-dialog[data-point-dialog]");

/** Click three corners on the map, then Finish. */
async function drawTriangle(page) {
  await page.getByRole("button", { name: "Draw an area" }).click();
  const map = page.locator("#map");
  await map.click({ position: { x: 200, y: 200 } });
  await map.click({ position: { x: 320, y: 220 } });
  await map.click({ position: { x: 260, y: 320 } });
}

test("the parish boundary is drawn, and its flag hides it", async ({
  page,
}) => {
  await page.goto("/");
  const boundary = page.locator("#map .leaflet-overlay-pane path");
  await expect(boundary.first()).toBeAttached();
  await page.getByRole("button", { name: "Options" }).click();
  await page
    .locator("wa-switch", { hasText: "Show the parish boundary" })
    .locator('[part="control"]')
    .click();
  await expect(page.locator("#map .leaflet-overlay-pane path")).toHaveCount(0);
});

test("draws an area, saves it, and it appears on the map and in the list", async ({
  page,
}) => {
  await page.goto("/");
  await drawTriangle(page);
  await expect(page.locator(".map-status")).toContainText("3 points");
  await page.getByRole("button", { name: "Finish" }).click();

  const form = dialog(page);
  await expect(form).toHaveAttribute("label", "Add an area");
  await expect(form.getByLabel("Points on the shape")).toHaveValue(
    /^-?\d+\.\d+, -?\d+\.\d+\n.*\n.*$/,
  );
  await form.getByLabel("Title").fill("Play area extension");
  await form.getByRole("button", { name: "Save area" }).click();

  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(1);
  // The area itself is a filled path, in addition to the boundary outline.
  await expect(page.locator("#map path[fill-opacity='0.2']")).toHaveCount(1);

  await page.reload();
  await expect(page.locator("#map path[fill-opacity='0.2']")).toHaveCount(1);

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Points" })
    .click();
  await expect(page.locator(".point-item")).toContainText("Area with 3 points");
});

test("draws a line with Undo, and Escape cancels", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Draw a line" }).click();
  const map = page.locator("#map");
  await map.click({ position: { x: 200, y: 200 } });
  await map.click({ position: { x: 300, y: 240 } });
  await map.click({ position: { x: 360, y: 300 } });
  await expect(page.locator(".map-status")).toContainText("3 points");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".map-status")).toContainText("2 points");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Draw a line" })).toBeVisible();
  await expect(dialog(page)).not.toHaveJSProperty("open", true);
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(0);
});

test("Finish with too few points explains, and keeps drawing", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Draw an area" }).click();
  await page.locator("#map").click({ position: { x: 200, y: 200 } });
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(page.locator(".map-status")).toContainText(
    "An area needs at least 3",
  );
  await expect(page.getByRole("button", { name: "Finish" })).toBeVisible();
});

test("a keyboard user can add points at the centre of the map", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Draw a line" }).click();
  await page.getByRole("button", { name: "Add at centre" }).click();
  await page.locator("#map").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Add at centre" }).click();
  await expect(page.locator(".map-status")).toContainText("2 points");
  await page.getByRole("button", { name: "Finish" }).click();
  await expect(dialog(page)).toHaveAttribute("label", "Add a line");
});

test("edits a shape's points as text, and rejects a bad line", async ({
  page,
}) => {
  await page.goto("/");
  await drawTriangle(page);
  await page.getByRole("button", { name: "Finish" }).click();
  await dialog(page).getByLabel("Title").fill("Verge");
  await dialog(page).getByRole("button", { name: "Save area" }).click();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Points" })
    .click();
  await page.getByRole("button", { name: "Edit Verge" }).click();
  const form = page.locator('wa-dialog[label="Edit area"]');
  const points = form.getByLabel("Points on the shape");
  await points.fill("52.39, 0.2\nnot a point\n52.4, 0.22");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(form.getByRole("alert")).toContainText(
    "Line 2 must be a latitude and a longitude",
  );
  expect(await axeViolations(page, { excludeMap: true })).toEqual([]);

  await points.fill("52.39, 0.2\n52.4, 0.21\n52.4, 0.22\n52.39, 0.21");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".point-item")).toContainText("Area with 4 points");
});

test("phone: drawing controls fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "Draw an area" }).click();
  for (const name of ["Undo", "Add at centre", "Finish", "Cancel"]) {
    const box = await page.getByRole("button", { name }).boundingBox();
    expect((box?.x ?? -1) + (box?.width ?? 0)).toBeLessThanOrEqual(320);
  }
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  expect(await axeViolations(page, { excludeMap: true })).toEqual([]);
  await page.screenshot({ path: "test-results/phone-320-drawing.png" });
});
