# Security

A council's private map holds names, email addresses and plans that are not yet public, and the people using it will be volunteers on their own phones and laptops, not security staff. ParishMap is meant for a small, private group, and the design assumes the browser is hostile and puts every real decision on the server side (Firestore rules and Cloud Functions). This page says what is protected, how, and what is not.

## How it is protected

Each point below states a rule, and the reason for it follows directly.

- **Nothing is public.** All pages and data need sign-in, which means there is no public side to attack. Sign-up is switched off: accounts are created by an administrator or the Clerk, and the person sets their own password from an emailed link.
- **Everyone uses a second factor.** That means a verified email, a password and a code from an authenticator app (TOTP). Firebase has no "require this" switch, so the app forces enrolment and `firestore.rules` refuses any request whose token lacks the second factor.
- **Roles are held on the server.** A role is a custom claim set only by the Admin SDK (the `api` function or `scripts/set-role.mjs`), never by browser code, because anything the browser can set a user can set. The rules read it on every request.
- **The rules are the boundary.** `firestore.rules` validates every field, ownership and role, and records who changed what and when. The guards in `src/auth/` mirror the rules only to hide buttons, so they are a courtesy to the user rather than a protection. `npm run test:rules` checks the rules against the Firestore emulator.
- **Accounts are managed by a function, not the browser.** The `api` function decides who may invite or change whom, checks the token (including revocation) on each call, and writes an audit log that only administrators can read and nobody can write from a browser.
- **Map keys stay on the server.** A provider's key lives in Secret Manager and is added by the tile function, so the upstream address and the key's name are not in the site. The function is not an open proxy, serves only your area, and checks the role on every tile. See [tile-providers.md](tile-providers.md).
- **The browser policy is strict.** A Content Security Policy allows only what the app uses, with HSTS, no framing, no sniffing and a restricted referrer. `e2e/csp.spec.js` fails if a screen loads anything the policy would block.
- **No record content is put into HTML** except through escaping or DOM nodes, because a note written by one councillor must never run as code in another's browser.
- **No third parties supply icons or fonts.** Icons are bundled, so the site does not tell a third party who opened it. OpenStreetMap (or your chosen tile provider) does see the visitor's IP address and the area viewed, however, and the About page says so.

## What it does not protect against

Some risks cannot be removed by software, and it is better to know them before the first invitation goes out than after.

- **Someone with a valid account doing something they are allowed to.** A councillor can see what councillors can see, and can copy it. The audit log covers account changes, not every map or project edit (those carry the author and last-changed time).
- **A stolen phone or compromised authenticator.** An administrator or the Clerk can reset a person's authenticator and sign them out everywhere, though they must do so promptly for that to help.
- **A compromised administrator or Google account.** Protect those accounts, keep at least two administrators, and use a strong password and a second factor on the Google account that owns the Firebase project. The rules cannot defend a project from the person who owns it.
- **Denial of service and cost abuse.** There is a cap on function instances and you should set a budget alert, but there is no per-person rate limit.
- **Bad data in a backup.** Deleted data stays in backups until they expire.
- **Everything in `.env`, `parish.config.js` and the built site is public.** They contain no secrets by design, so treat anything else you put there as published.

## Keys and secrets

A leaked key is usually leaked by accident, in a commit or a screenshot, so the habits below are mostly about avoiding that moment.

- Never commit a key, a password or a token. `.env` and `deployment/` are git-ignored.
- Set tile-provider keys only with `firebase functions:secrets:set`, so that they live in Secret Manager and nowhere in the repository.
- Scripts that use the Admin SDK use your own Application Default Credentials. No service-account key file is needed or wanted, since a file on disk is a file that can be copied.
- If a key appears in a chat, a screenshot or a commit, rotate it.

## Before you share the address

A gap is easier to close before other people start relying on the site, so it is worth working through every item below first.

1. Rules deployed (`firebase deploy --only firestore:rules`) and tested.
2. Sign-up off and the authenticator second factor available (`npm run configure-auth`).
3. At least two administrators, each with an authenticator.
4. The browser API key restricted by referrer.
5. A budget alert, and backups switched on ([backups.md](backups.md)).
6. `npm run check:dist` clean on the build you deploy.

## Reporting a problem

Please do not open a public issue for a security problem, since that would tell everyone before it could be fixed. See [SECURITY.md](../SECURITY.md).
