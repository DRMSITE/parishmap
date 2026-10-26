// `npm run setup`: asks a few questions about your council and writes the files that are
// particular to it (deployment/parish.config.js, .env and .firebaserc). It changes nothing
// in Firebase and never overwrites a file that already exists unless you say --force.
//
//   npm run setup                      ask the questions
//   npm run setup -- --force           replace files from an earlier run
//   npm run setup -- --answers a.json --yes   no questions (for scripts and tests)
//
// The answers file is JSON: councilName, lat, lng, projectId, and optionally area, kind,
// clerkTitle, radiusKm, region and firebase (the pasted web app settings as text).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  boundsFromCentre,
  deriveCouncil,
  isKind,
  isProjectId,
  nextSteps,
  parseFirebaseSnippet,
  planFiles,
  writePlan,
} from "./setup-lib.mjs";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const force = args.includes("--force");
const yes = args.includes("--yes");
const answersFile = args.includes("--answers")
  ? args[args.indexOf("--answers") + 1]
  : undefined;

/** @param {string} message */
function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

// One reader for every question, so answers piped in (or typed ahead) are not lost.
const rl = createInterface({ input: process.stdin });
const reader = rl[Symbol.asyncIterator]();

/** @param {string} question */
async function line(question) {
  process.stdout.write(question);
  const next = await reader.next();
  if (next.done) {
    console.log("");
    fail("The answers ran out before the questions did. Nothing written.");
  }
  return next.value;
}

/** @returns {Promise<import("./setup-lib.mjs").Answers>} */
async function ask() {
  /**
   * @param {string} question
   * @param {{ fallback?: string, check?: (v: string) => string | null }} [o]
   */
  async function prompt(question, { fallback, check } = {}) {
    for (;;) {
      const raw = (
        await line(`${question}${fallback ? ` [${fallback}]` : ""} `)
      ).trim();
      const value = raw || fallback || "";
      const problem = check ? check(value) : value ? null : "Please type something.";
      if (!problem) return value;
      console.log(`  ${problem}`);
    }
  }

  console.log("\nParishMap set-up. Press Enter to accept a suggestion in [brackets].\n");
  const councilName = await prompt("Council name (e.g. Exampleton Parish Council):");
  const guess = deriveCouncil(councilName);
  const area = await prompt("The place, as it appears in sentences:", {
    fallback: guess.area,
  });
  const kind = await prompt("Kind of council (parish, town or community):", {
    fallback: guess.kind ?? "parish",
    check: (v) => (isKind(v) ? null : "Type parish, town or community."),
  });
  const clerkTitle = await prompt("Title of your clerk:", {
    fallback: `${kind[0].toUpperCase()}${kind.slice(1)} Clerk`,
  });
  console.log(
    "\nWhere should the map open? Find the centre of your area in any map (right-click, copy the coordinates).",
  );
  const latLng = await prompt("Centre as latitude, longitude (e.g. 52.3947, 0.2109):", {
    check: (v) => {
      const m = /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/.exec(v);
      if (!m) return "Two numbers, like 52.3947, 0.2109.";
      return Math.abs(Number(m[1])) <= 90 && Math.abs(Number(m[2])) <= 180
        ? null
        : "That is not a place on Earth.";
    },
  });
  const [lat, lng] = latLng.split(/[, ]+/).map(Number);
  const radiusKm = Number(
    await prompt("How far from the centre should the map reach, in km?", {
      fallback: "6",
      check: (v) => (Number(v) > 0 && Number(v) <= 50 ? null : "A number from 1 to 50."),
    }),
  );
  const projectId = await prompt("Firebase project id (from the console):", {
    check: (v) =>
      isProjectId(v) ? null : "6 to 30 characters: lower case letters, digits and hyphens.",
  });
  const region = await prompt(
    "Where should the Cloud Functions run (europe-west2 is London; fixed once deployed)?",
    {
      fallback: "europe-west2",
      check: (v) => (/^[a-z]+-[a-z]+\d+$/.test(v) ? null : 'Like "europe-west2".'),
    },
  );

  console.log(
    "\nIf you have already registered a web app in Firebase, paste its settings (the whole snippet),",
  );
  console.log("then press Enter on an empty line. To do this later, just press Enter.");
  /** @type {string[]} */
  const lines = [];
  for (;;) {
    const text = await line("");
    if (!text.trim()) break;
    lines.push(text);
  }

  /** @type {Record<string, string> | undefined} */
  let firebase;
  if (lines.length) {
    try {
      firebase = parseFirebaseSnippet(lines.join("\n"));
      if (firebase.projectId !== projectId)
        fail(
          `Those settings are for "${firebase.projectId}", not "${projectId}". Check you copied the right project.`,
        );
    } catch (error) {
      console.log(`  ${/** @type {Error} */ (error).message} Carrying on without them.`);
    }
  }
  return {
    councilName,
    area,
    kind: /** @type {"parish" | "town" | "community"} */ (kind),
    clerkTitle: clerkTitle === `${kind[0].toUpperCase()}${kind.slice(1)} Clerk` ? undefined : clerkTitle,
    lat,
    lng,
    radiusKm,
    projectId,
    region,
    firebase,
  };
}

/** @returns {import("./setup-lib.mjs").Answers} */
function fromFile(/** @type {string} */ file) {
  const a = JSON.parse(readFileSync(resolve(file), "utf8"));
  const guess = deriveCouncil(String(a.councilName ?? ""));
  const answers = {
    area: guess.area,
    kind: guess.kind ?? "parish",
    radiusKm: 6,
    region: "europe-west2",
    ...a,
  };
  if (!isKind(answers.kind)) fail('"kind" must be parish, town or community.');
  if (!isProjectId(String(answers.projectId))) fail('"projectId" is not a usable Firebase project id.');
  if (![answers.lat, answers.lng].every(Number.isFinite)) fail('"lat" and "lng" must be numbers.');
  if (typeof a.firebase === "string") answers.firebase = parseFirebaseSnippet(a.firebase);
  return answers;
}

const answers = answersFile ? fromFile(answersFile) : await ask();
const plan = planFiles(answers);
const [[s, w], [n, e]] = boundsFromCentre(answers.lat, answers.lng, answers.radiusKm);

console.log("\nThis will write:");
for (const f of plan) console.log(`  ${f.path}`);
console.log(`The map will cover latitudes ${s} to ${n} and longitudes ${w} to ${e}.`);

if (!yes) {
  const reply = (await line("Write them? (y/n) ")).trim().toLowerCase();
  if (reply !== "y" && reply !== "yes") fail("Nothing written.");
}
rl.close();

try {
  writePlan(plan, root, { force });
} catch (error) {
  fail(/** @type {Error} */ (error).message);
}
console.log("\nWritten. Next:");
nextSteps(answers).forEach((step, i) => console.log(`  ${i + 1}. ${step}`));
console.log("");
