// The screens shown until a person is fully signed in: sign-in, authenticator code,
// email verification, authenticator setup and "no access". `renderAuthScreen` draws the
// one that matches the session's status; call it again whenever the status changes.
// Messages and errors come from session.js as readable Errors.

import { config } from "../config.js";

/** @typedef {import("../auth/session.js").SessionState} SessionState */
/** @typedef {ReturnType<typeof import("../auth/session.js").createSession>} Session */

/**
 * Run an action from a form, showing any Error inside it and keeping the button from
 * being pressed twice.
 * @param {HTMLElement} root
 * @param {() => Promise<void>} action
 * @param {HTMLElement | null} button
 */
async function run(root, action, button) {
  const errorEl = /** @type {HTMLElement | null} */ (
    root.querySelector("[data-error]")
  );
  if (errorEl) errorEl.hidden = true;
  if (button) /** @type {any} */ (button).loading = true;
  try {
    await action();
  } catch (error) {
    if (errorEl) {
      errorEl.textContent =
        error instanceof Error ? error.message : "Something went wrong.";
      errorEl.hidden = false;
    } else console.error("[auth] Action failed.", error);
  } finally {
    // The screen may have been replaced by now; this is harmless on a detached button.
    if (button) /** @type {any} */ (button).loading = false;
  }
}

/**
 * @param {ParentNode} root
 * @param {string} name
 * @returns {string}
 */
const valueOf = (root, name) =>
  String(
    /** @type {any} */ (root.querySelector(`[name="${name}"]`))?.value ?? "",
  );

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @param {string} text
 */
function setText(root, selector, text) {
  const el = root.querySelector(selector);
  if (el) el.textContent = text;
}

/** @param {HTMLElement} root @param {string} selector @param {() => void} handler */
function onClick(root, selector, handler) {
  root.querySelector(selector)?.addEventListener("click", handler);
}

const ERROR = '<p class="form-error" role="alert" data-error hidden></p>';

/**
 * @param {HTMLElement} container
 * @param {Session} session
 * @param {SessionState} [state]
 */
export function renderAuthScreen(container, session, state = session.state) {
  const page = document.createElement("article");
  page.className = "page auth-page";
  container.replaceChildren(page);

  switch (state.status) {
    case "signed-out":
      return signIn(page, session, state);
    case "second-factor":
      return secondFactor(page, session);
    case "verify-email":
      return verifyEmail(page, session, state);
    case "enrol":
      return enrol(page, session, state);
    case "no-access":
      return noAccess(page, session, state);
    default:
      page.innerHTML = `
        <h1 tabindex="-1" data-heading>Checking your sign-in</h1>
        <p role="status"><wa-spinner></wa-spinner> One moment…</p>
      `;
  }
}

/** @param {HTMLElement} page @param {Session} session @param {SessionState} state */
function signIn(page, session, state) {
  page.innerHTML = `
    <h1 tabindex="-1" data-heading>Sign in</h1>
    <p>${config.appName} is for ${config.council.councillors} and the ${config.council.clerkTitle}.</p>
    <p role="status" data-notice hidden></p>
    <form class="stack" novalidate>
      <wa-input name="email" type="email" label="Email address" autocomplete="username"
        inputmode="email" required></wa-input>
      <wa-input name="password" type="password" label="Password" password-toggle
        autocomplete="current-password" required></wa-input>
      ${ERROR}
      <wa-button type="submit" variant="brand" data-submit>Continue</wa-button>
    </form>
    <p>You will be asked for a six-digit code from your authenticator app next.</p>
    <details data-reset>
      <summary>Forgotten your password?</summary>
      <form class="stack" novalidate data-reset-form>
        <p>Enter your email address and we will email you a link to choose a new password.</p>
        <wa-input name="reset-email" type="email" label="Account email" autocomplete="email"
          inputmode="email" required></wa-input>
        <p class="form-error" role="alert" data-reset-error hidden></p>
        <p role="status" data-reset-status></p>
        <wa-button type="submit" appearance="outlined" data-reset-submit>Send link</wa-button>
      </form>
    </details>
  `;
  if (state.notice) {
    setText(page, "[data-notice]", state.notice);
    /** @type {HTMLElement} */ (page.querySelector("[data-notice]")).hidden =
      false;
  }
  const form = /** @type {HTMLFormElement} */ (page.querySelector("form"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run(
      page,
      () => session.signIn(valueOf(form, "email"), valueOf(form, "password")),
      page.querySelector("[data-submit]"),
    );
  });
  forgottenPassword(page, session);
}

/**
 * The "Forgotten your password?" form. It gives the same answer whether or not the
 * address has an account (see session.sendPasswordReset).
 * @param {HTMLElement} page
 * @param {Session} session
 */
function forgottenPassword(page, session) {
  const form = /** @type {HTMLFormElement} */ (
    page.querySelector("[data-reset-form]")
  );
  const errorEl = /** @type {HTMLElement} */ (
    form.querySelector("[data-reset-error]")
  );
  const statusEl = /** @type {HTMLElement} */ (
    form.querySelector("[data-reset-status]")
  );
  const button = /** @type {any} */ (form.querySelector("[data-reset-submit]"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    statusEl.textContent = "";
    button.loading = true;
    try {
      await session.sendPasswordReset(valueOf(form, "reset-email"));
      statusEl.textContent =
        "If that address has an account, a link to choose a new password is on its way. It can take a few minutes, so check your spam folder too.";
    } catch (error) {
      errorEl.textContent =
        error instanceof Error ? error.message : "Something went wrong.";
      errorEl.hidden = false;
    } finally {
      button.loading = false;
    }
  });
}

/** @param {HTMLElement} page @param {Session} session */
function secondFactor(page, session) {
  page.innerHTML = `
    <h1 tabindex="-1" data-heading>Enter your code</h1>
    <p>Open your authenticator app and enter the six-digit code for ${config.appName}.</p>
    <form class="stack" novalidate>
      <wa-input name="code" label="Six-digit code" inputmode="numeric"
        autocomplete="one-time-code" maxlength="7" required></wa-input>
      ${ERROR}
      <div class="point-actions">
        <wa-button type="submit" variant="brand" data-submit>Sign in</wa-button>
        <wa-button type="button" appearance="outlined" data-back>Back</wa-button>
      </div>
    </form>
  `;
  const form = /** @type {HTMLFormElement} */ (page.querySelector("form"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run(
      page,
      () => session.verifySecondFactor(valueOf(form, "code")),
      page.querySelector("[data-submit]"),
    );
  });
  onClick(page, "[data-back]", () => session.cancelSecondFactor());
}

/** @param {HTMLElement} page @param {Session} session @param {SessionState} state */
function verifyEmail(page, session, state) {
  page.innerHTML = `
    <h1 tabindex="-1" data-heading>Verify your email address</h1>
    <p>Before you can set up your authenticator app, we need to check that
      <strong data-email></strong> is yours.</p>
    <ol>
      <li>Press <strong>Send verification email</strong>.</li>
      <li>Open the email and follow its link. It may arrive in your junk folder; it comes
        from <em>${config.senderAddress}</em>.</li>
      <li>Come back here and press <strong>I have verified my email</strong>.</li>
    </ol>
    <p role="status" data-notice hidden></p>
    ${ERROR}
    <div class="point-actions">
      <wa-button variant="brand" data-send>Send verification email</wa-button>
      <wa-button appearance="outlined" data-done>I have verified my email</wa-button>
      <wa-button appearance="plain" data-sign-out>Sign out</wa-button>
    </div>
  `;
  setText(page, "[data-email]", state.user?.email ?? "");
  const notice = /** @type {HTMLElement} */ (
    page.querySelector("[data-notice]")
  );
  onClick(page, "[data-send]", () => {
    void run(
      page,
      async () => {
        await session.sendVerificationEmail();
        notice.textContent = "Email sent. Check your inbox.";
        notice.hidden = false;
      },
      page.querySelector("[data-send]"),
    );
  });
  onClick(page, "[data-done]", () => {
    void run(
      page,
      async () => {
        await session.refresh();
        // Still here means the address is not verified yet.
        if (session.state.status === "verify-email") {
          notice.textContent =
            "That address is not verified yet. Follow the link in the email, then try again.";
          notice.hidden = false;
        }
      },
      page.querySelector("[data-done]"),
    );
  });
  onClick(page, "[data-sign-out]", () => void session.signOut());
}

/** @param {HTMLElement} page @param {Session} session @param {SessionState} state */
function enrol(page, session, state) {
  page.innerHTML = `
    <h1 tabindex="-1" data-heading>Set up your authenticator app</h1>
    <p>Signing in needs a six-digit code from an authenticator app on your phone, as well
      as your password. You only set this up once.</p>
    <p role="status" data-loading><wa-spinner></wa-spinner> Preparing…</p>
    <div class="stack" data-setup hidden>
      <ol>
        <li>Install an authenticator app, such as Google Authenticator, Microsoft
          Authenticator or Authy.</li>
        <li>In the app, add an account and scan this code.</li>
        <li>Enter the six-digit code the app shows.</li>
      </ol>
      <wa-qr-code size="176" label="QR code for the authenticator app"></wa-qr-code>
      <details>
        <summary>Cannot scan the code?</summary>
        <p>Choose “enter a setup key” in the app and type this key for
          <strong data-email></strong>:</p>
        <p><code data-key></code></p>
      </details>
      <form class="stack" novalidate>
        <wa-input name="code" label="Six-digit code" inputmode="numeric"
          autocomplete="one-time-code" maxlength="7" required></wa-input>
        ${ERROR}
        <wa-button type="submit" variant="brand" data-submit>Confirm</wa-button>
      </form>
    </div>
    <div data-failed hidden>
      ${ERROR}
      <wa-button data-retry>Try again</wa-button>
    </div>
    <p><wa-button appearance="plain" data-sign-out>Sign out</wa-button></p>
  `;
  setText(page, "[data-email]", state.user?.email ?? "");
  const setup = /** @type {HTMLElement} */ (page.querySelector("[data-setup]"));
  const loading = /** @type {HTMLElement} */ (
    page.querySelector("[data-loading]")
  );
  const failed = /** @type {HTMLElement} */ (
    page.querySelector("[data-failed]")
  );

  async function prepare() {
    loading.hidden = false;
    failed.hidden = true;
    try {
      const { uri, key } = await session.beginEnrolment();
      /** @type {any} */ (page.querySelector("wa-qr-code")).value = uri;
      setText(page, "[data-key]", key.match(/.{1,4}/g)?.join(" ") ?? key);
      setup.hidden = false;
    } catch (error) {
      const message = failed.querySelector("[data-error]");
      if (message) {
        message.textContent =
          error instanceof Error ? error.message : "Could not start setup.";
        /** @type {HTMLElement} */ (message).hidden = false;
      }
      failed.hidden = false;
    } finally {
      loading.hidden = true;
    }
  }

  const form = /** @type {HTMLFormElement} */ (page.querySelector("form"));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void run(
      form,
      () => session.finishEnrolment(valueOf(form, "code")),
      page.querySelector("[data-submit]"),
    );
  });
  onClick(page, "[data-retry]", () => void prepare());
  onClick(page, "[data-sign-out]", () => void session.signOut());
  void prepare();
}

/** @param {HTMLElement} page @param {Session} session @param {SessionState} state */
function noAccess(page, session, state) {
  page.innerHTML = `
    <h1 tabindex="-1" data-heading>No access yet</h1>
    <p>You are signed in as <strong data-email></strong>, but you have not been given
      access to the map. Please ask the ${config.council.clerkTitle} to set up your access.</p>
    <wa-button appearance="outlined" data-sign-out>Sign out</wa-button>
  `;
  setText(page, "[data-email]", state.user?.email ?? "");
  onClick(page, "[data-sign-out]", () => void session.signOut());
}
