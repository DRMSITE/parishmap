# Data protection

> **This is not legal advice.** It describes what ParishMap stores and sends, so that you can
> write an accurate privacy notice and decide your own lawful basis, retention and processes. Your
> council is the data controller. Take advice from your clerk's professional body, your data
> protection officer or a solicitor where you are unsure.

## What is stored, and where

A privacy notice is only as accurate as the description of the data behind it, and the council, not the software's author, answers for it. All data is in **your** Firebase project (Google Cloud), in the Firestore location you chose and under your Google agreement. DRMSITE LTD, the author of the software, has no access to it.

| Data | Where | Who can see it |
| --- | --- | --- |
| Accounts: email address, role, whether disabled, last sign-in, whether an authenticator is set up (no names are asked for) | Firebase Authentication | Administrators and the Clerk (People page) |
| Points, lines, areas: title, notes, position, category; the author's email address and the time of the last change | Firestore | Everyone signed in |
| Projects, actions, notes: text, status, who is responsible or assigned, links to places; the author's email address and times | Firestore | Everyone signed in (members see them read-only) |
| Audit log: who invited, changed, disabled or reset whom, and when | Firestore | Administrators |
| Backups of the above (not accounts) | Firestore backups | Project owners |

Email addresses may identify a person, and a clerk's or councillor's name is often in them. Notes and titles are free text, so people can type anything into them, including personal information about others. The software cannot tell the difference, which is why it is worth telling your users what is and is not appropriate to write.

Browsers also keep, on each person's own device, the sign-in session (Firebase) and their show/hide switches. There are no tracking cookies and no analytics.

## What leaves your project

Some information has to go to other organisations for the map to work at all, and each of them should appear in your notice.

- **The map provider** sees each viewer's IP address and the area they are looking at. With OpenStreetMap this goes straight from the browser. With a keyed provider it goes via your tile function, which means the provider sees your function's address, not the person's, but it still sees the area requested.
- **Place search** in the Add point dialog sends the search text, and the pin's position when dragged, to OpenStreetMap's Nominatim service. The About page says so. You may remove the search if your council would rather not send that information.
- **Invitation, verification and password-reset emails** are sent by Firebase from your project's address (`noreply@<your-project>.firebaseapp.com`).
- **Google** processes the data as your processor. Review their terms for your Firebase project, and the location you chose.

Icons and fonts are bundled, so nothing else is fetched from third parties.

## Decisions you need to make

The software stores the data but cannot decide what the council is entitled to keep. These are the decisions that remain with you, and each has a practical consequence.

- **Lawful basis.** Why the council is holding this information (for example performing its functions as a public authority). You decide this, not ParishMap.
- **Who gets an account**, and when it is removed. Disable accounts when someone stops being a councillor or clerk. Removed people's email addresses stay in earlier authorship records, backups and the audit log, so disabling an account is not the same as erasing the person.
- **Retention.** How long projects and notes are kept. The software does not delete anything by itself. Deleted data remains in backups until they expire (up to 8 weeks with the suggested schedule in [backups.md](backups.md)).
- **Requests from individuals** (to see or erase their data). Searching is done in the Firebase console, and deleting a person's data from notes and records is done by hand, so allow time for it.
- **A risk assessment** (DPIA), if you decide one is warranted.
- **Security.** [security.md](security.md) lists what is and is not protected.

## A starting point for the privacy notice

The text below is deliberately plain, because a notice has to be understood by the people it describes. Adapt it. Replace everything in brackets, delete what does not apply, and have it checked.

> **[Council name]: the councillors' map and project tool**
>
> **Who we are.** [Council name] ("the Council") is the data controller for the information in this
> tool. Contact: [clerk's email and address]. [Data protection officer, if any.]
>
> **Who uses it.** Councillors, the Clerk and those they authorise. It is not open to the public.
>
> **What we hold.** The email address and role of each person with an account; the points, lines,
> areas, projects, actions and notes they add, with the author's email address and the time of the
> last change; and a record of changes to accounts.
>
> **Why.** To [plan and record the Council's work in the parish, and to allow councillors to
> contribute]. Our lawful basis is [the Council's public task / state your basis].
>
> **Who sees it.** Other people with an account. [Members of the council's committees, etc.] It is
> stored with Google Firebase in [location]. We use [OpenStreetMap / provider], whose servers see
> a user's internet address and the area being viewed.
>
> **How long.** [Account information until the person leaves the Council; project records for
> ... years]. Deleted information may remain in backups for up to [8 weeks].
>
> **Your rights.** To see, correct or ask us to erase information we hold about you, and to
> complain to the Information Commissioner's Office. Contact [contact].
