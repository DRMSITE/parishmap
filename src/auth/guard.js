// Guards for create, read, update and delete on points.
//
// They are NOT enforced yet: the default guard, `allowAll`, permits everything. The
// plumbing is here so that, when authentication and authorisation arrive, only the
// guard needs replacing (in `main.js`) rather than every place that touches data.
//
// A guard in the browser is a convenience: it decides what the interface offers and
// stops well-behaved code. It is not security, because anyone can bypass client
// code. The back end must make the same decision on every request.

/** @typedef {import("../types.js").Guard} Guard */

/** Thrown when a guard refuses an action. */
export class ForbiddenError extends Error {
  /**
   * @param {import("../types.js").GuardAction} action
   * @param {string} [recordId] The record the action was aimed at, if any.
   */
  constructor(action, recordId) {
    super(
      `Not allowed to ${action}${recordId ? ` record "${recordId}"` : ""}.`,
    );
    this.name = "ForbiddenError";
    this.action = action;
    this.recordId = recordId;
  }
}

/** The default guard: everything is allowed. @type {Guard} */
export const allowAll = { can: () => true };

/**
 * A guard that answers from the signed-in session. It mirrors firestore.rules so the
 * interface only offers what the rules will accept:
 *   admin, clerk  everything
 *   councillor    read and add; change or delete only their own
 *   member        read only
 * Asked about an action with no record (for example "can this person edit anything?"),
 * a councillor is allowed, since which records they own is not yet known.
 * @param {() => import("./session.js").SessionState} getState
 * @returns {Guard}
 */
export function createRoleGuard(getState) {
  return {
    can(action, record) {
      const { status, role, user } = getState();
      if (status !== "ready") return false;
      if (role === "admin" || role === "clerk") return true;
      if (role === "member") return action === "read";
      if (role === "councillor") {
        if (action === "read" || action === "create") return true;
        return record ? record.createdBy === user?.uid : true;
      }
      return false;
    },
  };
}

/**
 * Wrap a data source so every operation asks the guard first, and throws a
 * `ForbiddenError` (without touching the source) when it says no. Reads are
 * filtered rather than thrown for `list`, so one unreadable record does not hide
 * the rest.
 * @param {import("../types.js").DataSource} source
 * @param {Guard} guard
 * @returns {import("../types.js").DataSource}
 */
export function guardDataSource(source, guard) {
  return {
    async list(query) {
      const records = await source.list(query);
      return records.filter((record) => guard.can("read", record));
    },
    async get(id) {
      const record = await source.get(id);
      if (record && !guard.can("read", record))
        throw new ForbiddenError("read", id);
      return record;
    },
    async create(input) {
      if (!guard.can("create")) throw new ForbiddenError("create");
      return source.create(input);
    },
    async update(id, patch) {
      // A missing record is left to the source, which reports it as it always has.
      const existing = await source.get(id);
      if (existing && !guard.can("update", existing))
        throw new ForbiddenError("update", id);
      return source.update(id, patch);
    },
    async remove(id) {
      const existing = await source.get(id);
      if (existing && !guard.can("delete", existing))
        throw new ForbiddenError("delete", id);
      return source.remove(id);
    },
    subscribe: source.subscribe?.bind(source),
  };
}
