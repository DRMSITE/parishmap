# Setting up Firebase

A council that wants to keep its own data has to put it somewhere, and for ParishMap that somewhere is your own Firebase project, which means the data, the keys and the bills are all yours. That is a fair trade, though it does mean a little work at the start.
Allow an hour. You need a Google account, the project's code on your computer
(`npm install`), and Node 24.12 or later.

Work through steps 1 to 3 first, and then run `npm run setup`, because it needs the project id from step 1. It asks about your council and writes `deployment/parish.config.js`, `.env` and `.firebaserc`, and it will read the web app's settings from step 5 if you paste them in, though you can leave that for later. It changes nothing in Firebase, so it is safe to run more than once while you decide your answers.

## 1. Create the project

Everything else hangs from the project, so it comes first. In the [Firebase console](https://console.firebase.google.com/), choose **Add project**. The *project id*
(shown under the name) cannot be changed later, which is worth a moment's thought before you accept the suggestion. Google Analytics is not needed, and I would leave it off. The console may also offer to switch on Gemini in Firebase, an AI assistant for the console itself. ParishMap does not use it, so I would skip that as well.

## 2. Choose the billing plan

Some of what ParishMap relies on is not free at any size. It uses Cloud Functions (the tile and people functions), Secret Manager and Identity
Platform (for the authenticator-app second factor), and all of them need the pay-as-you-go **Blaze** plan. For
a council this size the cost is normally pennies, but a bill that depends on use can in principle grow, and nobody will tell you when it does unless you ask Google to:

- I would set a **budget alert** (Billing, Budgets & alerts) before anything else, for example at £5 a
  month with alerts at 50%, 90% and 100%, because the alert is the only warning you will get.
- An alert is not a cap, and it will not stop anything running. The tile function limits how many instances run at once, which is the real
  brake on cost.

## 3. Choose where the data lives (permanent)

The database has to live in a particular place, and Google will not move it once it is made. In **Firestore Database**, choose **Create database**. The location **cannot be changed later**, so it is the one decision in this guide that deserves a second look. For a UK
council, `europe-west2` (London) keeps data in the UK. Choose **Standard edition**, and start in
**production mode** (the rules in this repository are deployed in step 7). The last page of the wizard offers scheduled backups, with a weekly one ticked and kept for 98 days. That is longer than the 8 weeks the privacy notice in [data-protection.md](data-protection.md) assumes, so I would untick it and set the schedules yourself in step 9, where you choose the retention.

Pick the Cloud Functions region to match (`region` in `deployment/parish.config.js`; `npm run setup`
asks). Functions that sit near the database are faster, though the difference is unlikely to matter much for a handful of councillors.

## 4. Turn on sign-in

Nobody should be able to make themselves an account, and everyone should need a second factor, so sign-in needs a little more than the default.

1. **Authentication, Get started.** Turn on **Email/Password**.
2. Upgrade to **Identity Platform** when offered. The authenticator-app second factor needs it, and
   it is the setting that keeps sign-up closed. The offer sits on the page's "SMS multi-factor authentication" card, under **Upgrade to enable**. Use it, but do not set up SMS afterwards, which ParishMap does not use and which costs money for every message. The yellow banner recommending "Sign in with Google" can be ignored too, as people sign in with a password and an authenticator, and nothing else.
3. Let a script set the rest. First sign in to Google for scripts, then look before you change
   anything:

   ```bash
   gcloud auth application-default login
   npm run configure-auth          # shows what it would change
   npm run configure-auth -- --yes # does it
   ```

   The script turns on email and password sign-in, turns **sign-up off** (people are invited, nobody can
   make themselves an account) and makes the authenticator-app second factor available.

Everyone must verify their email and set up an authenticator app. Firebase has no "require" switch
for this, so the app forces it and `firestore.rules` refuses any sign-in that did not use the second
factor.

> `configure-auth` follows Google's published Identity Platform settings but has not been run
> against a brand-new project by the author yet. If it is refused, make the same three changes in
> the console (Authentication, Sign-in method and Settings) and tell the project about it.

## 5. Register the web app

The browser needs to know which project to talk to. Under **Project settings, General, Your apps, Add app, Web**, copy the settings it shows into `.env`
(`npm run setup` can read them if you paste the whole snippet). They identify the project and
grant nothing, so there is no harm in them being visible in the built site.

The API key is a different matter, since anyone could try to use a key they have found. Make sure the Google Cloud console is showing your project (it remembers the last one you used), then open **APIs & Services, Credentials** and the "Browser key (auto created by Firebase)". Firebase has already limited it to the APIs the app needs. Under **Application restrictions**, choose **Websites** (the console's name for HTTP referrers) and add your site's addresses, for example `https://<project-id>.web.app/*` and `https://<project-id>.firebaseapp.com/*`, and `http://localhost/*` while you develop.

## 6. Install and sign in to the Firebase tools

The deploy commands come from the Firebase command-line tools, so they need installing and signing in once.

```bash
npm install -g firebase-tools
firebase login
firebase use <your-project-id>     # writes .firebaserc if setup did not
```

## 7. Deploy

With the project, sign-in and settings in place, the site can go live. The build also writes the files that the deploy depends on.

```bash
npm --prefix functions ci                       # the functions have their own dependencies; once is enough
npm run build                                   # also writes firebase.json and the function settings
firebase deploy --only firestore:rules
firebase deploy --only functions,hosting
```

The first deploy enables several Google APIs and takes a few minutes. It may also finish with an error about a missing cleanup policy for container images. The functions are deployed by then, but the hosting release is not. Without a policy, old images pile up and cost a little each month, so set one and deploy again:

```bash
firebase functions:artifacts:setpolicy --location <region> --force
firebase deploy --only hosting
```

Never deploy straight after `npm run test:e2e`. The end-to-end tests leave a build in `dist/` that
skips sign-in, and Hosting would serve it to everyone. Run `npm run build`, then `npm run check:dist`, immediately before a hosting deploy.

If you chose a keyed map provider (see [tile-providers.md](tile-providers.md)), set its key first:
`firebase functions:secrets:set <SECRET_NAME>`. The key then lives only in Secret Manager and never in a file.

## 8. Create the first administrator

Nobody can sign up, which leaves a small puzzle about how the first person gets in. The answer is to create yourself in the console, under **Authentication, Users, Add user** (use a
real email address and any password). Check the project name at the top of the page first, because it is easy to add the user to the project you used last. Then give that account the administrator role:

```bash
node scripts/set-role.mjs you@example.org admin          # shows what it would do
node scripts/set-role.mjs you@example.org admin --yes    # does it
```

Open your site, sign in, press **Send verification email**, follow the link, and set up an
authenticator app when asked. After that, invite everyone else from the **People** page.

## 9. Switch on backups

A working site with no backups is one mistake away from losing the council's records. See [backups.md](backups.md), and do this before real data goes in.

## When something goes wrong

These are the ones most likely to catch you out.

- *A blank page, or "Firebase is not configured"*: `.env` is missing a value. Rebuild after fixing it, since the values are compiled in at build time.
- *"Port taken" when running `npm run test:rules` on Windows*: an earlier run left the emulator
  running. Stop that `java` process and try again.
- *"No user with the email ..." from `set-role.mjs`*: the user is in a different project, or has not been saved. Open the Users page of the project named in the script's message and look.
- *"Couldn't find firebase-functions package" when deploying*: run `npm --prefix functions ci` first.
- *The map shows OpenStreetMap although you chose another provider*: the function cannot reach the
  provider, or the key is missing or wrong. Check the function's logs in the Google Cloud console.
