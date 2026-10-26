# Backups and restoring

A council's records tend to be missed only once they are gone, and Firebase keeps them in two separate places. ParishMap keeps its data in Firestore, while accounts live in Firebase Authentication, which is **not**
part of Firestore backups. Plan for both.

## What to switch on

Nothing here is on unless you ask for it. The console's database wizard does offer a weekly backup, kept for 98 days by default, so if you accepted that, note the retention when you write your privacy notice, and either change it or leave out the weekly command below. Replace `<project>` with your Firebase project id and `<location>` with your database's location
(for example `europe-west2`). The commands change as Google updates `gcloud`, so check each with
`--help` before you run it.

```bash
# A daily backup kept for 30 days, and a weekly one (Mondays) kept for 8 weeks
gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=30d --project=<project>
gcloud firestore backups schedules create --database='(default)' --recurrence=weekly --day-of-week=MON --retention=8w --project=<project>

# Point-in-time recovery: read the data as it was at any minute in the last 7 days
gcloud firestore databases update --database='(default)' --enable-pitr --project=<project>

# Stop the database being deleted by accident
gcloud firestore databases update --database='(default)' --delete-protection --project=<project>
```

If you have more than one Google account, add `--account=<you@example.org>` to each command.

Backups and point-in-time recovery cost a little, and backups of deleted data linger until they
expire (up to 8 weeks with the settings above). That matters if someone asks for their data to be erased, so say so in your privacy notice.

## Accounts

Firestore backups say nothing about who may sign in. Authentication (people, roles, authenticator enrolments) is not in them, so now and then,
run:

```bash
node scripts/export-people.mjs
```

It saves a private CSV of emails and roles (no passwords). Keep it somewhere safe and do not commit
it (`people-*.csv` is git-ignored). If the accounts were ever lost, you would invite these people
again, and each would set up their authenticator app again, which is tedious but not a disaster.

## Restoring

A restore is safest when it cannot make things worse, and this one cannot. It never overwrites the live database. It makes a new one, which you inspect and copy what
you need from (Firebase console, Firestore, the database picker). Copying data back is not
scripted, so expect to do that part by hand.

```bash
# See the backups
gcloud firestore backups list --location=<location> --project=<project>

# Restore one into a new database
gcloud firestore databases restore \
  --source-backup=projects/<project>/locations/<location>/backups/<BACKUP_ID> \
  --destination-database=restored-<DATE> --project=<project>

# Or recreate the data as it was at a moment in the last 7 days
gcloud firestore databases clone \
  --source-database='projects/<project>/databases/(default)' \
  --snapshot-time=<2026-10-22T09:30:00Z> \
  --destination-database=restored-<DATE> --project=<project>
```

Delete a restored database once you have what you need
(`gcloud firestore databases delete --database=restored-<DATE>`), because it is billed like any other.

**Try a restore before you need one.** After the first weekly backup exists, restore it into a
throwaway database, check the data, and delete it. A restore attempted for the first time during an emergency is a poor moment to learn that a command has changed.

## Your own files

Everything above protects the data, but the site itself needs protecting too. The source code, `firestore.rules` and your `deployment/` folder (settings and boundary) are only
as safe as wherever you keep them. Keep them in a private repository with a remote, so that a lost laptop is an inconvenience and nothing worse.
