# Contributing to ParishMap

Thank you for thinking of it. ParishMap is small, and I would like it to stay that way: a private, accessible map and project planner that a parish, town or community council can run itself. Contributions that fit that are welcome, from bug reports to documentation to code, and the smaller ones are often the most useful.

Please read the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately
([SECURITY.md](SECURITY.md)), not as public issues, since a public report tells everyone about a hole before anyone has had the chance to close it.

## Before you start

- **Bugs and ideas:** open an issue first for anything bigger than a small fix, so that we can agree it fits before you spend time on it. A week's work that does not fit helps nobody.
- **Documentation fixes** are very welcome, especially where the set-up steps did not work for you. That is a bug in the documentation, and nobody can find it more reliably than someone who has just followed it.
- The project is for councils, not for developers, so prefer plain wording and the smallest change that solves the problem. Please do not add a framework or a dependency without a clear benefit, because every dependency is something a volunteer has to keep up to date.

## Setting up

You need Node 24.12 or later.

```bash
git clone https://github.com/DRMSITE/parishmap.git
cd parishmap
npm install
npx playwright install chromium    # once, for the browser tests
npm run dev                        # see below
```

`npm run dev` needs Firebase settings in `.env`. To work on the interface without a Firebase project, run it with `VITE_LOCAL_DATA=true` (PowerShell: `$env:VITE_LOCAL_DATA="true"; npm run dev`), which gives you no sign-in and example data in your browser. Never deploy that build.

Read [docs/architecture.md](docs/architecture.md) and [AGENTS.md](AGENTS.md) first. The second was written for AI coding assistants, though it is also the most complete list of the project's rules, and people have been known to read it too.

## Checks

Run these before opening a pull request, and say which you ran:

```bash
npm run typecheck && npm run lint && npm test
npm run test:e2e        # anything visible
npm run test:rules      # anything touching firestore.rules or the Firestore code (needs Java and the Firebase CLI)
```

Pull requests are checked by the same commands on GitHub.

- **Add or update a test** when behaviour changes, and test what the software does rather than how it does it, so that a tidy-up does not break the suite.
- **Accessibility is a requirement** (WCAG 2.2 AA), not a finishing touch: keyboard use, visible focus, labelled controls, no colour-only meaning and reduced motion respected.
- **Security changes** (rules, roles, the functions, the Content Security Policy) need tests, and must keep the rules, the guards and the documentation in step, because the rules are the real boundary and the guards only mirror them.
- Use **UK English** in text, comments and documentation. Formatting is Biome (2 spaces, double quotes), and `npm run format` applies it.

## Pull requests

- Keep each pull request to one concern, with a short description of what changed and why, so that a reviewer can say yes or no in one sitting.
- Update the documentation and [CHANGELOG.md](CHANGELOG.md) when behaviour changes.
- Do not commit anything particular to one council (`deployment/`, `.env`, a boundary, people). `deployment.example/` is the only council data in the repository, and it is made up.

## Sign off your commits (Developer Certificate of Origin)

By contributing you confirm that you have the right to, under the project's licence
(AGPL-3.0-or-later). Add a sign-off to each commit with `git commit -s`, which adds a line:

```
Signed-off-by: Your Name <you@example.org>
```

That line means you agree to the Developer Certificate of Origin 1.1:

> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I have the right to submit it
> under the open source license indicated in the file; or
>
> (b) The contribution is based upon previous work that, to the best of my knowledge, is covered
> under an appropriate open source license and I have the right under that license to submit that
> work with modifications, whether created in whole or in part by me, under the same open source
> license (unless I am permitted to submit under a different license), as indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person who certified (a), (b) or
> (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are public and that a record of
> the contribution (including all personal information I submit with it, including my sign-off) is
> maintained indefinitely and may be redistributed consistent with this project or the open source
> license(s) involved.

(Developer Certificate of Origin, version 1.1. Copyright 2004, 2006 The Linux Foundation and its
contributors.) A check on each pull request looks for the sign-off.
