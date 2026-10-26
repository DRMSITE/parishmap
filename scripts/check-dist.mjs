// Run after `npm run build` (and before a hosting deploy): looks through the built files for
// things that must never be there.
//
//   - a proxied provider's upstream address or secret name: the browser only ever talks to
//     our own tile function, so neither has a reason to be in the bundle;
//   - the local-data start-up, which skips sign-in and must never be deployed.
//
// It exits with a non-zero status and says what it found, so it can sit in a deploy script
// or CI. It cannot prove a bundle is safe, but it catches the mistakes that matter most.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { resolveTiles } from "../src/tiles/providers.js";
import { deploymentDir } from "./deployment-dir.mjs";

const dist = resolve(import.meta.dirname, "..", process.argv[2] ?? "dist");

/** @param {string} dir @returns {string[]} */
function filesIn(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesIn(path) : [path];
  });
}

const { default: parish } = await import(
  pathToFileURL(resolve(deploymentDir, "parish.config.js")).href
);
const { providers } = resolveTiles(parish.tiles);

/** @type {{ needle: string, why: string }[]} */
const forbidden = [];
for (const p of Object.values(providers)) {
  if (p.kind !== "proxied") continue;
  forbidden.push({
    needle: String(p.secret),
    why: `the secret name of "${p.id}"`,
  });
  forbidden.push({
    needle: new URL(String(p.upstream).replace(/\{[a-z]+\}/g, "x")).host,
    why: `the upstream host of "${p.id}"`,
  });
}
// The local-data build has example people and projects built in (src/data/local-*.js).
// Minified code has no readable names, so look for that example text instead.
forbidden.push(
  { needle: "Village green refresh", why: "the local-data example projects" },
  { needle: "me@example.org", why: "the local-data example person" },
);

let found = 0;
for (const file of filesIn(dist)) {
  if (!/\.(js|css|html|json|map|svg)$/.test(file)) continue;
  const text = readFileSync(file, "utf8");
  for (const { needle, why } of forbidden) {
    if (text.includes(needle)) {
      console.error(`${file.slice(dist.length + 1)} contains ${why} (${needle}).`);
      found++;
    }
  }
}

if (found) {
  console.error(
    `\n${found} problem(s). A normal build must not contain these: rebuild with \`npm run build\` (not after an e2e run).`,
  );
  process.exit(1);
}
console.log(`Checked ${dist}: nothing that should not be there.`);
