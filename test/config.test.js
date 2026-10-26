import { describe, expect, it } from "vitest";
import example from "../deployment.example/parish.config.js";
import { checkParishConfig, config } from "../src/config.js";
import { readFirebaseConfig } from "../src/firebase/config.js";

const valid = () => structuredClone(example);

describe("checkParishConfig", () => {
  it("accepts the example deployment", () => {
    expect(() => checkParishConfig(example)).not.toThrow();
  });

  it("works out the clerk's title from the kind of council", () => {
    const town = valid();
    town.council.kind = "town";
    expect(checkParishConfig(town).council.clerkTitle).toBe("Town Clerk");
    town.council.clerkTitle = "Proper Officer";
    expect(checkParishConfig(town).council.clerkTitle).toBe("Proper Officer");
  });

  it("reports every problem at once", () => {
    const bad = valid();
    bad.appName = "";
    // @ts-expect-error deliberately wrong
    bad.council.kind = "city";
    bad.centre = [91, 0];
    expect(() => checkParishConfig(bad)).toThrow(
      /appName[\s\S]*council\.kind[\s\S]*centre/,
    );
  });

  it("refuses bounds the wrong way round, and a centre outside them", () => {
    const flipped = valid();
    flipped.bounds = [flipped.bounds[1], flipped.bounds[0]];
    expect(() => checkParishConfig(flipped)).toThrow(/south-west/);

    const outside = valid();
    outside.centre = [10, 10];
    expect(() => checkParishConfig(outside)).toThrow(/centre must be inside bounds/);
  });

  it("takes a source link only if it is an https address", () => {
    const withLink = valid();
    withLink.sourceUrl = "https://example.org/our-fork";
    expect(() => checkParishConfig(withLink)).not.toThrow();
    withLink.sourceUrl = "http://example.org/our-fork";
    expect(() => checkParishConfig(withLink)).toThrow(/sourceUrl/);
    withLink.sourceUrl = "not a link";
    expect(() => checkParishConfig(withLink)).toThrow(/sourceUrl/);
  });

  it("refuses something that is not an object", () => {
    expect(() => checkParishConfig(undefined)).toThrow(/not usable/);
  });
});

describe("the loaded config", () => {
  it("offers the public source unless the council points elsewhere", () => {
    expect(config.sourceUrl).toBe("https://github.com/DRMSITE/parishmap");
  });

  it("builds the wording the screens use", () => {
    expect(config.council.councillors).toBe("Exampleton Parish Councillors");
    expect(config.council.body).toBe("Parish Council");
    expect(config.council.clerkTitle).toBe("Parish Clerk");
  });
});

describe("readFirebaseConfig", () => {
  const values = {
    VITE_FIREBASE_API_KEY: "k",
    VITE_FIREBASE_AUTH_DOMAIN: "p.firebaseapp.com",
    VITE_FIREBASE_PROJECT_ID: "p",
    VITE_FIREBASE_STORAGE_BUCKET: "p.firebasestorage.app",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "1",
    VITE_FIREBASE_APP_ID: "1:1:web:a",
  };

  it("maps the variables to the SDK's names", () => {
    expect(readFirebaseConfig(values)).toMatchObject({
      apiKey: "k",
      projectId: "p",
      authDomain: "p.firebaseapp.com",
    });
  });

  it("names every missing variable", () => {
    expect(() =>
      readFirebaseConfig({ VITE_FIREBASE_PROJECT_ID: "p" }),
    ).toThrow(/VITE_FIREBASE_API_KEY.*VITE_FIREBASE_APP_ID/s);
  });
});
