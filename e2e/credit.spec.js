// The maker's credit (see NOTICE) is on the About page and in the navigation footer: visible,
// a real link, legible, and it never gets in the way of the council's own name.

import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

test("the credit is in the navigation and on the About page, legible and linked", async ({
  page,
}) => {
  await page.goto("/about");

  const credit = page.locator("nav .credit");
  await expect(credit).toBeVisible();
  await expect(credit).toHaveText("ParishMap, built by DRMSITE LTD");
  await expect(credit.getByRole("link", { name: "DRMSITE LTD" })).toHaveAttribute(
    "href",
    "https://drmsite.com",
  );

  const about = page.getByRole("heading", { name: "About this software" });
  await expect(about).toBeVisible();
  await expect(page.getByRole("link", { name: "source code" })).toHaveAttribute(
    "href",
    "https://github.com/DRMSITE/parishmap",
  );

  expect(await axeViolations(page)).toEqual([]);
});

test("the council's own name leads: the header shows the app's name, not the maker's", async ({
  page,
}) => {
  await page.goto("/");
  const brand = page.locator("header .brand");
  await expect(brand).toHaveText("Exampleton Parish Map");
  await expect(page).toHaveTitle(/Exampleton Parish Map$/);
  await expect(page).not.toHaveTitle(/DRMSITE/);
});

test("phone: the credit is in the menu drawer and nothing scrolls sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await page.goto("/about");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.locator("nav .credit")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
