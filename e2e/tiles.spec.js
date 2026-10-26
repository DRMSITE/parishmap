// The default map is OpenStreetMap, and its attribution is always on screen: both are
// conditions of using OpenStreetMap's tiles, and the council's choice of provider must never
// be able to hide them (see src/map/basemaps.js).

import { expect, test } from "@playwright/test";

test("the map shows OpenStreetMap, with its attribution, and offers no other map by default", async ({
  page,
}) => {
  await page.goto("/");
  const attribution = page.locator(".leaflet-control-attribution");
  await expect(attribution).toBeVisible();
  await expect(attribution).toContainText("OpenStreetMap");
  await expect(attribution.getByRole("link", { name: "OpenStreetMap" })).toHaveAttribute(
    "href",
    "https://www.openstreetmap.org/copyright",
  );
  // Only a council that chose another provider gets a switch for it.
  await page.getByRole("button", { name: "Options" }).click();
  await expect(page.getByText(/Use the .* map/)).toHaveCount(0);
});
