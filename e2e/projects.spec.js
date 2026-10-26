import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

// The local start-up signs in as an administrator and starts with an example: "Village
// green refresh" (led by alex, 3 open actions, 1 note) with a "New benches" sub-project.

const dialog = (page) => page.locator("wa-dialog[data-project-dialog]");
// Matches a project by its own heading: a parent also contains its sub-projects' headings.
const item = (page, title) =>
  page.locator("li.project-item").filter({
    has: page.locator(":scope > .point-title", {
      hasText: new RegExp(`^${title}$`),
    }),
  });

// Axe samples colours as they are now, so let a dialog finish fading in first: Web
// Awesome's inner <dialog> is open and has dropped its "show" class once it has.
const settled = (page) =>
  page.waitForFunction(() =>
    [...document.querySelectorAll("wa-dialog")].some((d) =>
      d.shadowRoot?.querySelector("dialog.open:not(.show)"),
    ),
  );

async function openProjects(page, { viaLink = true } = {}) {
  await page.goto("/");
  // On a phone the navigation is a drawer, so go straight to the page there.
  if (viaLink)
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Projects" })
      .click();
  else await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(item(page, "Village green refresh")).toBeVisible();
}

/** Fill the open dialog and wait for the list of people to arrive. */
async function fillDialog(page, { title, responsible }) {
  const form = dialog(page);
  await expect(form.locator("select[name=responsible] option")).not.toHaveCount(
    0,
  );
  await settled(page);
  if (title !== undefined) await form.getByLabel("Title").fill(title);
  if (responsible)
    await form
      .locator("select[name=responsible]")
      .selectOption({ label: responsible });
}

test("lists the projects nested, and has no accessibility violations", async ({
  page,
}) => {
  await openProjects(page);
  const green = item(page, "Village green refresh");
  await expect(green).toContainText("Status: Active");
  await expect(green).toContainText("Responsible: alex@example.org");
  await expect(green).toContainText("3 open actions");
  await expect(
    green.locator("li.project-item", { hasText: "New benches" }),
  ).toBeVisible();
  await expect(page.locator("[data-status]")).toHaveText("2 projects.");
  expect(await axeViolations(page)).toEqual([]);
});

test("creates a project, choosing who is responsible", async ({ page }) => {
  await openProjects(page);
  await page.getByRole("button", { name: "New project" }).click();
  await expect(dialog(page)).toHaveAttribute("label", "Add a project");
  await fillDialog(page, {});
  expect(await axeViolations(page)).toEqual([]);

  await fillDialog(page, {
    title: "Allotment extension",
    responsible: "alex@example.org",
  });
  await dialog(page).locator("select[name=status]").selectOption("active");
  await dialog(page)
    .getByLabel("Summary")
    .fill("Ask the landowner about the field.");
  await dialog(page).getByRole("button", { name: "Save project" }).click();

  const made = item(page, "Allotment extension");
  await expect(made).toBeVisible();
  await expect(made).toContainText("Status: Active");
  await expect(made).toContainText("Ask the landowner about the field.");
  await expect(page.locator("[data-status]")).toContainText(
    "Saved “Allotment extension”.",
  );
  await expect(page.locator("[data-status]")).toContainText("3 projects.");
});

test("says what is missing before saving", async ({ page }) => {
  await openProjects(page);
  await page.getByRole("button", { name: "New project" }).click();
  await fillDialog(page, {});
  await dialog(page).getByRole("button", { name: "Save project" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText("Enter a title.");

  await dialog(page).getByLabel("Title").fill("Something");
  await dialog(page).getByRole("button", { name: "Save project" }).click();
  await expect(dialog(page).getByRole("alert")).toHaveText(
    "Choose who is responsible.",
  );
  await expect(page.locator("li.project-item")).toHaveCount(2);
});

test("edits a project and keeps the person responsible", async ({ page }) => {
  await openProjects(page);
  await page
    .getByRole("button", { name: "Edit Village green refresh" })
    .click();
  await expect(dialog(page)).toHaveAttribute("label", "Edit project");
  await fillDialog(page, {});
  await expect(dialog(page).getByLabel("Title")).toHaveValue(
    "Village green refresh",
  );
  await dialog(page).getByLabel("Title").fill("Village green revival");
  await expect(dialog(page).locator("select[name=responsible]")).toHaveValue(
    "alex",
  );
  await dialog(page).locator("select[name=status]").selectOption("on-hold");
  await dialog(page).getByRole("button", { name: "Save changes" }).click();

  const edited = item(page, "Village green revival");
  await expect(edited).toContainText("Status: On hold");
  await expect(edited).toContainText("Responsible: alex@example.org");
});

test("adds a sub-project under its parent, and stops at the deepest level", async ({
  page,
}) => {
  await openProjects(page);
  await page
    .getByRole("button", { name: "Add sub-project to Village green refresh" })
    .click();
  await expect(dialog(page)).toHaveAttribute(
    "label",
    "Add a sub-project to Village green refresh",
  );
  // The parent's lead is chosen to start with.
  await fillDialog(page, { title: "Path repairs" });
  await expect(dialog(page).locator("select[name=responsible]")).toHaveValue(
    "alex",
  );
  await dialog(page).getByRole("button", { name: "Save project" }).click();
  await expect(
    item(page, "Village green refresh").locator("li.project-item", {
      hasText: "Path repairs",
    }),
  ).toBeVisible();

  // New benches is level 2, so it can have a level-3 project, which can have none.
  await page
    .getByRole("button", { name: "Add sub-project to New benches" })
    .click();
  await fillDialog(page, { title: "Bench plaques" });
  await dialog(page).getByRole("button", { name: "Save project" }).click();
  await expect(item(page, "Bench plaques")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add sub-project to Bench plaques" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit Bench plaques" }),
  ).toBeVisible();
});

test("deletes a project with what is under it, after confirming", async ({
  page,
}) => {
  await openProjects(page);
  const confirm = page.locator("wa-dialog[data-confirm]");

  await page
    .getByRole("button", { name: "Delete Village green refresh" })
    .click();
  await expect(confirm).toContainText("1 sub-project, 3 actions, 1 note");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(item(page, "Village green refresh")).toBeVisible();

  await page
    .getByRole("button", { name: "Delete Village green refresh" })
    .click();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(page.locator("li.project-item")).toHaveCount(0);
  await expect(page.locator("[data-status]")).toHaveText(
    "Deleted “Village green refresh”. There are no projects yet.",
  );
  await expect(page.getByRole("heading", { name: "Projects" })).toBeFocused();
});

test("phone: the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openProjects(page, { viaLink: false });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  expect(await axeViolations(page)).toEqual([]);

  await page.getByRole("button", { name: "New project" }).click();
  await fillDialog(page, { title: "x" });
  expect(await axeViolations(page)).toEqual([]);
});
