import { describe, expect, it } from "vitest";
import { blocking, unused } from "../scripts/audit.mjs";

/**
 * @param {string} id
 * @param {string} severity
 */
const advisory = (id, severity) => ({
  source: 1,
  title: `Problem ${id}`,
  url: `https://github.com/advisories/${id}`,
  severity,
});

/** A report shaped like `npm audit --json`: a package, and the packages that depend on it. */
/** @param {...ReturnType<typeof advisory>} advisories */
const report = (...advisories) => ({
  vulnerabilities: {
    "some-package": { via: advisories },
    "depends-on-it": { via: ["some-package"] },
  },
});

describe("blocking", () => {
  it("reports a high or critical advisory", () => {
    const found = blocking(
      report(advisory("GHSA-aaaa", "high"), advisory("GHSA-bbbb", "critical")),
      new Map(),
    );
    expect(found.map((f) => f.id)).toEqual(["GHSA-aaaa", "GHSA-bbbb"]);
  });

  it("ignores low and moderate advisories", () => {
    const found = blocking(
      report(advisory("GHSA-aaaa", "low"), advisory("GHSA-bbbb", "moderate")),
      new Map(),
    );
    expect(found).toEqual([]);
  });

  it("does not count a package that only names another package", () => {
    expect(blocking(report(), new Map())).toEqual([]);
  });

  it("skips an advisory that has been accepted, and still reports the others", () => {
    const accepted = new Map([["GHSA-aaaa", "read it"]]);
    const found = blocking(
      report(advisory("GHSA-aaaa", "high"), advisory("GHSA-bbbb", "high")),
      accepted,
    );
    expect(found.map((f) => f.id)).toEqual(["GHSA-bbbb"]);
  });

  it("reports an advisory once however many packages carry it", () => {
    const shared = advisory("GHSA-aaaa", "high");
    const found = blocking(
      {
        vulnerabilities: {
          one: { via: [shared] },
          two: { via: [shared] },
        },
      },
      new Map(),
    );
    expect(found).toHaveLength(1);
  });

  it("copes with a report that lists nothing", () => {
    expect(blocking({}, new Map())).toEqual([]);
  });
});

describe("unused", () => {
  it("lists accepted advisories that are no longer reported", () => {
    const accepted = new Map([
      ["GHSA-aaaa", "still there"],
      ["GHSA-gone", "fixed"],
    ]);
    expect(unused(report(advisory("GHSA-aaaa", "high")), accepted)).toEqual([
      "GHSA-gone",
    ]);
  });
});
