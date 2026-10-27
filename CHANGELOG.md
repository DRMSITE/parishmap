# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/) once it reaches 1.0. A release that changes
`firestore.rules` says so, because the rules must be deployed with it.

## [0.1.1] - 2026-10-27

This release changes `firestore.rules`, so deploy them with it:
`firebase deploy --only firestore:rules --project <your-project-id>`. Existing data is not
affected, because the rules only check new writes.

### Security

- A councillor adding a sub-project must now use their own sign-in email as the responsible
  person's email. Before, any text was accepted.
- An action's due date must now be written `YYYY-MM-DD`. Before, any ten characters were accepted.
- Updated `body-parser` in the Cloud Functions to fix a published denial-of-service advisory.

### Added

- A test that fails if the example text `npm run check:dist` looks for goes out of step with the
  local-data example projects, so that check cannot quietly stop working.
- Continuous integration now installs the Cloud Functions' dependencies and audits them for
  high-severity advisories.

### Documentation

- The security page now says that someone's role or disabled state takes up to about an hour to
  reach the map and projects, because the database rules read it from the sign-in they already
  hold, and that an account change and its audit-log entry are separate writes.

## [0.1.0] - 2026-10-26 (first public release)

### Added

- A private, login-only map of a council's area: points, lines and areas, an optional boundary,
  a Points page as a text alternative, and place search.
- Projects, sub-projects, a five-lane actions board and notes, with a responsible councillor per
  project and links to places on the map.
- Roles (administrator, clerk, councillor, member), a People page for inviting and managing
  accounts, and an audit log, all enforced by `firestore.rules` and the `api` function.
- Sign-in with a verified email, a password and an authenticator-app second factor, required by
  the database rules.
- Map tile providers: OpenStreetMap by default; Ordnance Survey and custom providers behind a tile
  function that keeps keys in Secret Manager, checks the role, serves only the council's area and
  limits browser caching.
- Council settings in one place (`deployment/`), a set-up script (`npm run setup`), a script to
  configure sign-in (`npm run configure-auth`), and generated hosting and function settings.
- Documentation in `docs/`.

### Changed from the project it grew out of

- Web Awesome is now the free, MIT-licensed package; no account or token is needed.
- Icons are bundled rather than fetched from Font Awesome's servers.
- No council-specific name, project, boundary or data remains in the code.
- The "Add sub-project" and "Move to" buttons no longer show a dangling "to" or a missing space; screen readers still hear the full name.

### Known gaps

- The set-up has been followed once from a fresh clone on a new Firebase project, by the author, but not yet by anyone else.
- The Ordnance Survey provider, and the tile function's refusal of tiles outside the area, are covered by tests but have not been tried on a live site.
- No per-person rate limit on map tile requests.
