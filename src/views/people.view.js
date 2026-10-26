// The People page: who has an account, and for the Clerk and administrators, inviting
// people and changing their role, disabling them or resetting their authenticator. All
// the real decisions are made by the `api` function; `ctx.people` only decides what is
// offered (see auth/people.js).

import { assignableRoles, canManage, roleLabel } from "../auth/people.js";
import { actionButton } from "../map/markers.js";
import { confirmAction } from "../ui/confirm.js";

/** @typedef {import("../types.js").Person} Person */

/** @param {Person} person */
function statusOf(person) {
  if (person.disabled) return "Disabled";
  return person.lastSignIn ? "Active" : "Invited";
}

/**
 * Ask for an email address and/or a role. Resolves to the answers, or null on cancel.
 * @param {object} options
 * @param {string} options.label
 * @param {string} options.confirmText
 * @param {boolean} options.askEmail
 * @param {readonly string[]} options.roles
 * @param {string} [options.currentRole]
 * @returns {Promise<{ email: string, role: string } | null>}
 */
function askPerson({ label, confirmText, askEmail, roles, currentRole }) {
  return new Promise((resolve) => {
    const dialog = /** @type {any} */ (document.createElement("wa-dialog"));
    dialog.setAttribute("label", label);
    dialog.setAttribute("data-person-dialog", "");
    dialog.innerHTML = `
      <form class="stack" novalidate data-form>
        ${askEmail ? '<wa-input name="email" label="Email address" type="email" autocomplete="off" required></wa-input>' : ""}
        <label class="field">
          <span class="field-label">Role</span>
          <select name="role" class="field-select">
            ${roles.map((r) => `<option value="${r}"${r === currentRole ? " selected" : ""}>${roleLabel(r)}</option>`).join("")}
          </select>
        </label>
        <p class="form-error" role="alert" data-error hidden></p>
      </form>
      <wa-button slot="footer" appearance="outlined" data-action="cancel">Cancel</wa-button>
      <wa-button slot="footer" variant="brand" data-action="save"></wa-button>
    `;
    const save = /** @type {HTMLElement} */ (
      dialog.querySelector('[data-action="save"]')
    );
    save.textContent = confirmText;
    const form = /** @type {HTMLFormElement} */ (
      dialog.querySelector("[data-form]")
    );
    const error = /** @type {HTMLElement} */ (
      dialog.querySelector("[data-error]")
    );
    /** @type {{ email: string, role: string } | null} */
    let answer = null;

    function submit() {
      const email = String(
        /** @type {any} */ (form.querySelector('[name="email"]'))?.value ?? "",
      ).trim();
      const role = /** @type {HTMLSelectElement} */ (
        form.querySelector('[name="role"]')
      ).value;
      if (askEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        error.textContent = "Enter a valid email address.";
        error.hidden = false;
        return;
      }
      answer = { email, role };
      dialog.open = false;
    }

    save.addEventListener("click", submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });
    dialog
      .querySelector('[data-action="cancel"]')
      ?.addEventListener("click", () => {
        dialog.open = false;
      });
    dialog.addEventListener("wa-after-hide", (/** @type {Event} */ event) => {
      if (event.target !== dialog) return;
      dialog.remove();
      resolve(answer);
    });
    document.body.append(dialog);
    dialog.open = true;
  });
}

/** @type {import("../types.js").RenderFn} */
export function render(container, ctx) {
  const people = ctx.people;
  if (!people?.available()) {
    container.innerHTML = `
      <article class="page">
        <h1 tabindex="-1" data-heading>People</h1>
        <p>Only the Clerk and administrators can manage people.</p>
        <p><a href="/">Back to the map</a></p>
      </article>
    `;
    return;
  }

  container.innerHTML = `
    <article class="page page-wide">
      <h1 tabindex="-1" data-heading>People</h1>
      <p>
        People you invite are emailed a link to choose a password. They then set up an
        authenticator app the first time they sign in.
      </p>
      <p><wa-button variant="brand" data-invite>Invite someone</wa-button></p>
      <p class="list-summary" role="status" data-status></p>
      <p class="form-error" role="alert" data-error hidden></p>
      <div class="table-scroll" tabindex="0" role="region" aria-label="People table">
        <table class="people-table">
          <caption class="visually-hidden">People with an account</caption>
          <thead>
            <tr>
              <th scope="col">Email</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Authenticator app</th>
              <th scope="col">Last signed in</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody data-rows></tbody>
        </table>
      </div>
    </article>
  `;

  const heading = /** @type {HTMLElement} */ (
    container.querySelector("[data-heading]")
  );
  const status = /** @type {HTMLElement} */ (
    container.querySelector("[data-status]")
  );
  const errorEl = /** @type {HTMLElement} */ (
    container.querySelector("[data-error]")
  );
  const rows = /** @type {HTMLElement} */ (
    container.querySelector("[data-rows]")
  );
  let active = true;
  /** @type {Map<string, Person>} */
  const byId = new Map();

  /** @param {string} message */
  function fail(message) {
    status.textContent = "";
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  /** @param {string} message */
  function say(message) {
    errorEl.hidden = true;
    status.textContent = message;
  }

  /** @param {Person} person */
  function buildRow(person) {
    const row = document.createElement("tr");
    row.dataset.uid = person.uid;
    const cells = [
      person.email,
      roleLabel(person.role),
      statusOf(person),
      person.authenticators > 0 ? "Set up" : "Not set up",
      person.lastSignIn
        ? new Date(person.lastSignIn).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "Never",
    ];
    for (const text of cells) {
      const cell = document.createElement("td");
      cell.textContent = text;
      row.append(cell);
    }

    const actions = document.createElement("td");
    actions.className = "point-actions";
    const self = person.uid === people?.uid();
    if (self) {
      actions.textContent = "This is you";
    } else if (canManage(people?.role(), person.role)) {
      /** @type {[string, string, string?][]} */
      const wanted = [["Change role", "role"]];
      wanted.push([person.disabled ? "Enable" : "Disable", "disabled"]);
      if (person.authenticators > 0)
        wanted.push(["Reset authenticator", "authenticator", "danger"]);
      if (!person.lastSignIn && !person.disabled)
        wanted.push(["Resend invitation", "resend"]);
      for (const [verb, action, variant] of wanted) {
        const button = actionButton(verb, person.email, () => {}, variant);
        button.dataset.action = action;
        actions.append(button);
      }
    }
    row.append(actions);
    return row;
  }

  async function refresh() {
    try {
      const list = await people?.api.list();
      if (!active || !list) return;
      byId.clear();
      for (const person of list) byId.set(person.uid, person);
      const sorted = [...list].sort((a, b) => a.email.localeCompare(b.email));
      rows.replaceChildren(...sorted.map(buildRow));
    } catch (error) {
      fail(error instanceof Error ? error.message : "Could not load people.");
    }
  }

  /**
   * Run a change, then reload the list and tell the person what happened.
   * @param {() => Promise<void>} change
   * @param {string} done
   */
  async function run(change, done) {
    try {
      await change();
      await refresh();
      say(done);
    } catch (error) {
      fail(error instanceof Error ? error.message : "That did not work.");
    }
  }

  container
    .querySelector("[data-invite]")
    ?.addEventListener("click", async () => {
      const answer = await askPerson({
        label: "Invite someone",
        confirmText: "Send invitation",
        askEmail: true,
        roles: assignableRoles(people.role()),
        currentRole: "councillor",
      });
      if (!answer) return;
      /** @type {Person} */
      let invited;
      try {
        invited = await people.api.invite(answer.email, answer.role);
      } catch (error) {
        fail(error instanceof Error ? error.message : "That did not work.");
        return;
      }
      await refresh();
      // The server tidies the address (lower case), so use the one it returns.
      try {
        await people.sendInvitation(invited.email);
        say(`Invitation sent to ${invited.email}.`);
      } catch {
        fail(
          `${invited.email} has an account, but the invitation email could not be sent. Choose Resend invitation to try again.`,
        );
      }
    });

  rows.addEventListener("click", async (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest("[data-action]")
        : null;
    const person = byId.get(button?.closest("tr")?.dataset.uid ?? "");
    if (!button || !person) return;
    const action = button.getAttribute("data-action");

    if (action === "role") {
      const answer = await askPerson({
        label: `Change role for ${person.email}`,
        confirmText: "Save role",
        askEmail: false,
        roles: assignableRoles(people.role()),
        currentRole: person.role ?? undefined,
      });
      if (answer && answer.role !== person.role)
        await run(
          () => people.api.setRole(person.uid, answer.role),
          `${person.email} is now ${roleLabel(answer.role).toLowerCase()}. They are signed out and will need to sign in again.`,
        );
    } else if (action === "disabled") {
      const disabling = !person.disabled;
      const ok = await confirmAction({
        label: disabling ? "Disable this account?" : "Enable this account?",
        message: disabling
          ? `${person.email} will be signed out everywhere and will not be able to sign in until you enable them again.`
          : `${person.email} will be able to sign in again.`,
        confirmText: disabling ? "Disable" : "Enable",
        variant: disabling ? "danger" : "brand",
      });
      if (ok)
        await run(
          () => people.api.setDisabled(person.uid, disabling),
          `${person.email} is now ${disabling ? "disabled" : "enabled"}.`,
        );
    } else if (action === "authenticator") {
      const ok = await confirmAction({
        label: "Reset this authenticator?",
        message: `Use this if ${person.email} has lost their phone. They will be signed out and must set up an authenticator app again the next time they sign in.`,
        confirmText: "Reset authenticator",
      });
      if (ok)
        await run(
          () => people.api.resetAuthenticators(person.uid),
          `The authenticator for ${person.email} has been reset.`,
        );
    } else if (action === "resend") {
      await run(
        () => people.sendInvitation(person.email),
        `Invitation sent again to ${person.email}.`,
      );
    }
    heading.focus();
  });

  void refresh();
  return () => {
    active = false;
  };
}
