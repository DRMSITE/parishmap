import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

// Projects and actions link to places already on the map. The local start-up keeps map
// features in localStorage, so these tests put two there (a point and an area) before the
// page loads. They are only put there if nothing is stored yet, so a test that changes
// them is not undone by a reload.

const STORAGE_KEY = "parishmap:records";
const at = "2026-01-01T00:00:00.000Z";
const places = [
  {
    id: "f-oak",
    lat: 52.39,
    lng: 0.21,
    data: { title: "Old oak", notes: "" },
    createdAt: at,
    updatedAt: at,
  },
  {
    id: "f-field",
    lat: 52.395,
    lng: 0.21,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0.2, 52.39],
          [0.22, 52.39],
          [0.21, 52.4],
          [0.2, 52.39],
        ],
      ],
    },
    data: { title: "Village green", notes: "" },
    createdAt: at,
    updatedAt: at,
  },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, records }) => {
      if (localStorage.getItem(key) === null)
        localStorage.setItem(key, JSON.stringify(records));
    },
    { key: STORAGE_KEY, records: places },
  );
});

const projectDialog = (page) => page.locator("wa-dialog[data-project-dialog]");
const actionDialog = (page) => page.locator("wa-dialog[data-action-dialog]");

// Axe samples colours as they are now, so let a dialog finish fading in first: Web
// Awesome's inner <dialog> is open and has dropped its "show" class once it has.
const settled = (page) =>
  page.waitForFunction(() =>
    [...document.querySelectorAll("wa-dialog")].some((d) =>
      d.shadowRoot?.querySelector("dialog.open:not(.show)"),
    ),
  );

test("links a project to a place, and the link opens the map at that place", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  const form = projectDialog(page);
  await expect(form.locator("select[name=responsible] option")).not.toHaveCount(
    0,
  );
  await expect(form.getByRole("checkbox")).toHaveCount(2);
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);

  await form.getByLabel("Title").fill("Tree survey");
  await form.locator("select[name=responsible]").selectOption("alex");
  // Find a place, then tick it.
  await form.getByLabel("Find a place").fill("oak");
  await expect(
    form.getByRole("checkbox", { name: /Village green/ }),
  ).toBeHidden();
  await form.getByRole("checkbox", { name: /Old oak/ }).check();
  await expect(form.getByText("1 place chosen.")).toBeVisible();
  await form.getByRole("button", { name: "Save project" }).click();

  await page.getByRole("link", { name: "Tree survey" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Tree survey" }),
  ).toBeVisible();
  const placeLine = page.locator("[data-places]");
  await expect(placeLine).toHaveText("Place: Old oak");

  await placeLine.getByRole("link", { name: "Old oak" }).click();
  await expect(page).toHaveURL(/\/\?place=f-oak$/);
  await expect(page.locator(".leaflet-popup-content")).toContainText("Old oak");
});

test("links an action to places, and unticking one removes it", async ({
  page,
}) => {
  await page.goto("/projects?p=p-green");
  await expect(page.locator("li.action-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Add action" }).click();
  const form = actionDialog(page);
  await form.getByLabel("Title").fill("Fence the field");
  await expect(form.getByRole("checkbox")).toHaveCount(2);
  await form.getByRole("checkbox", { name: /Village green/ }).check();
  await form.getByRole("checkbox", { name: /Old oak/ }).check();
  await form.getByRole("button", { name: "Save action" }).click();

  const card = page.locator("li.action-card").filter({
    has: page.locator(".action-title", { hasText: "Fence the field" }),
  });
  await expect(card).toContainText("Places: Old oak, Village green");

  await page.getByRole("button", { name: "Edit Fence the field" }).click();
  await expect(form.getByRole("checkbox", { name: /Old oak/ })).toBeChecked();
  await form.getByRole("checkbox", { name: /Old oak/ }).uncheck();
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(card).toContainText("Place: Village green");
  await expect(card).not.toContainText("Old oak");

  await card.getByRole("link", { name: "Village green" }).click();
  await expect(page).toHaveURL(/\/\?place=f-field$/);
  await expect(page.locator(".leaflet-popup-content")).toContainText(
    "Village green",
  );
});

test("keeps the links when only the text of an action is edited", async ({
  page,
}) => {
  await page.goto("/projects?p=p-green");
  await page.getByRole("button", { name: "Edit Survey the paths" }).click();
  const form = actionDialog(page);
  await expect(form.getByRole("checkbox")).toHaveCount(2);
  await form.getByRole("checkbox", { name: /Old oak/ }).check();
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.locator("li.action-card", { hasText: "Survey the paths" }),
  ).toContainText("Place: Old oak");

  await page.getByRole("button", { name: "Edit Survey the paths" }).click();
  await expect(form.getByRole("checkbox", { name: /Old oak/ })).toBeChecked();
  await form.getByLabel("Details").fill("Check the drains too.");
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.locator("li.action-card", { hasText: "Survey the paths" }),
  ).toContainText("Place: Old oak");
});

test("shows a link to a deleted place as removed, and the map says it has gone", async ({
  page,
}) => {
  await page.goto("/projects");
  await page
    .getByRole("button", { name: "Edit Village green refresh" })
    .click();
  const form = projectDialog(page);
  await expect(form.getByRole("checkbox")).toHaveCount(2);
  await form.getByRole("checkbox", { name: /Old oak/ }).check();
  await form.getByRole("button", { name: "Save changes" }).click();

  // The place is deleted from the map.
  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify(
        JSON.parse(localStorage.getItem(key) ?? "[]").filter(
          (r) => r.id !== "f-oak",
        ),
      ),
    );
  }, STORAGE_KEY);

  await page.goto("/projects?p=p-green");
  await expect(page.locator("[data-places]")).toHaveText(
    "Place: a place that has been removed from the map",
  );
  await page.getByRole("button", { name: "Edit project" }).click();
  await expect(
    form.getByRole("checkbox", {
      name: /Removed: a place that has been removed/,
    }),
  ).toBeChecked();
  await form.getByRole("checkbox", { name: /Removed/ }).uncheck();
  await form.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("[data-places]")).toBeEmpty();

  await page.goto("/?place=f-oak");
  await expect(page.locator(".map-status")).toHaveText(
    "That place is no longer on the map.",
  );
});

test("a place's popup and the Points page show the projects that concern it", async ({
  page,
}) => {
  // Linked to a project directly...
  await page.goto("/projects");
  await page
    .getByRole("button", { name: "Edit Village green refresh" })
    .click();
  const form = projectDialog(page);
  await expect(form.getByRole("checkbox")).toHaveCount(2);
  await form.getByRole("checkbox", { name: /Old oak/ }).check();
  await form.getByRole("button", { name: "Save changes" }).click();

  // ...and linked through one of a project's actions.
  await page.goto("/projects?p=p-benches");
  await page.getByRole("button", { name: "Add action" }).click();
  await actionDialog(page).getByLabel("Title").fill("Fit the plaque");
  await expect(actionDialog(page).getByRole("checkbox")).toHaveCount(2);
  await actionDialog(page)
    .getByRole("checkbox", { name: /Village green/ })
    .check();
  await actionDialog(page).getByRole("button", { name: "Save action" }).click();
  await expect(page.locator("li.action-card")).toHaveCount(1);

  // The map popup names the project and links to it.
  await page.goto("/?place=f-oak");
  const popup = page.locator(".leaflet-popup-content");
  await expect(popup).toContainText("Project: Village green refresh");
  await popup.getByRole("link", { name: "Village green refresh" }).click();
  await expect(page).toHaveURL(/\/projects\?p=p-green$/);

  // The Points page, which stands in for the map, says the same.
  await page.goto("/list");
  const oak = page.locator("li.point-item", { hasText: "Old oak" });
  await expect(oak).toContainText("Project: Village green refresh");
  const field = page.locator("li.point-item").filter({
    has: page.getByRole("heading", { name: "Village green", exact: true }),
  });
  await expect(field).toContainText("Project: New benches");
  await field.getByRole("link", { name: "New benches" }).click();
  await expect(page).toHaveURL(/\/projects\?p=p-benches$/);
});

test("phone: the dialog with its places list fits and has no accessibility violations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  await expect(projectDialog(page).getByRole("checkbox")).toHaveCount(2);
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
