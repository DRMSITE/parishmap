import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

test("map page loads tiles and has no accessibility violations", async ({
  page,
}) => {
  const errors = /** @type {string[]} */ ([]);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Map" })).toBeVisible();
  await expect(page.locator(".leaflet-tile-container")).toBeAttached();
  await expect(page.locator(".leaflet-control-attribution")).toContainText(
    "OpenStreetMap",
  );
  const violations = await axeViolations(page, { excludeMap: true });
  expect(violations).toEqual([]);
  expect(errors).toEqual([]);
});

test("navigates to About without reloading, and back", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    /** @type {any} */ (window).__marker = true;
  });
  await page.getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /About/ }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/About/);
  expect(await page.evaluate(() => /** @type {any} */ (window).__marker)).toBe(
    true,
  );
  const violations = await axeViolations(page);
  expect(violations).toEqual([]);
  await page.goBack();
  await expect(page.getByRole("region", { name: "Map" })).toBeVisible();
});

test("deep links and unknown paths work", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("About");
  await page.goto("/nowhere");
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
});

test("adds a point, persists it, and the flag hides it", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add point" }).click();
  const dialog = page.locator("wa-dialog");
  await dialog.getByLabel("Title").fill("Test point");
  await dialog.getByLabel("Latitude").fill("52.39");
  await dialog.getByLabel("Longitude").fill("0.21");
  await dialog.getByRole("button", { name: "Save point" }).click();
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(1);

  await page.reload();
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(1);

  await page.getByRole("button", { name: "Options" }).click();
  await page
    .locator("wa-switch", { hasText: "Show points" })
    .locator('[part="control"]')
    .click();
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(0);
});

test("rejects an invalid latitude", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add point" }).click();
  const dialog = page.locator("wa-dialog");
  await dialog.getByLabel("Title").fill("Bad");
  await dialog.getByLabel("Latitude").fill("120");
  await dialog.getByRole("button", { name: "Save point" }).click();
  await expect(dialog.locator(".form-error")).toContainText("Latitude");
});

test("limits the title and notes length", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add point" }).click();
  const dialog = page.locator("wa-dialog");
  const title = dialog.getByLabel("Title");
  const notes = dialog.getByLabel("Notes");
  await expect(title).toHaveAttribute("maxlength", "120");
  await expect(notes).toHaveAttribute("maxlength", "2000");

  // Typing stops at the limit.
  await title.pressSequentially("x".repeat(130));
  await expect(title).toHaveValue("x".repeat(120));

  // A value set by other means (paste, autofill, script) is still refused on save.
  // (fill() would be truncated by maxlength, so set the property as a script would.)
  await dialog.locator('wa-textarea[name="notes"]').evaluate((el, text) => {
    /** @type {any} */ (el).value = text;
  }, "n".repeat(2001));
  await dialog.getByLabel("Latitude").fill("52.39");
  await dialog.getByLabel("Longitude").fill("0.21");
  await dialog.getByRole("button", { name: "Save point" }).click();
  await expect(dialog.locator(".form-error")).toContainText(
    "Notes must be 2000 characters or fewer.",
  );
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(0);

  await notes.fill("n".repeat(2000));
  await dialog.getByRole("button", { name: "Save point" }).click();
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(1);
});

test("the points list shows added points as text and has no accessibility violations", async ({
  page,
}) => {
  await page.goto("/list");
  await expect(page.locator(".list-summary")).toContainText(
    "There are no points yet.",
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Add point" }).click();
  const dialog = page.locator("wa-dialog");
  await dialog.getByLabel("Title").fill("<b>Old oak</b>");
  await dialog.getByLabel("Notes").fill("By the gate");
  await dialog.getByLabel("Latitude").fill("52.39");
  await dialog.getByLabel("Longitude").fill("0.21");
  await dialog.getByRole("button", { name: "Save point" }).click();

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Points" })
    .click();
  await expect(page).toHaveURL(/\/list$/);
  await expect(page.locator(".list-summary")).toContainText("1 point.");
  const items = page.getByRole("listitem").filter({ hasText: "Old oak" });
  // Record content is text, not markup.
  await expect(items.getByRole("heading", { level: 2 })).toHaveText(
    "<b>Old oak</b>",
  );
  await expect(items).toContainText("By the gate");
  await expect(items).toContainText("Latitude 52.39000, longitude 0.21000");
  const violations = await axeViolations(page);
  expect(violations).toEqual([]);
});

// The location field calls Nominatim; stub it so these tests are offline and repeatable.
async function stubNominatim(page) {
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ display_name: "Stub Street, Stubtown" }),
    }),
  );
}

test("the location field moves the pin and keeps the coordinate inputs in sync", async ({
  page,
}) => {
  await stubNominatim(page);
  const unpkg = /** @type {string[]} */ ([]);
  page.on("request", (r) => {
    if (r.url().includes("unpkg.com")) unpkg.push(r.url());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Add point" }).click();
  const dialog = page.locator("wa-dialog");
  const lat = dialog.getByLabel("Latitude");
  const lng = dialog.getByLabel("Longitude");
  const initialLat = await lat.inputValue();

  // Clicking the field's map places the pin and updates the inputs.
  const fieldMap = dialog.locator("wc-location-field .lf-map");
  await expect(fieldMap).toBeVisible();
  const box = await fieldMap.boundingBox();
  await page.mouse.click((box?.x ?? 0) + 150, (box?.y ?? 0) + 90);
  await expect(lat).not.toHaveValue(initialLat);
  await expect(dialog.locator("wc-location-field .lf-coords")).toContainText(
    Number(await lat.inputValue()).toFixed(5),
  );

  // Typing coordinates moves the pin back.
  await lat.fill("52.39");
  await lng.fill("0.21");
  await lng.blur();
  await expect(dialog.locator("wc-location-field .lf-coords")).toHaveText(
    "52.39000, 0.21000",
  );

  await dialog.getByLabel("Title").fill("Tuned point");
  await dialog.getByRole("button", { name: "Save point" }).click();
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(1);
  // Our bundled Leaflet is reused, so nothing is fetched from unpkg.
  expect(unpkg).toEqual([]);
});

test("the open Add a point dialog has no accessibility violations and does not overflow a phone", async ({
  page,
}) => {
  await stubNominatim(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "Add point" }).click();
  await expect(page.locator("wc-location-field .lf-map")).toBeVisible();
  const violations = await axeViolations(page, { excludeMap: true });
  expect(violations).toEqual([]);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: "test-results/dialog-320.png" });
});

test("Pick on map opens the dialog at the clicked position", async ({
  page,
}) => {
  await stubNominatim(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Pick on map" }).click();
  await page.locator("#map").click({ position: { x: 200, y: 200 } });
  const dialog = page.locator("wa-dialog");
  const lat = await dialog.getByLabel("Latitude").inputValue();
  expect(Number(lat)).not.toBeNaN();
  await expect(dialog.locator("wc-location-field .lf-coords")).toContainText(
    Number(lat).toFixed(5),
  );
});

/** Add a point through the dialog on the map page. */
async function addPoint(page, title, notes = "") {
  await page.goto("/");
  await page.getByRole("button", { name: "Add point" }).click();
  const dialog = page.locator("wa-dialog[data-point-dialog]");
  await dialog.getByLabel("Title").fill(title);
  if (notes) await dialog.getByLabel("Notes").fill(notes);
  await dialog.getByLabel("Latitude").fill("52.39");
  await dialog.getByLabel("Longitude").fill("0.21");
  await dialog.getByRole("button", { name: "Save point" }).click();
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(1);
}

const openList = (page) =>
  page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Points" })
    .click();

test("edits a point from the list, keeping the rest of its data", async ({
  page,
}) => {
  await stubNominatim(page);
  await addPoint(page, "Old oak", "By the gate");
  await openList(page);

  await page.getByRole("button", { name: "Edit Old oak" }).click();
  const dialog = page.locator('wa-dialog[label="Edit point"]');
  await expect(dialog.getByLabel("Title")).toHaveValue("Old oak");
  await expect(dialog.getByLabel("Notes")).toHaveValue("By the gate");
  await expect(dialog.getByLabel("Latitude")).toHaveValue("52.390000");
  await expect(dialog.locator("wc-location-field .lf-map")).toBeVisible();
  expect(await axeViolations(page, { excludeMap: true })).toEqual([]);

  await dialog.getByLabel("Title").fill("Ancient oak");
  await dialog.getByLabel("Latitude").fill("52.41");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  const item = page.getByRole("listitem").filter({ hasText: "Ancient oak" });
  await expect(item.getByRole("heading", { level: 2 })).toHaveText(
    "Ancient oak",
  );
  await expect(item).toContainText("By the gate");
  await expect(item).toContainText("Latitude 52.41000, longitude 0.21000");
  await expect(page.locator(".list-summary")).toContainText("1 point.");

  // Still there after a reload: the edit was stored, not just shown.
  await page.reload();
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    "Ancient oak",
  );
});

test("edits a point from its map popup", async ({ page }) => {
  await stubNominatim(page);
  await addPoint(page, "Old oak");
  await page.locator("#map .leaflet-marker-icon").click();
  await page
    .locator(".leaflet-popup")
    .getByRole("button", { name: "Edit Old oak" })
    .click();

  const dialog = page.locator('wa-dialog[label="Edit point"]');
  await dialog.getByLabel("Title").fill("Renamed oak");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toBeHidden();

  await page.locator("#map .leaflet-marker-icon").click();
  await expect(page.locator(".leaflet-popup")).toContainText("Renamed oak");
});

test("deletes a point from the list after confirming, and cancelling keeps it", async ({
  page,
}) => {
  await stubNominatim(page);
  await addPoint(page, "Old oak");
  await openList(page);

  // Cancel: nothing changes.
  await page.getByRole("button", { name: "Delete Old oak" }).click();
  const confirm = page.locator("wa-dialog[data-confirm]");
  await expect(confirm).toContainText("Delete “Old oak”?");
  expect(await axeViolations(page)).toEqual([]);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator(".list-summary")).toContainText("1 point.");

  // Confirm: the point goes, the change is announced, and focus is not lost.
  await page.getByRole("button", { name: "Delete Old oak" }).click();
  await page
    .locator("wa-dialog[data-confirm]")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.locator(".list-summary")).toHaveText(
    "Deleted “Old oak”. There are no points yet.",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.reload();
  await expect(page.locator(".list-summary")).toHaveText(
    "There are no points yet.",
  );
});

test("deletes a point from its map popup", async ({ page }) => {
  await stubNominatim(page);
  await addPoint(page, "Old oak");
  await page.locator("#map .leaflet-marker-icon").click();
  await page
    .locator(".leaflet-popup")
    .getByRole("button", { name: "Delete Old oak" })
    .click();
  await page
    .locator("wa-dialog[data-confirm]")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.locator("#map .leaflet-marker-icon")).toHaveCount(0);
  await expect(page.locator(".map-status")).toHaveText("Deleted “Old oak”.");
});

test("editing from a deep-linked list uses the bundled Leaflet and shows the pin", async ({
  page,
}) => {
  await stubNominatim(page);
  await addPoint(page, "Old oak");
  const unpkg = /** @type {string[]} */ ([]);
  page.on("request", (r) => {
    if (r.url().includes("unpkg.com")) unpkg.push(r.url());
  });

  // A fresh load of /list: the map page has never run, so Leaflet is not yet loaded.
  await page.goto("/list");
  await page.getByRole("button", { name: "Edit Old oak" }).click();
  const pin = page.locator(
    'wa-dialog[label="Edit point"] img.leaflet-marker-icon',
  );
  await expect(pin).toBeVisible();
  // A 200 is not enough: an unresolved path is answered with index.html.
  await expect
    .poll(() =>
      pin.evaluate((img) => /** @type {HTMLImageElement} */ (img).naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(unpkg).toEqual([]);
});
