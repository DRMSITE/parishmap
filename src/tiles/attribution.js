// Kept apart from providers.js so that the browser can use it without bundling the
// provider definitions (which include server-only addresses).

/**
 * Puts this year into an attribution that asks for it ("{year}").
 * @param {string} attribution
 * @param {number} [year]
 */
export const withYear = (attribution, year = new Date().getFullYear()) =>
  attribution.replaceAll("{year}", String(year));
