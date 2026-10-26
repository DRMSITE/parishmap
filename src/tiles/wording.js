// Words for Help and About about which map people see, worked out from the council's tile
// settings so the guide never describes a map the deployment does not use.

import { withYear } from "./attribution.js";

const NAMES = /** @type {Record<string, (clerkTitle: string) => string>} */ ({
  admin: () => "administrators",
  clerk: (clerkTitle) => `the ${clerkTitle}`,
  councillor: () => "councillors",
  member: () => "members",
});
const ORDER = ["councillor", "clerk", "admin", "member"];

/**
 * "Councillors, the Parish Clerk and administrators", for the roles given.
 * @param {string[]} roles
 * @param {string} clerkTitle
 */
export function rolesPhrase(roles, clerkTitle) {
  const names = ORDER.filter((r) => roles.includes(r)).map((r) =>
    NAMES[r](clerkTitle),
  );
  if (!names.length) return "Nobody";
  const text =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * What to say about the council's chosen map, or null if it is OpenStreetMap.
 * @param {{ basemap: string, providers: Record<string, { id: string, label: string, kind: string, attribution: string, maxZoom: number, roles?: string[] }> }} tiles
 * @param {string} clerkTitle
 */
export function describeChosenMap(tiles, clerkTitle) {
  const provider = tiles.providers[tiles.basemap];
  if (!provider || provider.id === "osm") return null;
  const everyone = provider.kind === "direct";
  const roles = everyone ? ["councillor", "clerk", "admin", "member"] : (provider.roles ?? []);
  return {
    label: provider.label,
    attribution: withYear(provider.attribution),
    who: everyone ? "Everyone" : rolesPhrase(roles, clerkTitle),
    proxied: provider.kind === "proxied",
    maxZoom: provider.maxZoom,
    memberSees: roles.includes("member"),
    councillorSees: roles.includes("councillor"),
  };
}
