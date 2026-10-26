import { describe, expect, it, vi } from "vitest";
import { createSession, describeAuthError } from "../src/auth/session.js";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** @param {Record<string, unknown>} [overrides] */
const userWith = (overrides = {}) => ({
  uid: "u1",
  email: "u1@example.org",
  emailVerified: true,
  ...overrides,
});

/**
 * A stand-in for Firebase. `emit` plays the part of Firebase reporting who is signed in.
 * @param {Partial<import("../src/auth/session.js").AuthApi>} [overrides]
 */
function setup(overrides = {}) {
  /** @type {(user: any) => void} */
  let listener = () => {};
  const resolve = vi.fn(async () => {});
  const confirm = vi.fn(async () => {});
  /** @type {import("../src/auth/session.js").AuthApi} */
  const api = {
    onAuthStateChanged: (_auth, next) => {
      listener = next;
      return () => {};
    },
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => listener(null)),
    sendVerification: vi.fn(async () => {}),
    sendPasswordReset: vi.fn(async () => {}),
    reload: vi.fn(async () => {}),
    tokenClaims: vi.fn(async () => ({
      role: "member",
      firebase: { sign_in_second_factor: "totp" },
    })),
    enrolledFactorCount: vi.fn(() => 1),
    resolverFor: vi.fn(() => ({ resolve })),
    startEnrolment: vi.fn(async () => ({
      uri: "otpauth://totp/x",
      key: "ABCDEF",
      confirm,
    })),
    ...overrides,
  };
  const session = createSession({ auth: {}, api, appName: "Exampleton" });
  return {
    api,
    session,
    resolve,
    confirm,
    /** @param {any} user */
    emit: async (user) => {
      listener(user);
      await settle();
    },
  };
}

/** @param {unknown} code @returns {never} */
const authError = (code) => {
  throw Object.assign(new Error(String(code)), { code });
};

describe("which screen to show", () => {
  it("waits, then shows the sign-in form when nobody is signed in", async () => {
    const { session, emit } = setup();
    expect(session.state.status).toBe("loading");
    await emit(null);
    expect(session.state.status).toBe("signed-out");
  });

  it("asks for email verification first", async () => {
    const { session, emit } = setup();
    await emit(userWith({ emailVerified: false }));
    expect(session.state).toMatchObject({
      status: "verify-email",
      user: { uid: "u1", email: "u1@example.org" },
    });
  });

  it("moves on after the email is verified", async () => {
    const user = userWith({ emailVerified: false });
    const { session, emit, api } = setup({ enrolledFactorCount: () => 0 });
    await emit(user);
    user.emailVerified = true;
    await session.refresh();
    expect(api.reload).toHaveBeenCalledWith(user);
    expect(session.state.status).toBe("enrol");
  });

  it("asks for an authenticator app when none is set up", async () => {
    const { session, emit } = setup({ enrolledFactorCount: () => 0 });
    await emit(userWith());
    expect(session.state.status).toBe("enrol");
  });

  it("is ready with the role from the token", async () => {
    const { session, emit } = setup({
      tokenClaims: async () => ({
        role: "councillor",
        firebase: { sign_in_second_factor: "totp" },
      }),
    });
    await emit(userWith());
    expect(session.state).toMatchObject({
      status: "ready",
      role: "councillor",
    });
  });

  it("says there is no access when the account has no role", async () => {
    const { session, emit } = setup({
      tokenClaims: async () => ({
        firebase: { sign_in_second_factor: "totp" },
      }),
    });
    await emit(userWith());
    expect(session.state.status).toBe("no-access");
    expect(session.state.role).toBeUndefined();
  });

  it("does not trust a role it does not recognise", async () => {
    const { session, emit } = setup({
      tokenClaims: async () => ({
        role: "superuser",
        firebase: { sign_in_second_factor: "totp" },
      }),
    });
    await emit(userWith());
    expect(session.state.status).toBe("no-access");
  });

  it("signs out a session that has no second factor, with an explanation", async () => {
    const { session, emit, api } = setup({
      tokenClaims: async () => ({ role: "admin", firebase: {} }),
    });
    await emit(userWith());
    expect(api.signOut).toHaveBeenCalled();
    expect(session.state.status).toBe("signed-out");
    expect(session.state.notice).toMatch(/sign in again/i);
  });

  it("signs out, with a notice, when the token cannot be read", async () => {
    const { session, emit } = setup({
      tokenClaims: async () => {
        throw new Error("offline");
      },
    });
    await emit(userWith());
    expect(session.state.status).toBe("signed-out");
    expect(session.state.notice).toBeTruthy();
  });

  it("tells listeners about each change, until they stop", async () => {
    const { session, emit } = setup();
    const seen = /** @type {string[]} */ ([]);
    const stop = session.subscribe((state) => seen.push(state.status));
    await emit(null);
    stop();
    await emit(userWith());
    expect(seen).toEqual(["signed-out"]);
  });
});

describe("signing in", () => {
  it("rejects empty fields without calling Firebase", async () => {
    const { session, api } = setup();
    await expect(session.signIn("", "x")).rejects.toThrow(
      /email address and password/,
    );
    await expect(session.signIn("a@b.org", "")).rejects.toThrow(
      /email address and password/,
    );
    expect(api.signIn).not.toHaveBeenCalled();
  });

  it("trims the email address", async () => {
    const { session, api } = setup();
    await session.signIn("  a@b.org ", "pw");
    expect(api.signIn).toHaveBeenCalledWith({}, "a@b.org", "pw");
  });

  it.each([
    "auth/invalid-credential",
    "auth/wrong-password",
    "auth/user-not-found",
  ])("gives one vague message for %s", async (code) => {
    const { session } = setup({ signIn: async () => authError(code) });
    await expect(session.signIn("a@b.org", "pw")).rejects.toThrow(
      "The email address or password is not correct.",
    );
  });

  it("explains rate limiting", async () => {
    const { session } = setup({
      signIn: async () => authError("auth/too-many-requests"),
    });
    await expect(session.signIn("a@b.org", "pw")).rejects.toThrow(
      /wait a few minutes/i,
    );
  });

  it("asks for the code when a second factor is required, then completes", async () => {
    const { session, api, resolve, emit } = setup({
      signIn: async () => authError("auth/multi-factor-auth-required"),
    });
    await session.signIn("a@b.org", "pw");
    expect(api.resolverFor).toHaveBeenCalled();
    expect(session.state.status).toBe("second-factor");

    // Firebase reporting "nobody yet" while waiting for the code must not reset the form.
    await emit(null);
    expect(session.state.status).toBe("second-factor");

    await session.verifySecondFactor("123 456");
    expect(resolve).toHaveBeenCalledWith("123456");
    await emit(userWith());
    expect(session.state.status).toBe("ready");
  });

  it("refuses codes that are not six digits without asking Firebase", async () => {
    const { session, resolve } = setup({
      signIn: async () => authError("auth/multi-factor-auth-required"),
    });
    await session.signIn("a@b.org", "pw");
    for (const code of ["", "12345", "1234567", "abcdef"])
      await expect(session.verifySecondFactor(code)).rejects.toThrow(
        /six-digit/,
      );
    expect(resolve).not.toHaveBeenCalled();
  });

  it("lets the person retry after a wrong code", async () => {
    const resolve = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("x"), {
          code: "auth/invalid-verification-code",
        }),
      )
      .mockResolvedValueOnce(undefined);
    const { session } = setup({
      signIn: async () => authError("auth/multi-factor-auth-required"),
      resolverFor: () => ({ resolve }),
    });
    await session.signIn("a@b.org", "pw");
    await expect(session.verifySecondFactor("111111")).rejects.toThrow(
      /not correct/,
    );
    expect(session.state.status).toBe("second-factor");
    await expect(session.verifySecondFactor("222222")).resolves.toBeUndefined();
  });

  it("explains an account that has no authenticator app", async () => {
    const { session } = setup({
      signIn: async () => authError("auth/multi-factor-auth-required"),
      resolverFor: () => null,
    });
    await expect(session.signIn("a@b.org", "pw")).rejects.toThrow(
      /no authenticator app/i,
    );
  });

  it("goes back to the password form when the code step is cancelled", async () => {
    const { session } = setup({
      signIn: async () => authError("auth/multi-factor-auth-required"),
    });
    await session.signIn("a@b.org", "pw");
    session.cancelSecondFactor();
    expect(session.state.status).toBe("signed-out");
    await expect(session.verifySecondFactor("123456")).rejects.toThrow(
      /sign in again/i,
    );
  });

  it("signs out", async () => {
    const { session, emit, api } = setup();
    await emit(userWith());
    await session.signOut();
    await settle();
    expect(api.signOut).toHaveBeenCalled();
    expect(session.state.status).toBe("signed-out");
  });
});

describe("forgotten password", () => {
  it("asks for the link to be sent to the trimmed address", async () => {
    const { session, api } = setup();
    await session.sendPasswordReset("  a@b.org ");
    expect(api.sendPasswordReset).toHaveBeenCalledWith({}, "a@b.org");
  });

  it("needs an address", async () => {
    const { session, api } = setup();
    await expect(session.sendPasswordReset("  ")).rejects.toThrow(
      /enter your email/i,
    );
    expect(api.sendPasswordReset).not.toHaveBeenCalled();
  });

  it("does not reveal that an address has no account", async () => {
    const { session } = setup({
      sendPasswordReset: async () => authError("auth/user-not-found"),
    });
    await expect(
      session.sendPasswordReset("who@b.org"),
    ).resolves.toBeUndefined();
  });

  it("explains a badly formed address and too many attempts", async () => {
    const bad = setup({
      sendPasswordReset: async () => authError("auth/invalid-email"),
    });
    await expect(bad.session.sendPasswordReset("nope")).rejects.toThrow(
      /valid email/i,
    );
    const busy = setup({
      sendPasswordReset: async () => authError("auth/too-many-requests"),
    });
    await expect(busy.session.sendPasswordReset("a@b.org")).rejects.toThrow(
      /wait a few minutes/i,
    );
  });
});

describe("verifying email and enrolling", () => {
  it("sends the verification email to the signed-in person", async () => {
    const user = userWith({ emailVerified: false });
    const { session, emit, api } = setup();
    await emit(user);
    await session.sendVerificationEmail();
    expect(api.sendVerification).toHaveBeenCalledWith(user);
  });

  it("explains a failure to send", async () => {
    const { session, emit } = setup({
      sendVerification: async () => authError("auth/too-many-requests"),
    });
    await emit(userWith({ emailVerified: false }));
    await expect(session.sendVerificationEmail()).rejects.toThrow(
      /wait a few minutes/i,
    );
  });

  it("needs someone signed in to send or refresh", async () => {
    const { session } = setup();
    await expect(session.sendVerificationEmail()).rejects.toThrow(/sign in/i);
    await expect(session.refresh()).rejects.toThrow(/sign in/i);
    await expect(session.beginEnrolment()).rejects.toThrow(/sign in/i);
  });

  it("gives the QR address and text key, then signs out once the code is accepted", async () => {
    const { session, emit, confirm, api } = setup({
      enrolledFactorCount: () => 0,
    });
    await emit(userWith());
    const { uri, key } = await session.beginEnrolment();
    expect(api.startEnrolment).toHaveBeenCalledWith(
      expect.anything(),
      "Exampleton",
    );
    expect(uri).toBe("otpauth://totp/x");
    expect(key).toBe("ABCDEF");

    await session.finishEnrolment("654 321");
    expect(confirm).toHaveBeenCalledWith("654321");
    expect(api.signOut).toHaveBeenCalled();
    expect(session.state.status).toBe("signed-out");
    expect(session.state.notice).toMatch(/sign in again/i);
  });

  it("keeps the person on the setup screen after a wrong code", async () => {
    const { session, emit, api } = setup({
      enrolledFactorCount: () => 0,
      startEnrolment: async () => ({
        uri: "u",
        key: "k",
        confirm: async () => authError("auth/invalid-verification-code"),
      }),
    });
    await emit(userWith());
    await session.beginEnrolment();
    await expect(session.finishEnrolment("000000")).rejects.toThrow(
      /not correct/,
    );
    expect(api.signOut).not.toHaveBeenCalled();
    expect(session.state.status).toBe("enrol");
  });

  it("will not finish before starting", async () => {
    const { session, emit } = setup({ enrolledFactorCount: () => 0 });
    await emit(userWith());
    await expect(session.finishEnrolment("123456")).rejects.toThrow(
      /start the setup/i,
    );
  });
});

describe("describeAuthError", () => {
  it("falls back for errors it does not know", () => {
    expect(describeAuthError(new Error("boom"), "Fallback.")).toBe("Fallback.");
    expect(describeAuthError(undefined, "Fallback.")).toBe("Fallback.");
  });

  it("covers network and disabled accounts", () => {
    expect(
      describeAuthError({ code: "auth/network-request-failed" }, ""),
    ).toMatch(/connection/);
    expect(describeAuthError({ code: "auth/user-disabled" }, "")).toMatch(
      /Clerk/,
    );
  });
});
