import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

// The local start-up signs in as an administrator and starts with an example: "Village
// green refresh" (led by alex) with a "New benches" sub-project, three actions (Get two
// quotes for the benches in Ideas, Agree the budget in Agreed, Survey the paths in In
// progress) and one note.

const lane = (page, id) => page.locator(`section.lane[data-lane="${id}"]`);
const card = (page, title) =>
  page.locator("li.action-card").filter({
    has: page.locator(".action-title", { hasText: new RegExp(`^${title}$`) }),
  });
const titles = (page, id) =>
  lane(page, id).locator(".action-title").allTextContents();
const actionDialog = (page) => page.locator("wa-dialog[data-action-dialog]");
const noteDialog = (page) => page.locator("wa-dialog[data-note-dialog]");
const confirm = (page) => page.locator("wa-dialog[data-confirm]");
const status = (page) => page.locator("[data-status]");

// Axe samples colours as they are now, so let a dialog finish fading in first: Web
// Awesome's inner <dialog> is open and has dropped its "show" class once it has.
const settled = (page) =>
  page.waitForFunction(() =>
    [...document.querySelectorAll("wa-dialog")].some((d) =>
      d.shadowRoot?.querySelector("dialog.open:not(.show)"),
    ),
  );

async function openGreen(page) {
  await page.goto("/projects?p=p-green");
  await expect(
    page.getByRole("heading", { level: 1, name: "Village green refresh" }),
  ).toBeVisible();
  await expect(page.locator("li.action-card")).toHaveCount(3);
}

test("opens from the list, with breadcrumbs, details and the lanes, and has no accessibility violations", async ({
  page,
}) => {
  await page.goto("/projects");
  await page.getByRole("link", { name: "Village green refresh" }).click();
  await expect(page).toHaveURL(/\/projects\?p=p-green$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Village green refresh" }),
  ).toBeVisible();

  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(crumbs.locator('[aria-current="page"]')).toHaveText(
    "Village green refresh",
  );
  await expect(page.locator("[data-meta]")).toContainText(
    "Responsible: alex@example.org",
  );
  const counts = await page.locator(".lane-title").allTextContents();
  expect(counts).toEqual([
    "Ideas (1)",
    "Agreed (1)",
    "In progress (1)",
    "Blocked (0)",
    "Done (0)",
  ]);
  await expect(page.getByRole("link", { name: "New benches" })).toBeVisible();
  await expect(page.locator(".note-item")).toContainText("no objections");
  expect(await axeViolations(page)).toEqual([]);
});

test("adds an action with someone to do it and a date, in a lane of its own choosing", async ({
  page,
}) => {
  await openGreen(page);
  await page.getByRole("button", { name: "Add action" }).click();
  const form = actionDialog(page);
  await expect(form).toHaveAttribute("label", "Add an action");
  await expect(form.locator("select[name=assignee] option")).not.toHaveCount(1);
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);

  await form.getByRole("button", { name: "Save action" }).click();
  await expect(form.getByRole("alert")).toHaveText("Enter a title.");

  await form.getByLabel("Title").fill("Order the plaques");
  await form.getByLabel("Details").fill("Brass, two lines of text.");
  await form.locator("select[name=lane]").selectOption("agreed");
  await form
    .locator("select[name=assignee]")
    .selectOption({ label: "alex@example.org" });
  await form.getByLabel("Due date (optional)").fill("2026-12-01");
  await form.getByRole("button", { name: "Save action" }).click();

  const made = card(page, "Order the plaques");
  await expect(made).toBeVisible();
  await expect(made).toContainText("For: alex@example.org");
  await expect(made).toContainText("Due: 1 Dec 2026");
  await expect(made).toContainText("Brass, two lines of text.");
  // At the end of the lane it was added to.
  expect(await titles(page, "agreed")).toEqual([
    "Agree the budget",
    "Order the plaques",
  ]);
  await expect(status(page)).toHaveText("Saved “Order the plaques”.");
});

test("moves a card to another lane from its Move list, and keeps focus on it", async ({
  page,
}) => {
  await openGreen(page);
  const move = card(page, "Get two quotes for the benches").getByLabel(
    "Move Get two quotes for the benches to",
  );
  await move.focus();
  await move.selectOption("blocked");

  await expect(lane(page, "blocked").locator(".action-card")).toHaveCount(1);
  await expect(lane(page, "blocked")).toContainText(
    "Get two quotes for the benches",
  );
  await expect(lane(page, "ideas").locator(".action-card")).toHaveCount(0);
  await expect(status(page)).toHaveText(
    "Moved “Get two quotes for the benches” to Blocked.",
  );
  await expect(
    card(page, "Get two quotes for the benches").locator("select"),
  ).toBeFocused();
});

test("moves a card with the keyboard alone", async ({ page }) => {
  await openGreen(page);
  const select = card(page, "Get two quotes for the benches").locator("select");
  await select.focus();
  await page.keyboard.press("ArrowDown"); // Ideas to Agreed
  await expect(lane(page, "agreed")).toContainText(
    "Get two quotes for the benches",
  );
  await expect(
    card(page, "Get two quotes for the benches").locator("select"),
  ).toBeFocused();
});

test("moves a card up and down within its lane", async ({ page }) => {
  await openGreen(page);
  await card(page, "Get two quotes for the benches")
    .getByLabel("Move Get two quotes for the benches to")
    .selectOption("agreed");
  await expect(lane(page, "agreed").locator(".action-card")).toHaveCount(2);
  expect(await titles(page, "agreed")).toEqual([
    "Agree the budget",
    "Get two quotes for the benches",
  ]);

  await page
    .getByRole("button", { name: "Move up Get two quotes for the benches" })
    .click();
  expect(await titles(page, "agreed")).toEqual([
    "Get two quotes for the benches",
    "Agree the budget",
  ]);
  await expect(status(page)).toHaveText(
    "Moved “Get two quotes for the benches” up in Agreed.",
  );
  // At the top there is no "up" button, so focus falls back to the Move list.
  await expect(
    card(page, "Get two quotes for the benches").locator("select"),
  ).toBeFocused();

  await page
    .getByRole("button", { name: "Move down Get two quotes for the benches" })
    .click();
  expect(await titles(page, "agreed")).toEqual([
    "Agree the budget",
    "Get two quotes for the benches",
  ]);
  await expect(
    page.getByRole("button", {
      name: "Move down Get two quotes for the benches",
    }),
  ).toHaveCount(0);
});

test("moves a card by dragging it to another lane, and to the top of its own", async ({
  page,
}) => {
  // Big enough to show every lane without scrolling, so the pointer lands where intended.
  await page.setViewportSize({ width: 1800, height: 1400 });
  await openGreen(page);
  await card(page, "Survey the paths")
    .locator(".action-title")
    .dragTo(lane(page, "done").locator("ul"));
  await expect(lane(page, "done")).toContainText("Survey the paths");
  await expect(lane(page, "in-progress").locator(".action-card")).toHaveCount(
    0,
  );
  await expect(status(page)).toHaveText("Moved “Survey the paths” to Done.");

  // Within a lane: drop on the top half of the first card.
  await card(page, "Get two quotes for the benches")
    .getByLabel("Move Get two quotes for the benches to")
    .selectOption("agreed");
  await expect(lane(page, "agreed").locator(".action-card")).toHaveCount(2);
  await card(page, "Get two quotes for the benches")
    .locator(".action-title")
    .dragTo(card(page, "Agree the budget"), {
      targetPosition: { x: 20, y: 4 },
    });
  await expect
    .poll(() => titles(page, "agreed"))
    .toEqual(["Get two quotes for the benches", "Agree the budget"]);
});

test("edits an action, clearing its date, and deletes one after confirming", async ({
  page,
}) => {
  await openGreen(page);
  await page.getByRole("button", { name: "Edit Agree the budget" }).click();
  const form = actionDialog(page);
  await expect(form).toHaveAttribute("label", "Edit action");
  await expect(form.getByLabel("Title")).toHaveValue("Agree the budget");
  await expect(form.getByLabel("Due date (optional)")).toHaveValue(
    "2026-11-15",
  );
  await expect(form.locator("select[name=assignee]")).toHaveValue("clerk");
  await form.getByLabel("Title").fill("Agree the budget with the Clerk");
  await form.getByLabel("Due date (optional)").fill("");
  await form.locator("select[name=assignee]").selectOption("");
  await form.getByRole("button", { name: "Save changes" }).click();

  const edited = card(page, "Agree the budget with the Clerk");
  await expect(edited).toBeVisible();
  await expect(edited).not.toContainText("Due:");
  await expect(edited).not.toContainText("For:");
  await expect(lane(page, "agreed")).toContainText(
    "Agree the budget with the Clerk",
  );

  await page
    .getByRole("button", { name: "Delete Agree the budget with the Clerk" })
    .click();
  await confirm(page).getByRole("button", { name: "Cancel" }).click();
  await expect(edited).toBeVisible();
  await page
    .getByRole("button", { name: "Delete Agree the budget with the Clerk" })
    .click();
  await confirm(page).getByRole("button", { name: "Delete" }).click();
  await expect(edited).toHaveCount(0);
  await expect(status(page)).toHaveText(
    "Deleted “Agree the budget with the Clerk”.",
  );
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
});

test("adds, edits and deletes notes, on the project and on an action", async ({
  page,
}) => {
  await openGreen(page);
  await page.getByRole("button", { name: "Add note" }).click();
  const form = noteDialog(page);
  await expect(form).toHaveAttribute("label", "Add a note");
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);

  await form.getByRole("button", { name: "Save note" }).click();
  await expect(form.getByRole("alert")).toHaveText("Write a note.");
  await form
    .getByRole("textbox", { name: "Note" })
    .fill("Parish Clerk will ask the contractor.");
  await form.getByRole("button", { name: "Save note" }).click();

  const first = page.locator(".note-item").first();
  await expect(first).toContainText("Parish Clerk will ask the contractor.");
  await expect(first).toContainText("me@example.org");
  await expect(status(page)).toHaveText("Saved the note.");

  await page.getByRole("button", { name: "Add note" }).click();
  await noteDialog(page)
    .locator("select[name=about]")
    .selectOption({ label: "Action: Survey the paths" });
  await noteDialog(page)
    .getByRole("textbox", { name: "Note" })
    .fill("Two paths are muddy.");
  await noteDialog(page).getByRole("button", { name: "Save note" }).click();
  const aboutAction = page.locator(".note-item").first();
  await expect(aboutAction).toContainText("About the action: Survey the paths");
  await expect(aboutAction).toContainText("Two paths are muddy.");

  await aboutAction.getByRole("button", { name: /^Edit/ }).click();
  await expect(noteDialog(page).locator("[data-about-field]")).toBeHidden();
  await noteDialog(page)
    .getByRole("textbox", { name: "Note" })
    .fill("Two paths are very muddy.");
  await noteDialog(page).getByRole("button", { name: "Save changes" }).click();
  const edited = page.locator(".note-item").first();
  await expect(edited).toContainText("Two paths are very muddy.");
  await expect(edited).toContainText("(edited)");

  await edited.getByRole("button", { name: /^Delete/ }).click();
  await confirm(page).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".note-item")).toHaveCount(2);
  await expect(status(page)).toHaveText("Deleted the note.");
});

test("shows a note about a deleted action as such", async ({ page }) => {
  await openGreen(page);
  await page.getByRole("button", { name: "Add note" }).click();
  await noteDialog(page)
    .locator("select[name=about]")
    .selectOption({ label: "Action: Survey the paths" });
  await noteDialog(page).getByRole("textbox", { name: "Note" }).fill("Muddy.");
  await noteDialog(page).getByRole("button", { name: "Save note" }).click();
  await expect(page.locator(".note-item").first()).toContainText(
    "Survey the paths",
  );

  await page.getByRole("button", { name: "Delete Survey the paths" }).click();
  await confirm(page).getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".note-item").first()).toContainText(
    "About an action that has been deleted",
  );
});

test("moves between a project and its sub-project, and says when one is missing", async ({
  page,
}) => {
  await openGreen(page);
  await page.getByRole("link", { name: "New benches" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "New benches" }),
  ).toBeVisible();
  const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
  await expect(crumbs.getByRole("listitem")).toHaveText([
    "Projects",
    "Village green refresh",
    "New benches",
  ]);
  await expect(page.locator("li.action-card")).toHaveCount(0);

  await crumbs.getByRole("link", { name: "Village green refresh" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Village green refresh" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { level: 1, name: "New benches" }),
  ).toBeVisible();

  await page.goto("/projects?p=nope");
  await expect(page.getByText("This project no longer exists.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to the projects" }),
  ).toBeVisible();
});

test("phone: the lanes stack and the page does not scroll sideways", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openGreen(page);
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  const tops = await page
    .locator("section.lane")
    .evaluateAll((lanes) => lanes.map((l) => l.getBoundingClientRect().top));
  expect(tops).toEqual([...tops].sort((a, b) => a - b));
  expect(new Set(tops).size).toBe(5);
  expect(await axeViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "Add action" }).click();
  await expect(
    actionDialog(page).locator("select[name=assignee] option"),
  ).not.toHaveCount(1);
  await settled(page);
  expect(await axeViolations(page)).toEqual([]);
});
