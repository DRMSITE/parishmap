import { expect, test } from "@playwright/test";
import { axeViolations } from "./axe.js";

const dialog = (page) => page.locator("wa-dialog[data-person-dialog]");
const row = (page, email) => page.locator("tr", { hasText: email });

async function openPeople(page, { viaLink = true } = {}) {
  await page.goto("/");
  // On a phone the navigation is a drawer, so go straight to the page there.
  if (viaLink)
    await page
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "People" })
      .click();
  else await page.goto("/people");
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
}

test("lists the people with their role and status, and has no accessibility violations", async ({
  page,
}) => {
  await openPeople(page);
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(row(page, "sam@example.org")).toContainText("Invited");
  await expect(row(page, "sam@example.org")).toContainText("Not set up");
  await expect(row(page, "alex@example.org")).toContainText("Councillor");
  expect(await axeViolations(page)).toEqual([]);
});

test("your own row offers no actions", async ({ page }) => {
  await openPeople(page);
  const own = row(page, "me@example.org");
  await expect(own).toContainText("This is you");
  await expect(own.getByRole("button")).toHaveCount(0);
});

test("invites someone, and refuses an address that already has an account", async ({
  page,
}) => {
  await openPeople(page);
  await page.getByRole("button", { name: "Invite someone" }).click();
  const form = dialog(page);
  await form.getByLabel("Email address").fill("not an email");
  await form.getByRole("button", { name: "Send invitation" }).click();
  await expect(form.getByRole("alert")).toContainText("valid email");
  expect(await axeViolations(page)).toEqual([]);

  await form.getByLabel("Email address").fill("Pat@Example.org");
  await form.locator("select[name=role]").selectOption("member");
  await form.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.locator("[data-status]")).toContainText("pat@example.org");
  await expect(row(page, "pat@example.org")).toContainText("Member");

  await page.getByRole("button", { name: "Invite someone" }).click();
  await dialog(page).getByLabel("Email address").fill("alex@example.org");
  await dialog(page).getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("alert")).toContainText("already has an account");
});

test("changes a role", async ({ page }) => {
  await openPeople(page);
  await page
    .getByRole("button", { name: "Change role alex@example.org" })
    .click();
  await dialog(page).locator("select[name=role]").selectOption("member");
  await dialog(page).getByRole("button", { name: "Save role" }).click();
  await expect(row(page, "alex@example.org")).toContainText("Member");
  await expect(page.locator("[data-status]")).toContainText("signed out");
});

test("disables and enables someone, after confirming", async ({ page }) => {
  await openPeople(page);
  await page.getByRole("button", { name: "Disable alex@example.org" }).click();
  await page
    .locator("wa-dialog[data-confirm]")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(row(page, "alex@example.org")).toContainText("Active");

  await page.getByRole("button", { name: "Disable alex@example.org" }).click();
  await page
    .locator("wa-dialog[data-confirm]")
    .getByRole("button", { name: "Disable" })
    .click();
  await expect(row(page, "alex@example.org")).toContainText("Disabled");
  await page.getByRole("button", { name: "Enable alex@example.org" }).click();
  await page
    .locator("wa-dialog[data-confirm]")
    .getByRole("button", { name: "Enable" })
    .click();
  await expect(row(page, "alex@example.org")).toContainText("Active");
});

test("resets an authenticator, after confirming", async ({ page }) => {
  await openPeople(page);
  await page
    .getByRole("button", { name: "Reset authenticator alex@example.org" })
    .click();
  await page
    .locator("wa-dialog[data-confirm]")
    .getByRole("button", { name: "Reset authenticator" })
    .click();
  await expect(row(page, "alex@example.org")).toContainText("Not set up");
});

test("phone: the page does not scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openPeople(page, { viaLink: false });
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
  expect(await axeViolations(page)).toEqual([]);
});
