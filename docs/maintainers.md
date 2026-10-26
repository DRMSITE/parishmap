# For the maintainers

Some of the work on this project lives on GitHub rather than in the code, where no test will
notice if it is forgotten. Do these once, when the repository is created, and tick them off.

## Repository settings (DRMSITE/parishmap)

- **Description:** "A private map and project planner for parish, town and community councils.
  Firebase, Leaflet, free and open source."
- **Website:** the project's documentation or <https://drmsite.com>.
- **Topics:** `parish-council`, `local-government`, `leaflet`, `firebase`, `kanban`, `gis`,
  `accessibility`, `open-source`, `agpl`.
- **Social preview:** upload `docs/social-preview.png` (Settings, General, Social preview).
  Regenerate it with `node scripts/social-preview.mjs` after editing `docs/social-preview.html`.
- **Security:** switch on private vulnerability reporting, secret scanning, push protection and
  Dependabot alerts (Settings, Code security). `SECURITY.md` points people to private reporting.
- **Discussions:** switch on, for questions that are not bugs.
- **Branch protection on `main`:** require the CI checks (`checks`, `e2e`, `rules`), CodeQL and
  the sign-off check, and a review. CodeQL only runs once the repository is public (code scanning
  is free for public repositories and paid for private ones), so it shows as skipped until then.
- **Licence:** GitHub should detect AGPL-3.0 from `LICENSE`.

## Before each release

1. `npm run typecheck && npm run lint && npm test && npm run test:e2e && npm run test:rules`
2. `npm run licences:check` (regenerate with `npm run licences` if a dependency changed)
3. `npm run build && npm run check:dist`
4. Update `CHANGELOG.md`, and say if `firestore.rules` changed.
5. Tag it (`v0.1.0`) and publish release notes taken from the changelog.

## Before the first public release

- Fill in the contact method in `CODE_OF_CONDUCT.md`.
- Confirm the company details to show (company number, registered office) in `NOTICE`, if wanted.
- Follow the documentation from a blank machine and a throwaway Firebase project, and fix every
  place where it did not match.
- Scan the tree for secrets and anything particular to one council.

## README screenshots

`node scripts/screenshots.mjs` rebuilds `docs/screenshots/` from the local-data build and a
made-up council on open moorland, so that no real data or village names appear. Run it again after a
visual change, and look at the images before committing them, because a screenshot is the easiest
place for something private to slip through. It fetches OpenStreetMap tiles, so run it sparingly.

## The DRMSITE organisation profile

Someone who finds DRMSITE on GitHub should be able to find this project from it. A short
organisation README does that: create a public repository called `.github` in the DRMSITE
organisation, with `profile/README.md`, for example:

```markdown
## DRMSITE LTD

Websites and software for small organisations.

- **[ParishMap](https://github.com/DRMSITE/parishmap)**: a private map and project planner for
  parish, town and community councils. Free and open source.

[drmsite.com](https://drmsite.com)
```

## The credit

`NOTICE` asks that the "Built by DRMSITE LTD" credit stays on the About page and in the navigation
footer (`src/views/about.view.js` and `index.html`). I kept it small on purpose, and it is not a
setting, since a credit that any council could switch off with one line would hardly be a credit.
A council's own name, colours and wording lead everywhere else. The one thing a council may change
is where the source is offered from (`sourceUrl`), because the AGPL requires people who use a
modified version over a network to be able to get that version's source.

Whether that request can be enforced as a term of the licence (AGPL section 7(b)) is a legal
question that I cannot answer. Ask a solicitor before relying on it.
