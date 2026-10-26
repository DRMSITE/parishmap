// The decision-making for managing people (inviting, roles, disabling, authenticator
// resets), kept apart from Firebase so it can be tested on its own (see
// test/people-handler.test.js). `index.js` supplies the Admin SDK calls.
//
// Who may do what is decided here, on the server, whatever the browser sends:
//   admin  any role; any person except themselves
//   clerk  councillors, members and people with no role yet; may assign only councillor
//          or member; never an admin or another clerk
// The `directory` action is the exception: admins, clerks and councillors may ask who
// else can take part (id and email only), so actions on a project can be assigned.
// Nobody changes their own account here, so nobody can lock themselves out or promote
// themselves. That also means an enabled admin always remains: only an admin can change
// an admin, and never themselves.

/** The roles firestore.rules recognises. Keep in step with src/auth/session.js. */
export const ROLES = ["admin", "clerk", "councillor", "member"];

/** Roles allowed to use this API. */
const MANAGERS = ["admin", "clerk"];

/** Roles that take part in projects: they may see each other in the directory. */
const DIRECTORY_ROLES = ["admin", "clerk", "councillor"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UID_PATTERN = /^[A-Za-z0-9]{1,128}$/;

/**
 * @typedef {object} Person
 * @property {string} uid
 * @property {string} email
 * @property {string | null} role
 * @property {boolean} disabled
 * @property {boolean} emailVerified
 * @property {number} authenticators Enrolled authenticator apps.
 * @property {string | null} lastSignIn ISO 8601, or null if never.
 */

/**
 * @typedef {object} PeopleRequest
 * @property {string} method
 * @property {string | undefined} idToken From the X-Firebase-Token header.
 * @property {unknown} body Parsed JSON.
 */

/**
 * @typedef {object} PeopleDeps
 * @property {(idToken: string) => Promise<Record<string, any>>} verifyToken
 * @property {() => Promise<Person[]>} listPeople
 * @property {(uid: string) => Promise<Person | null>} getPerson
 * @property {(email: string) => Promise<Person | null>} findByEmail
 * @property {(email: string) => Promise<Person>} createPerson Creates an account nobody can sign in to until they set a password.
 * @property {(uid: string, role: string) => Promise<void>} setRole Sets the role and signs the person out everywhere.
 * @property {(uid: string, disabled: boolean) => Promise<void>} setDisabled Also signs them out everywhere.
 * @property {(uid: string) => Promise<void>} resetAuthenticators Removes enrolled authenticators and signs them out everywhere.
 * @property {(entry: { action: string, by: string, byEmail: string, targetUid: string, targetEmail: string, detail?: string }) => Promise<void>} audit
 */

/**
 * @typedef {object} PeopleResponse
 * @property {number} status
 * @property {Record<string, unknown>} body
 */

/**
 * @param {number} status
 * @param {string} error
 * @returns {PeopleResponse}
 */
const refuse = (status, error) => ({ status, body: { error } });

/** What a caller of this role may assign. @param {string} role */
export function assignableRoles(role) {
  return role === "admin" ? ROLES : ["councillor", "member"];
}

/**
 * Whether a caller of `role` may change a person who currently has `targetRole`.
 * @param {string} role
 * @param {string | null} targetRole
 */
export function canManage(role, targetRole) {
  if (role === "admin") return true;
  return !targetRole || targetRole === "councillor" || targetRole === "member";
}

/**
 * @param {PeopleRequest} request
 * @param {PeopleDeps} deps
 * @returns {Promise<PeopleResponse>}
 */
export async function handlePeopleRequest(request, deps) {
  if (request.method !== "POST") return refuse(405, "Method not allowed.");
  if (!request.idToken || /\s/.test(request.idToken))
    return refuse(401, "Sign in to continue.");

  /** @type {Record<string, any>} */
  let token;
  try {
    token = await deps.verifyToken(request.idToken);
  } catch {
    return refuse(401, "Sign in to continue.");
  }
  if (!token.firebase?.sign_in_second_factor)
    return refuse(401, "Sign in with your authenticator code.");

  const body =
    request.body && typeof request.body === "object"
      ? /** @type {Record<string, unknown>} */ (request.body)
      : {};

  // The one action open beyond the managers: councillors need names to assign actions.
  // It returns only an id and an email, for people who can take part, never roles or
  // sign-in details.
  if (body.action === "directory") {
    if (!DIRECTORY_ROLES.includes(token.role))
      return refuse(403, "You are not allowed to see who is on the council.");
    const everyone = await deps.listPeople();
    return {
      status: 200,
      body: {
        people: everyone
          .filter((p) => !p.disabled && DIRECTORY_ROLES.includes(p.role ?? ""))
          .map((p) => ({ uid: p.uid, email: p.email })),
      },
    };
  }

  if (!MANAGERS.includes(token.role))
    return refuse(403, "You are not allowed to manage people.");

  const caller = {
    uid: String(token.uid),
    email: String(token.email ?? ""),
    role: String(token.role),
  };

  if (body.action === "list") {
    return { status: 200, body: { people: await deps.listPeople() } };
  }

  if (body.action === "invite") {
    const email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role : "";
    if (email.length > 254 || !EMAIL_PATTERN.test(email))
      return refuse(400, "Enter a valid email address.");
    if (!assignableRoles(caller.role).includes(role))
      return refuse(403, "You cannot give that role.");
    if (await deps.findByEmail(email))
      return refuse(
        409,
        "Someone with that email address already has an account.",
      );
    const person = await deps.createPerson(email);
    await deps.setRole(person.uid, role);
    await deps.audit({
      action: "invite",
      by: caller.uid,
      byEmail: caller.email,
      targetUid: person.uid,
      targetEmail: email,
      detail: role,
    });
    return { status: 200, body: { person: { ...person, role } } };
  }

  if (
    body.action === "setRole" ||
    body.action === "setDisabled" ||
    body.action === "resetAuthenticators"
  ) {
    const uid = typeof body.uid === "string" ? body.uid : "";
    if (!UID_PATTERN.test(uid)) return refuse(400, "Choose a person.");
    if (uid === caller.uid)
      return refuse(403, "You cannot change your own account.");
    const target = await deps.getPerson(uid);
    if (!target) return refuse(404, "That person no longer exists.");
    if (!canManage(caller.role, target.role))
      return refuse(403, "You cannot change that person.");

    if (body.action === "setRole") {
      const role = typeof body.role === "string" ? body.role : "";
      if (!assignableRoles(caller.role).includes(role))
        return refuse(403, "You cannot give that role.");
      await deps.setRole(uid, role);
      await deps.audit({
        action: "setRole",
        by: caller.uid,
        byEmail: caller.email,
        targetUid: uid,
        targetEmail: target.email,
        detail: `${target.role ?? "none"} -> ${role}`,
      });
      return { status: 200, body: { ok: true } };
    }

    if (body.action === "setDisabled") {
      if (typeof body.disabled !== "boolean")
        return refuse(400, "Say whether to disable or enable.");
      await deps.setDisabled(uid, body.disabled);
      await deps.audit({
        action: body.disabled ? "disable" : "enable",
        by: caller.uid,
        byEmail: caller.email,
        targetUid: uid,
        targetEmail: target.email,
      });
      return { status: 200, body: { ok: true } };
    }

    await deps.resetAuthenticators(uid);
    await deps.audit({
      action: "resetAuthenticators",
      by: caller.uid,
      byEmail: caller.email,
      targetUid: uid,
      targetEmail: target.email,
    });
    return { status: 200, body: { ok: true } };
  }

  return refuse(400, "Unknown action.");
}
