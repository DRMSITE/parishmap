// What to tell a person when a projects change fails.

import { ForbiddenError } from "../auth/guard.js";

/**
 * The stores throw sentences meant for people (a refused field, "You do not have
 * permission to do that."), so those are shown as they are. The guard's own error is
 * worded for developers, so it is replaced.
 * @param {unknown} error
 * @param {string} fallback Shown when there is nothing better to say.
 * @returns {string}
 */
export function readableError(error, fallback) {
  if (error instanceof ForbiddenError)
    return "You do not have permission to do that.";
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
