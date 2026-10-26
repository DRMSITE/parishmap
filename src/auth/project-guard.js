// Who may do what with projects, actions and notes, as the interface needs to know it.
// It mirrors firestore.rules, which makes the same decisions on every request; this only
// stops the interface offering what would be refused.
//
//                          admin/clerk  responsible councillor  other councillor  member
//   create top project     yes          no                      no                no
//   create sub-project     yes          yes (under own)         no                no
//   edit project           yes          own                     no                no
//   change responsible     yes          no                      no                no
//   delete project         yes          no                      no                no
//   add action (Ideas)     yes          yes                     yes               no
//   move / place actions   yes          own project             no                no
//   edit/delete action     yes          own project             own               no
//   add note               yes          yes                     yes               no
//   edit/delete note       any          own                     own               no

import { FIRST_LANE } from "../projects/model.js";
import { ForbiddenError } from "./guard.js";

/** @typedef {import("../types.js").ProjectGuard} ProjectGuard */
/** @typedef {import("../types.js").ProjectsStore} ProjectsStore */

const MANAGER_ROLES = ["admin", "clerk"];
const AUTHOR_ROLES = ["admin", "clerk", "councillor"];

/**
 * @param {() => import("./session.js").SessionState} getState
 * @returns {ProjectGuard}
 */
export function createProjectGuard(getState) {
  /** The signed-in person, or null until sign-in is complete. */
  const who = () => {
    const { status, role, user } = getState();
    return status === "ready" && role && user
      ? { role: String(role), uid: user.uid }
      : null;
  };
  /** @param {ReturnType<typeof who>} w */
  const isManager = (w) => Boolean(w && MANAGER_ROLES.includes(w.role));
  /** @param {ReturnType<typeof who>} w */
  const isAuthor = (w) => Boolean(w && AUTHOR_ROLES.includes(w.role));
  /** @param {{ responsibleUid: string }} project */
  const isLead = (project) => {
    const w = who();
    return isAuthor(w) && w?.uid === project.responsibleUid;
  };
  /** @param {{ responsibleUid: string }} project */
  const canManage = (project) => isManager(who()) || isLead(project);
  /** @param {{ createdBy: string }} entity */
  const isOwn = (entity) => isAuthor(who()) && who()?.uid === entity.createdBy;

  return {
    canCreateProject: (parent) =>
      isManager(who()) || (parent !== undefined && isLead(parent)),
    canEditProject: (project) => canManage(project),
    canReassignProject: () => isManager(who()),
    canNameResponsible: (uid) => isManager(who()) || who()?.uid === uid,
    canDeleteProject: () => isManager(who()),
    canAddAction: () => isAuthor(who()),
    canMoveActions: (project) => canManage(project),
    canEditAction: (action, project) => isOwn(action) || canManage(project),
    canDeleteAction: (action, project) => isOwn(action) || canManage(project),
    canAddNote: () => isAuthor(who()),
    canEditNote: (note) => isManager(who()) || isOwn(note),
    canDeleteNote: (note) => isManager(who()) || isOwn(note),
  };
}

/**
 * Wrap a store so every write asks the guard first, and throws a `ForbiddenError`
 * (without touching the store) when it says no. Reads pass straight through: everyone
 * with a role may read everything.
 * @param {ProjectsStore} store
 * @param {ProjectGuard} guard
 * @returns {ProjectsStore}
 */
export function guardProjects(store, guard) {
  /** @param {string} id */
  const findProject = async (id) =>
    (await store.load()).projects.find((p) => p.id === id);
  /** @param {string} id */
  const findAction = async (id) =>
    (await store.load()).actions.find((a) => a.id === id);
  /** @param {string} id */
  const findNote = async (id) =>
    (await store.load()).notes.find((n) => n.id === id);

  return {
    load: () => store.load(),
    subscribe: (listener) => store.subscribe(listener),

    async createProject(input) {
      const parent = input.parentId
        ? await findProject(input.parentId)
        : undefined;
      if (input.parentId && !parent)
        throw new Error("That project no longer exists.");
      if (
        !guard.canCreateProject(parent) ||
        !guard.canNameResponsible(input.responsibleUid)
      )
        throw new ForbiddenError("create");
      return store.createProject(input);
    },
    async updateProject(id, patch) {
      // A missing record is left to the store, which reports it as it always has.
      const existing = await findProject(id);
      if (existing) {
        if (!guard.canEditProject(existing))
          throw new ForbiddenError("update", id);
        const reassigned =
          (patch.responsibleUid !== undefined &&
            patch.responsibleUid !== existing.responsibleUid) ||
          (patch.responsibleEmail !== undefined &&
            patch.responsibleEmail !== existing.responsibleEmail);
        if (reassigned && !guard.canReassignProject())
          throw new ForbiddenError("update", id);
      }
      return store.updateProject(id, patch);
    },
    async removeProject(id) {
      if ((await findProject(id)) && !guard.canDeleteProject())
        throw new ForbiddenError("delete", id);
      return store.removeProject(id);
    },

    async createAction(input) {
      const project = await findProject(input.projectId);
      if (!project) throw new Error("That project no longer exists.");
      if (
        !guard.canAddAction(project) ||
        (input.lane !== FIRST_LANE && !guard.canMoveActions(project))
      )
        throw new ForbiddenError("create");
      return store.createAction(input);
    },
    async updateAction(id, patch) {
      const action = await findAction(id);
      const project = action && (await findProject(action.projectId));
      if (action && project) {
        if (!guard.canEditAction(action, project))
          throw new ForbiddenError("update", id);
        const moved =
          (patch.lane !== undefined && patch.lane !== action.lane) ||
          (patch.order !== undefined && patch.order !== action.order);
        if (moved && !guard.canMoveActions(project))
          throw new ForbiddenError("update", id);
      }
      return store.updateAction(id, patch);
    },
    async removeAction(id) {
      const action = await findAction(id);
      const project = action && (await findProject(action.projectId));
      if (action && project && !guard.canDeleteAction(action, project))
        throw new ForbiddenError("delete", id);
      return store.removeAction(id);
    },

    async createNote(input) {
      if (!guard.canAddNote()) throw new ForbiddenError("create");
      return store.createNote(input);
    },
    async updateNote(id, patch) {
      const note = await findNote(id);
      if (note && !guard.canEditNote(note))
        throw new ForbiddenError("update", id);
      return store.updateNote(id, patch);
    },
    async removeNote(id) {
      const note = await findNote(id);
      if (note && !guard.canDeleteNote(note))
        throw new ForbiddenError("delete", id);
      return store.removeNote(id);
    },
  };
}
