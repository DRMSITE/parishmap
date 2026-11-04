// Fails if the packages that end up in the built site have a high or critical published
// advisory that has not been looked at and listed in ACCEPTED below.
//
//   node scripts/audit.mjs
//
// It reads `npm audit --omit=dev --json`, so development tools are not counted. `npm audit` has
// no way to ignore one advisory, which is why this wrapper exists: without it the whole check
// would have to be left off for the sake of one finding that cannot yet be fixed.

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * Advisories that have been read and accepted for now. Each needs the reason, and should be
 * removed once the package that pulls it in has a release that fixes it.
 */
export const ACCEPTED = new Map([
  [
    "GHSA-m9gg-hp2v-232j",
    "@grpc/grpc-js below 1.13.6, pinned to ~1.9.0 by @firebase/firestore, with no fixed Firebase " +
      "release yet (checked 2026-11-04). The browser build contains no gRPC code, and the offered " +
      "fix is a downgrade to firebase 9.",
  ],
]);

const BLOCKING = new Set(["high", "critical"]);

/**
 * The high or critical advisories in an `npm audit --json` report that are not accepted.
 * @param {{ vulnerabilities?: Record<string, { via: unknown[] }> }} report
 * @param {Map<string, string>} [accepted]
 * @returns {{ id: string, name: string, severity: string, title: string }[]}
 */
export function blocking(report, accepted = ACCEPTED) {
  const found = new Map();
  for (const [name, entry] of Object.entries(report.vulnerabilities ?? {})) {
    // A `via` entry that is a string only names another package; an object is an advisory.
    for (const via of entry.via) {
      if (typeof via !== "object" || via === null) continue;
      const advisory = /** @type {any} */ (via);
      if (!BLOCKING.has(advisory.severity)) continue;
      const id = String(advisory.url ?? advisory.source).split("/").pop() ?? "";
      if (accepted.has(id)) continue;
      found.set(id, {
        id,
        name,
        severity: advisory.severity,
        title: advisory.title ?? "",
      });
    }
  }
  return [...found.values()];
}

/**
 * Accepted advisories that no longer appear, so their entries can be removed.
 * @param {{ vulnerabilities?: Record<string, { via: unknown[] }> }} report
 * @param {Map<string, string>} [accepted]
 */
export function unused(report, accepted = ACCEPTED) {
  const present = new Set(
    Object.values(report.vulnerabilities ?? {}).flatMap((entry) =>
      entry.via.map((via) =>
        typeof via === "object" && via !== null
          ? String(/** @type {any} */ (via).url ?? "")
              .split("/")
              .pop()
          : "",
      ),
    ),
  );
  return [...accepted.keys()].filter((id) => !present.has(id));
}

function main() {
  // npm exits non-zero when it finds anything, so the exit status says nothing here.
  const run = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    shell: true,
  });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    console.error("Could not read the output of `npm audit`:");
    console.error(run.stdout || run.stderr);
    process.exit(1);
  }
  if (report.error) {
    console.error(`npm audit failed: ${report.error.summary ?? report.error.code}`);
    process.exit(1);
  }

  const problems = blocking(report);
  for (const id of unused(report))
    console.log(`Note: ${id} is no longer reported. Remove it from ACCEPTED.`);

  if (problems.length > 0) {
    console.error("High or critical advisories in the packages that ship with the site:");
    for (const p of problems)
      console.error(`  ${p.id} in ${p.name} (${p.severity}): ${p.title}`);
    process.exit(1);
  }
  console.log(
    `No unaccepted high or critical advisories (${ACCEPTED.size} accepted, see scripts/audit.mjs).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
