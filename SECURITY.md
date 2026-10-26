# Security policy

## Reporting a vulnerability

Please **do not** open a public issue or pull request for a security problem. A public report tells everyone about a weakness before anyone has had the chance to close it, and the people running this software are councils with small budgets and no security team.

Use GitHub's private reporting: on the repository, choose **Security**, then **Report a
vulnerability**. Include what you found, how to reproduce it, and what it could allow. If you cannot use that, contact DRMSITE LTD through [drmsite.com](https://drmsite.com) and ask for a private way to send the details.

You can expect an acknowledgement within a few working days. This is a small project maintained by a small company, so I cannot promise a fix by a particular date, but I will tell you what I decide and credit you if you wish.

## What counts

Especially welcome are ways around `firestore.rules`, the people API or the tile function: reading or changing what a role should not, reaching a tile provider's key, using the tile function as an open proxy, or signing in without the second factor. Cross-site scripting counts, as does anything that leaks data to a third party.

Some things are not vulnerabilities in ParishMap, though they may still matter to you: weaknesses in a council's own Firebase or Google account set-up, an administrator misusing their own access, and the behaviour of Google or a map provider.

## Supported versions

Only the latest release receives security fixes while the project is at version 0.x. There are too few people working on it to look after older ones as well.

## If you run ParishMap

Read [docs/security.md](docs/security.md), keep your dependencies and deployment up to date ([docs/deploying-and-upgrading.md](docs/deploying-and-upgrading.md)), and turn on GitHub's secret scanning and push protection for your fork. A fix I publish protects nobody who has not installed it.
