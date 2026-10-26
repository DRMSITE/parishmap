import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPatch,
  describeChanges,
  UPDATE_MASK,
  WANTED,
} from "../scripts/configure-auth.mjs";
import { resolveTiles } from "../src/tiles/providers.js";
import {
  boundsFromCentre,
  buildEnv,
  buildParishConfig,
  deriveCouncil,
  isProjectId,
  nextSteps,
  parseFirebaseSnippet,
  planFiles,
  storagePrefixFor,
  writePlan,
} from "../scripts/setup-lib.mjs";
import { checkParishConfig } from "../src/config.js";

/** @type {import("../scripts/setup-lib.mjs").Answers} */
const answers = {
  councilName: "Little Snoring Parish Council",
  area: "Little Snoring",
  kind: "parish",
  lat: 52.8,
  lng: 0.85,
  radiusKm: 5,
  projectId: "little-snoring-map",
  region: "europe-west2",
};

const snippet = `
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaFake",
  authDomain: "little-snoring-map.firebaseapp.com",
  projectId: "little-snoring-map",
  storageBucket: "little-snoring-map.firebasestorage.app",
  messagingSenderId: "123456",
  appId: "1:123456:web:abc"
};`;

describe("deriveCouncil", () => {
  it("takes the place and the kind from the council's name", () => {
    expect(deriveCouncil("Exampleton Parish Council")).toEqual({
      area: "Exampleton",
      kind: "parish",
    });
    expect(deriveCouncil("St  Ives   Town Council")).toEqual({
      area: "St Ives",
      kind: "town",
    });
    expect(deriveCouncil("Llanfair Community Council").kind).toBe("community");
  });

  it("leaves the kind to be asked when the name does not say", () => {
    expect(deriveCouncil("Exampleton Council")).toEqual({
      area: "Exampleton",
      kind: null,
    });
    expect(deriveCouncil("The Exampleton Meeting")).toEqual({
      area: "The Exampleton Meeting",
      kind: null,
    });
  });
});

describe("small helpers", () => {
  it("makes a storage prefix from the place", () => {
    expect(storagePrefixFor("Little Snoring")).toBe("little-snoring-map:");
    expect(storagePrefixFor("Llanfair-ym-Muallt")).toBe("llanfair-ym-muallt-map:");
    expect(storagePrefixFor("!!!")).toBe("parish-map:");
  });

  it("draws the edge of the map a set distance around the centre", () => {
    const [[s, w], [n, e]] = boundsFromCentre(52.4, 0.2, 6);
    expect(n - s).toBeCloseTo(0.108, 2);
    // Degrees of longitude are shorter than degrees of latitude this far north.
    expect(e - w).toBeGreaterThan(n - s);
    expect(s).toBeLessThan(52.4);
    expect(n).toBeGreaterThan(52.4);
  });

  it("recognises usable Firebase project ids", () => {
    expect(isProjectId("little-snoring-map")).toBe(true);
    for (const bad of ["Little", "abc", "has_underscore", "-start-hyphen", "a".repeat(31)])
      expect(isProjectId(bad), bad).toBe(false);
  });
});

describe("parseFirebaseSnippet", () => {
  it("reads the six settings from what the console shows", () => {
    expect(parseFirebaseSnippet(snippet)).toEqual({
      apiKey: "AIzaFake",
      authDomain: "little-snoring-map.firebaseapp.com",
      projectId: "little-snoring-map",
      storageBucket: "little-snoring-map.firebasestorage.app",
      messagingSenderId: "123456",
      appId: "1:123456:web:abc",
    });
  });

  it("also reads JSON, and says what is missing", () => {
    const json = JSON.stringify({
      apiKey: "k",
      authDomain: "d",
      projectId: "p",
      storageBucket: "b",
      messagingSenderId: "1",
      appId: "a",
    });
    expect(parseFirebaseSnippet(json).apiKey).toBe("k");
    expect(() => parseFirebaseSnippet('{"apiKey": "k"}')).toThrow(
      /missing authDomain, projectId/,
    );
  });
});

describe("the files it writes", () => {
  it("writes a parish.config.js that the app accepts, with the answers in it", () => {
    // The file is plain data after `export default`, so evaluate that part on its own.
    const config = new Function(
      buildParishConfig(answers).replace("export default", "return"),
    )();
    expect(() => checkParishConfig(config)).not.toThrow();
    expect(() => resolveTiles(config.tiles)).not.toThrow();
    expect(config.appName).toBe("Little Snoring Parish Map");
    expect(config.council.kind).toBe("parish");
    expect(config.storagePrefix).toBe("little-snoring-map:");
    expect(config.region).toBe("europe-west2");
    expect(config.centre).toEqual([52.8, 0.85]);
    expect(config.tiles.basemap).toBe("osm");
  });

  it("keeps a clerk's title only if it differs from the usual", () => {
    expect(buildParishConfig(answers)).not.toContain("clerkTitle");
    expect(
      buildParishConfig({ ...answers, clerkTitle: "Proper Officer" }),
    ).toContain('clerkTitle: "Proper Officer"');
  });

  it("copes with quotes in a name", async () => {
    const text = buildParishConfig({
      ...answers,
      councilName: 'St "Mary\'s" Parish Council',
      area: 'St "Mary\'s"',
    });
    expect(text).toContain('"St \\"Mary\'s\\" Parish Council"');
  });

  it("builds .env from the pasted settings, or leaves gaps for later", () => {
    const filled = buildEnv({ ...answers, firebase: parseFirebaseSnippet(snippet) });
    expect(filled).toContain("VITE_FIREBASE_API_KEY=AIzaFake");
    expect(filled).toContain("VITE_FIREBASE_APP_ID=1:123456:web:abc");
    const blank = buildEnv(answers);
    expect(blank).toContain("VITE_FIREBASE_API_KEY=\n");
    expect(blank).toContain("VITE_FIREBASE_PROJECT_ID=little-snoring-map");
    expect(blank).toContain("VITE_FIREBASE_AUTH_DOMAIN=little-snoring-map.firebaseapp.com");
  });

  it("plans exactly three files, one of them the Firebase project", () => {
    const plan = planFiles(answers);
    expect(plan.map((f) => f.path)).toEqual([
      "deployment/parish.config.js",
      ".env",
      ".firebaserc",
    ]);
    expect(JSON.parse(plan[2].content)).toEqual({
      projects: { default: "little-snoring-map" },
    });
  });

  it("writes into the folder given, and will not overwrite without --force", () => {
    const dir = mkdtempSync(join(tmpdir(), "parishmap-setup-"));
    const plan = planFiles(answers);
    expect(writePlan(plan, dir)).toHaveLength(3);
    expect(readFileSync(join(dir, ".firebaserc"), "utf8")).toContain(
      "little-snoring-map",
    );
    writeFileSync(join(dir, ".env"), "MINE=1\n");
    expect(() => writePlan(plan, dir)).toThrow(/Not overwriting .*\.env/);
    expect(readFileSync(join(dir, ".env"), "utf8")).toBe("MINE=1\n");
    expect(writePlan(plan, dir, { force: true })).toHaveLength(3);
    mkdirSync(join(dir, "deployment"), { recursive: true });
  });

  it("only asks for the web app settings if they were not given", () => {
    expect(nextSteps(answers)[0]).toMatch(/Register a web app/);
    expect(
      nextSteps({ ...answers, firebase: parseFirebaseSnippet(snippet) })[0],
    ).toMatch(/docs\/firebase-setup\.md/);
  });
});

describe("configure-auth", () => {
  it("asks for everything on a project that is not set up", () => {
    expect(describeChanges({})).toHaveLength(3);
  });

  it("asks for nothing on a project that already is", () => {
    expect(describeChanges(buildPatch({}))).toEqual([]);
  });

  it("notices each setting on its own", () => {
    const set = buildPatch({});
    expect(
      describeChanges({ ...set, client: { permissions: { disabledUserSignup: false } } }),
    ).toEqual(["turn sign-up off, so people can only be invited"]);
    expect(
      describeChanges({
        ...set,
        signIn: { email: { enabled: true, passwordRequired: false } },
      }),
    ).toEqual(["require a password (not just an emailed link)"]);
    expect(describeChanges({ ...set, mfa: { state: "DISABLED" } })).toEqual([
      "make the authenticator-app (TOTP) second factor available",
    ]);
  });

  it("keeps a stricter setting and an existing interval rather than weakening them", () => {
    const patch = buildPatch({
      mfa: {
        state: "MANDATORY",
        providerConfigs: [
          { state: "MANDATORY", totpProviderConfig: { adjacentIntervals: 3 } },
        ],
      },
    });
    expect(patch.mfa.state).toBe("MANDATORY");
    expect(patch.mfa.providerConfigs[0]).toEqual({
      state: "MANDATORY",
      totpProviderConfig: { adjacentIntervals: 3 },
    });
  });

  it("changes only the parts it names, and never turns sign-up back on", () => {
    expect(UPDATE_MASK.split(",")).toEqual([
      "signIn.email",
      "client.permissions.disabledUserSignup",
      "mfa",
    ]);
    expect(WANTED.client.permissions.disabledUserSignup).toBe(true);
  });
});
