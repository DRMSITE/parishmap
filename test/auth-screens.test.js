import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAuthScreen } from "../src/ui/auth-screens.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** @param {Record<string, unknown>} [overrides] */
function fakeSession(overrides = {}) {
  return /** @type {any} */ ({
    state: { status: "signed-out" },
    signIn: vi.fn(async () => {}),
    verifySecondFactor: vi.fn(async () => {}),
    cancelSecondFactor: vi.fn(),
    sendVerificationEmail: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    beginEnrolment: vi.fn(async () => ({
      uri: "otpauth://totp/Exampleton:a@b.org?secret=ABCDEFGHIJKL",
      key: "ABCDEFGHIJKL",
    })),
    finishEnrolment: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    ...overrides,
  });
}

/** @type {HTMLElement} */
let container;
beforeEach(() => {
  document.body.innerHTML = '<main id="m"></main>';
  container = /** @type {HTMLElement} */ (document.getElementById("m"));
});

/** @param {string} name @param {string} value */
function type(name, value) {
  const field = /** @type {any} */ (
    container.querySelector(`[name="${name}"]`)
  );
  field.value = value;
}

/** @param {string} selector */
function submit(selector = "form") {
  container
    .querySelector(selector)
    ?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
}

const error = () =>
  /** @type {HTMLElement} */ (container.querySelector("[data-error]"));

describe("sign-in screen", () => {
  it("passes the typed email and password to the session", async () => {
    const session = fakeSession();
    renderAuthScreen(container, session);
    expect(container.querySelector("h1")?.textContent).toBe("Sign in");
    type("email", "a@b.org");
    type("password", "secret");
    submit();
    await settle();
    expect(session.signIn).toHaveBeenCalledWith("a@b.org", "secret");
    expect(error().hidden).toBe(true);
  });

  it("shows the session's error message", async () => {
    const session = fakeSession({
      signIn: vi.fn(async () => {
        throw new Error("The email address or password is not correct.");
      }),
    });
    renderAuthScreen(container, session);
    submit();
    await settle();
    expect(error().hidden).toBe(false);
    expect(error().textContent).toBe(
      "The email address or password is not correct.",
    );
  });

  it("shows a notice, such as after setting up the authenticator", () => {
    renderAuthScreen(container, fakeSession(), {
      status: "signed-out",
      notice: "Authenticator added. Now sign in again.",
    });
    const notice = /** @type {HTMLElement} */ (
      container.querySelector("[data-notice]")
    );
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe("Authenticator added. Now sign in again.");
  });

  it("hides the notice when there is none", () => {
    renderAuthScreen(container, fakeSession());
    expect(
      /** @type {HTMLElement} */ (container.querySelector("[data-notice]"))
        .hidden,
    ).toBe(true);
  });
});

describe("forgotten password", () => {
  const status = () =>
    /** @type {HTMLElement} */ (container.querySelector("[data-reset-status]"));
  const resetError = () =>
    /** @type {HTMLElement} */ (container.querySelector("[data-reset-error]"));

  it("asks the session to send a link and gives a cautious answer", async () => {
    const session = fakeSession();
    renderAuthScreen(container, session);
    type("reset-email", "a@b.org");
    submit("[data-reset-form]");
    await settle();
    expect(session.sendPasswordReset).toHaveBeenCalledWith("a@b.org");
    expect(status().textContent).toMatch(/if that address has an account/i);
    expect(resetError().hidden).toBe(true);
    // It must not trigger a sign-in.
    expect(session.signIn).not.toHaveBeenCalled();
  });

  it("shows the session's error and no success message", async () => {
    const session = fakeSession({
      sendPasswordReset: vi.fn(async () => {
        throw new Error("Enter a valid email address.");
      }),
    });
    renderAuthScreen(container, session);
    submit("[data-reset-form]");
    await settle();
    expect(resetError().hidden).toBe(false);
    expect(resetError().textContent).toBe("Enter a valid email address.");
    expect(status().textContent).toBe("");
  });
});

describe("code screen", () => {
  it("sends the code, and can go back", async () => {
    const session = fakeSession({ state: { status: "second-factor" } });
    renderAuthScreen(container, session);
    expect(container.querySelector("h1")?.textContent).toBe("Enter your code");
    type("code", "123456");
    submit();
    await settle();
    expect(session.verifySecondFactor).toHaveBeenCalledWith("123456");

    /** @type {HTMLElement} */ (container.querySelector("[data-back]")).click();
    expect(session.cancelSecondFactor).toHaveBeenCalled();
  });

  it("asks the browser to offer a one-time code", () => {
    renderAuthScreen(container, fakeSession(), { status: "second-factor" });
    expect(
      container.querySelector('[name="code"]')?.getAttribute("autocomplete"),
    ).toBe("one-time-code");
  });

  it("shows a wrong-code message and stays on the screen", async () => {
    const session = fakeSession({
      verifySecondFactor: vi.fn(async () => {
        throw new Error("That code is not correct.");
      }),
    });
    renderAuthScreen(container, session, { status: "second-factor" });
    submit();
    await settle();
    expect(error().textContent).toBe("That code is not correct.");
  });
});

describe("verify email screen", () => {
  const state = /** @type {const} */ ({
    status: "verify-email",
    user: { uid: "u1", email: "a@b.org" },
  });

  it("names the address and sends the email", async () => {
    const session = fakeSession({ state });
    renderAuthScreen(container, session, state);
    expect(container.querySelector("[data-email]")?.textContent).toBe(
      "a@b.org",
    );
    /** @type {HTMLElement} */ (container.querySelector("[data-send]")).click();
    await settle();
    expect(session.sendVerificationEmail).toHaveBeenCalled();
    expect(container.querySelector("[data-notice]")?.textContent).toMatch(
      /email sent/i,
    );
  });

  it("says so when the address is still unverified", async () => {
    const session = fakeSession({ state });
    renderAuthScreen(container, session, state);
    /** @type {HTMLElement} */ (container.querySelector("[data-done]")).click();
    await settle();
    expect(session.refresh).toHaveBeenCalled();
    expect(container.querySelector("[data-notice]")?.textContent).toMatch(
      /not verified yet/i,
    );
  });

  it("stays quiet once the session has moved on", async () => {
    const session = fakeSession({ state });
    session.refresh = vi.fn(async () => {
      session.state = { status: "enrol", user: state.user };
    });
    renderAuthScreen(container, session, state);
    /** @type {HTMLElement} */ (container.querySelector("[data-done]")).click();
    await settle();
    expect(
      /** @type {HTMLElement} */ (container.querySelector("[data-notice]"))
        .hidden,
    ).toBe(true);
  });

  it("can sign out", () => {
    const session = fakeSession({ state });
    renderAuthScreen(container, session, state);
    /** @type {HTMLElement} */ (
      container.querySelector("[data-sign-out]")
    ).click();
    expect(session.signOut).toHaveBeenCalled();
  });
});

describe("setup screen", () => {
  const state = /** @type {const} */ ({
    status: "enrol",
    user: { uid: "u1", email: "a@b.org" },
  });

  it("shows the QR code and the key in groups of four", async () => {
    const session = fakeSession({ state });
    renderAuthScreen(container, session, state);
    await settle();
    const qr = /** @type {any} */ (container.querySelector("wa-qr-code"));
    expect(qr.value).toBe(
      "otpauth://totp/Exampleton:a@b.org?secret=ABCDEFGHIJKL",
    );
    expect(container.querySelector("[data-key]")?.textContent).toBe(
      "ABCD EFGH IJKL",
    );
    expect(
      /** @type {HTMLElement} */ (container.querySelector("[data-setup]"))
        .hidden,
    ).toBe(false);
    expect(
      /** @type {HTMLElement} */ (container.querySelector("[data-loading]"))
        .hidden,
    ).toBe(true);
  });

  it("confirms with the typed code", async () => {
    const session = fakeSession({ state });
    renderAuthScreen(container, session, state);
    await settle();
    type("code", "654321");
    submit();
    await settle();
    expect(session.finishEnrolment).toHaveBeenCalledWith("654321");
  });

  it("offers another try when setup cannot start", async () => {
    const session = fakeSession({
      state,
      beginEnrolment: vi
        .fn()
        .mockRejectedValueOnce(new Error("Could not start setup. Try again."))
        .mockResolvedValueOnce({ uri: "otpauth://x", key: "WXYZ" }),
    });
    renderAuthScreen(container, session, state);
    await settle();
    const failed = /** @type {HTMLElement} */ (
      container.querySelector("[data-failed]")
    );
    expect(failed.hidden).toBe(false);
    expect(failed.textContent).toContain("Could not start setup");
    expect(
      /** @type {HTMLElement} */ (container.querySelector("[data-setup]"))
        .hidden,
    ).toBe(true);

    /** @type {HTMLElement} */ (
      container.querySelector("[data-retry]")
    ).click();
    await settle();
    expect(failed.hidden).toBe(true);
    expect(container.querySelector("[data-key]")?.textContent).toBe("WXYZ");
  });

  it("shows a wrong-code message inside the form", async () => {
    const session = fakeSession({
      state,
      finishEnrolment: vi.fn(async () => {
        throw new Error("That code is not correct.");
      }),
    });
    renderAuthScreen(container, session, state);
    await settle();
    submit();
    await settle();
    expect(container.querySelector("form [data-error]")?.textContent).toBe(
      "That code is not correct.",
    );
  });
});

describe("no access screen", () => {
  it("names the account and tells the person what to do", () => {
    const session = fakeSession();
    const state = /** @type {const} */ ({
      status: "no-access",
      user: { uid: "u1", email: "a@b.org" },
    });
    renderAuthScreen(container, session, state);
    expect(container.querySelector("h1")?.textContent).toBe("No access yet");
    expect(container.querySelector("[data-email]")?.textContent).toBe(
      "a@b.org",
    );
    expect(container.textContent).toMatch(/ask the Parish Clerk/i);
    /** @type {HTMLElement} */ (
      container.querySelector("[data-sign-out]")
    ).click();
    expect(session.signOut).toHaveBeenCalled();
  });
});

describe("loading screen", () => {
  it("says it is checking", () => {
    renderAuthScreen(container, fakeSession(), { status: "loading" });
    expect(container.querySelector("h1")?.textContent).toBe(
      "Checking your sign-in",
    );
    expect(container.querySelector("[role=status]")).not.toBeNull();
  });
});

describe("safety", () => {
  it("puts an email address in as text, never as markup", () => {
    const state = /** @type {const} */ ({
      status: "no-access",
      user: { uid: "u1", email: '<img src=x onerror="alert(1)">@b.org' },
    });
    renderAuthScreen(container, fakeSession(), state);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-email]")?.textContent).toContain(
      "<img",
    );
  });
});
