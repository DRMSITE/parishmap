// The map covers the council's area and its surroundings only: it cannot be zoomed out beyond
// config.map.minZoom or panned beyond config.map.bounds, and nothing can be saved where
// the map could not show it.

import { expect, test } from "@playwright/test";

test("cannot be zoomed out beyond the limit", async ({ page }) => {
  await page.goto("/");
  const zoomOut = page.getByRole("button", { name: "Zoom out" });
  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  await expect(zoomOut).toBeEnabled();
  // The map starts one level above the limit, so a single step reaches it.
  await zoomOut.click();
  await expect(page.locator(".leaflet-control-zoom-out")).toHaveClass(
    /leaflet-disabled/,
  );
  await expect(zoomIn).toBeEnabled();
});

test("cannot be panned away from the parish", async ({ page }) => {
  await page.goto("/");
  const map = page.locator("#map");
  await expect(page.locator("#map .leaflet-overlay-pane path")).toBeAttached();
  const mapBox = await map.boundingBox();
  if (!mapBox) throw new Error("No map.");

  // Drag far to the right and then up, several times over.
  for (const [dx, dy] of [
    [1800, 0],
    [1800, 0],
    [0, 1200],
    [0, 1200],
  ]) {
    await page.mouse.move(mapBox.x + 100, mapBox.y + 100);
    await page.mouse.down();
    await page.mouse.move(mapBox.x + 100 + dx, mapBox.y + 100 + dy, {
      steps: 10,
    });
    await page.mouse.up();
  }

  // Dragged as far as the bounds allow, the parish's top-left corner sits about 2000px
  // right of and 800px below the map's own top-left (at the starting zoom). With no limit
  // it would be more than 3600px right and 2400px down.
  const outline = await page
    .locator("#map .leaflet-overlay-pane path")
    .first()
    .boundingBox();
  if (!outline) throw new Error("No parish outline.");
  expect(outline.x - mapBox.x).toBeLessThan(2500);
  expect(outline.y - mapBox.y).toBeLessThan(1200);
  // ...and it did move, so the drag really happened.
  expect(outline.x - mapBox.x).toBeGreaterThan(1500);
});

test("refuses a point outside the area the map covers", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add point" }).click();
  const dialog = page.locator("wa-dialog");
  await dialog.getByLabel("Title").fill("Far away");
  await dialog.getByLabel("Latitude").fill("51.5");
  await dialog.getByLabel("Longitude").fill("-0.12");
  await dialog.getByRole("button", { name: "Save point" }).click();
  await expect(dialog.locator(".form-error")).toContainText(
    "inside the area this map covers",
  );
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(0);

  await dialog.getByLabel("Latitude").fill("52.39");
  await dialog.getByLabel("Longitude").fill("0.21");
  await dialog.getByRole("button", { name: "Save point" }).click();
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(1);
});

test("refuses a shape with a point outside the area", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Draw an area" }).click();
  const map = page.locator("#map");
  await map.click({ position: { x: 200, y: 200 } });
  await map.click({ position: { x: 320, y: 220 } });
  await map.click({ position: { x: 260, y: 320 } });
  await page.getByRole("button", { name: "Finish" }).click();
  const dialog = page.locator("wa-dialog[data-point-dialog]");
  await dialog.getByLabel("Title").fill("Stray");
  await dialog
    .getByLabel("Points on the shape")
    .fill("52.39, 0.2\n52.4, 0.22\n53.9, 0.21");
  await dialog.getByRole("button", { name: "Save area" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "inside the area this map covers",
  );
});
