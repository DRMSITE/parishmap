// The Activity page: a record of who invited, changed or disabled whom, newest first.
// Only administrators can read it (the rules say so too), and it only reads: nothing here
// can change the log.

import { roleLabel } from "../auth/people.js";

/** @typedef {import("../types.js").AuditEntry} AuditEntry */

/**
 * Plain words for a stored action.
 * @param {AuditEntry} entry
 * @returns {{ what: string, detail: string }}
 */
export function describeEntry(entry) {
  switch (entry.action) {
    case "invite":
      return { what: "Invited", detail: `as ${roleLabel(entry.detail)}` };
    case "setRole":
      return {
        what: "Changed role",
        detail: entry.detail
          .split(" -> ")
          .map((r) => (r === "none" ? "No role" : roleLabel(r)))
          .join(" to "),
      };
    case "disable":
      return { what: "Disabled", detail: "" };
    case "enable":
      return { what: "Enabled", detail: "" };
    case "resetAuthenticators":
      return { what: "Reset authenticator", detail: "" };
    default:
      return { what: entry.action, detail: entry.detail };
  }
}

/** @param {string | null} iso */
function formatWhen(iso) {
  if (!iso) return "Unknown";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** @type {import("../types.js").RenderFn} */
export function render(container, ctx) {
  const audit = ctx.audit;
  if (!audit?.available()) {
    container.innerHTML = `
      <article class="page">
        <h1 tabindex="-1" data-heading>Activity</h1>
        <p>Only administrators can see the activity.</p>
        <p><a href="/">Back to the map</a></p>
      </article>
    `;
    return;
  }

  container.innerHTML = `
    <article class="page page-wide">
      <h1 tabindex="-1" data-heading>Activity</h1>
      <p>Who invited, changed or disabled whom, newest first. This record cannot be changed.</p>
      <p class="list-summary" role="status" data-status></p>
      <p class="form-error" role="alert" data-error hidden></p>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Activity table">
        <table class="people-table">
          <caption class="visually-hidden">Activity on accounts</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Who</th>
              <th scope="col">Action</th>
              <th scope="col">Person affected</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody data-rows></tbody>
        </table>
      </div>
      <p><wa-button appearance="outlined" data-more hidden>Load more</wa-button></p>
    </article>
  `;

  const status = /** @type {HTMLElement} */ (
    container.querySelector("[data-status]")
  );
  const errorEl = /** @type {HTMLElement} */ (
    container.querySelector("[data-error]")
  );
  const rows = /** @type {HTMLElement} */ (
    container.querySelector("[data-rows]")
  );
  const more = /** @type {HTMLElement} */ (
    container.querySelector("[data-more]")
  );
  let active = true;
  let shown = 0;
  /** @type {unknown} */
  let cursor = null;

  /** @param {AuditEntry} entry */
  function buildRow(entry) {
    const { what, detail } = describeEntry(entry);
    const row = document.createElement("tr");
    for (const value of [
      formatWhen(entry.at),
      entry.byEmail,
      what,
      entry.targetEmail,
      detail,
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }

  async function loadPage() {
    errorEl.hidden = true;
    /** @type {any} */ (more).loading = true;
    try {
      const page = await audit?.list(cursor ?? undefined);
      if (!active || !page) return;
      rows.append(...page.entries.map(buildRow));
      shown += page.entries.length;
      cursor = page.cursor;
      more.hidden = cursor === null;
      status.textContent = shown
        ? `${shown} ${shown === 1 ? "entry" : "entries"} shown${cursor === null ? "." : ", and there are older ones."}`
        : "Nothing has been recorded yet.";
    } catch (error) {
      errorEl.textContent =
        error instanceof Error ? error.message : "Could not load the activity.";
      errorEl.hidden = false;
    } finally {
      /** @type {any} */ (more).loading = false;
    }
  }

  more.addEventListener("click", () => void loadPage());
  void loadPage();
  return () => {
    active = false;
  };
}
