// A stand-in for the `api` function, for the local, sign-in-free start-up (development
// and the end-to-end tests only). It keeps people in memory and, like the real function,
// refuses a change to your own account. The permission rules themselves are tested
// against the real handler (test/people-handler.test.js), not here.

/** @typedef {import("../types.js").Person} Person */

/** @param {string} uid @param {string} role @param {Partial<Person>} [more] @returns {Person} */
const person = (uid, role, more = {}) => ({
  uid,
  email: `${uid}@example.org`,
  role,
  disabled: false,
  emailVerified: true,
  authenticators: 1,
  lastSignIn: "2026-10-01T09:00:00.000Z",
  ...more,
});

/**
 * Who the real `directory` action would return: enabled admins, clerks and councillors.
 * @param {Person[]} people
 * @returns {import("../types.js").DirectoryPerson[]}
 */
export function localDirectory(people) {
  return people
    .filter(
      (p) =>
        !p.disabled && ["admin", "clerk", "councillor"].includes(p.role ?? ""),
    )
    .map((p) => ({ uid: p.uid, email: p.email }));
}

/** @returns {import("../types.js").PeopleAccess} */
export function createLocalPeople() {
  /** @type {Person[]} */
  let people = [
    person("me", "admin"),
    person("clerk", "clerk"),
    person("alex", "councillor"),
    person("sam", "member", {
      authenticators: 0,
      emailVerified: false,
      lastSignIn: null,
    }),
  ];

  /** @param {string} uid */
  const find = (uid) => {
    const found = people.find((p) => p.uid === uid);
    if (!found) throw new Error("That person no longer exists.");
    if (uid === "me") throw new Error("You cannot change your own account.");
    return found;
  };

  return {
    available: () => true,
    role: () => "admin",
    uid: () => "me",
    sendInvitation: async () => {},
    api: {
      list: async () => people.map((p) => ({ ...p })),
      directory: async () => localDirectory(people),
      async invite(email, role) {
        if (people.some((p) => p.email === email.toLowerCase()))
          throw new Error(
            "Someone with that email address already has an account.",
          );
        const made = person(email.toLowerCase().split("@")[0], role, {
          email: email.toLowerCase(),
          authenticators: 0,
          emailVerified: false,
          lastSignIn: null,
        });
        people = [...people, made];
        return made;
      },
      async setRole(uid, role) {
        find(uid).role = role;
      },
      async setDisabled(uid, disabled) {
        find(uid).disabled = disabled;
      },
      async resetAuthenticators(uid) {
        find(uid).authenticators = 0;
      },
    },
  };
}
