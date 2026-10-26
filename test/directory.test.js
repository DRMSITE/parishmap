import { describe, expect, it, vi } from "vitest";
import { cacheDirectory } from "../src/auth/people.js";
import { localDirectory } from "../src/data/local-people.js";

const people = [{ uid: "u1", email: "u1@example.org" }];

describe("the cached directory", () => {
  it("asks once within the time allowed, and again after it", async () => {
    let time = 0;
    const fetchDirectory = vi.fn(async () => people);
    const directory = cacheDirectory(fetchDirectory, 1000, () => time);

    expect(await directory()).toEqual(people);
    time = 999;
    await directory();
    expect(fetchDirectory).toHaveBeenCalledTimes(1);

    time = 1000;
    await directory();
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });

  it("does not remember a failure", async () => {
    const fetchDirectory = vi
      .fn()
      .mockRejectedValueOnce(new Error("You are not allowed."))
      .mockResolvedValueOnce(people);
    const directory = cacheDirectory(fetchDirectory);

    await expect(directory()).rejects.toThrow("You are not allowed.");
    expect(await directory()).toEqual(people);
    expect(fetchDirectory).toHaveBeenCalledTimes(2);
  });
});

describe("the local directory", () => {
  it("lists enabled admins, clerks and councillors by id and email only", () => {
    const person = (
      /** @type {string} */ uid,
      /** @type {string | null} */ role,
      /** @type {boolean} */ disabled = false,
    ) => ({
      uid,
      email: `${uid}@example.org`,
      role,
      disabled,
      emailVerified: true,
      authenticators: 1,
      lastSignIn: null,
    });
    expect(
      localDirectory([
        person("a", "admin"),
        person("c", "clerk"),
        person("n", "councillor"),
        person("m", "member"),
        person("x", null),
        person("off", "councillor", true),
      ]),
    ).toEqual([
      { uid: "a", email: "a@example.org" },
      { uid: "c", email: "c@example.org" },
      { uid: "n", email: "n@example.org" },
    ]);
  });
});
