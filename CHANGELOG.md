# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/) once it reaches 1.0. A release that changes
`firestore.rules` says so, because the rules must be deployed with it.

## [Unreleased] (0.1.0, first public release)

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

### Known gaps

- The set-up has not yet been followed from a blank machine by someone other than the author.
- `npm run configure-auth` has not been run against a brand-new Firebase project.
- No per-person rate limit on map tile requests.
