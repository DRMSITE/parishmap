import { describe, expect, it } from "vitest";
import { render } from "../src/views/help.view.js";

/** @param {boolean | undefined} canManage */
function pageFor(canManage) {
  const container = document.createElement("div");
  const ctx = /** @type {any} */ (
    canManage === undefined ? {} : { people: { available: () => canManage } }
  );
  render(container, ctx);
  return container;
}

describe("Help page", () => {
  it("shows everyone the general guide", () => {
    const page = pageFor(false);
    expect(page.textContent).toContain("Signing in");
    expect(page.textContent).toContain("Adding to the map");
  });

  it("explains projects to everyone, including who may move actions", () => {
    const page = pageFor(false);
    const headings = [...page.querySelectorAll("h3")].map((h) => h.textContent);
    expect(headings).toContain("Projects");
    expect(page.textContent).toContain("Ideas");
    expect(page.textContent).toContain("Move up");
    expect(page.textContent).toContain(
      "Only the responsible councillor, the Clerk and administrators can move an action",
    );
    expect(page.querySelector('a[href="/projects"]')).not.toBeNull();
  });

  it("explains starting a project only to those who can", () => {
    expect(pageFor(true).textContent).toContain("Starting a project");
    expect(pageFor(true).textContent).toContain("choose who is responsible");
    for (const canManage of [false, undefined])
      expect(pageFor(canManage).textContent).not.toContain(
        "Starting a project",
      );
  });

  it.each([false, undefined])(
    "hides the Clerk's part when people cannot be managed (%s)",
    (canManage) => {
      const page = pageFor(canManage);
      expect(page.textContent).not.toContain(
        "For the Clerk and administrators",
      );
      expect(page.textContent).not.toContain("Inviting someone");
      expect(page.textContent).not.toContain("Reset authenticator");
    },
  );

  it("shows the Clerk's part to someone who can manage people", () => {
    const page = pageFor(true);
    expect(page.textContent).toContain("For the Clerk and administrators");
    expect(page.textContent).toContain("Inviting someone");
  });
});
