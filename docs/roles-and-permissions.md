# Roles and permissions

A council needs some people to be able to change things and others only to look, and it needs that division to hold even when someone tries to get round it. Every account has one role, set only by an administrator or the Clerk (never by the person themselves). The rules are enforced by `firestore.rules` and the `api` function on **every request**. The buttons the interface hides are a convenience, not the protection.

Everyone, whatever their role, must have verified their email address and signed in with an authenticator code. A sign-in without the second factor is refused by the database rules.

## The roles

Four roles cover the people a parish council is likely to have, from the person who runs the system to an adviser who only reads.

| Role | Who it is for |
| --- | --- |
| **Administrator** | The person who looks after the system (and ideally a second one, in case of loss). |
| **Clerk** | The council's clerk (the title shown is configurable). Runs the day-to-day. |
| **Councillor** | Elected members who contribute and take responsibility for projects. |
| **Member** | People who only need to look, such as an adviser. |

## The map

On the map, councillors may add and change their own work, while administrators and the Clerk may change anyone's.

| | Administrator, Clerk | Councillor | Member |
| --- | --- | --- | --- |
| See points, lines, areas and the boundary | yes | yes | yes |
| Add a point, line or area | yes | yes | no |
| Edit or delete | anything | their own | no |
| See the provider map you chose | by the provider's roles (default: administrator, clerk, councillor) | | |

Anyone who cannot see a keyed provider map (for example a member, for Ordnance Survey by default) sees OpenStreetMap instead, so nobody is left with a blank map.

## Projects

Projects are where the permissions get fiddly, because responsibility for a project can be held by a councillor who is otherwise an ordinary contributor. The table shows what each kind of person can do.

| | Admin, Clerk | Responsible councillor | Other councillors | Members |
| --- | --- | --- | --- | --- |
| Create a top-level project, choose who is responsible, delete a project | yes | no | no | no |
| Edit a project, add a sub-project under it | yes | their own project | no | no |
| Add an action (into the Ideas lane) or a note | yes | yes | yes | no |
| Edit or delete an action or note | any | their own, and any action in their project | their own | no |
| Move or reorder actions | yes | in their project | no | no |
| Read everything | yes | yes | yes | yes |

Four further points apply to projects.

- Nobody except an administrator or the Clerk changes who is responsible for a project.
- Sub-projects go three levels deep (`config.limits.projectDepth`). That limit is enforced by the app only, because the database rules cannot count depth.
- Deleting a project deletes its sub-projects, actions and notes, and only an administrator or the Clerk can do it. Notes about a deleted action stay, marked as such.
- Councillors, the Clerk and administrators can see each other's email addresses, to choose who is responsible for what and because every action and note shows its author. Members cannot.

## People

Managing accounts is the most sensitive power in the system, so it is the most tightly limited. The Clerk can look after councillors and members but not the administrators who oversee them.

| | Administrator | Clerk | Others |
| --- | --- | --- | --- |
| Invite someone | any role | councillor or member | no |
| Change a role, disable or enable, reset an authenticator | anyone except themselves | councillors, members and people with no role | no |
| Read the Activity log | yes | no | no |

- Nobody can change their own account, so there is always an administrator.
- Disabling someone, changing their role or resetting their authenticator signs them out everywhere.
- Inviting creates the account with a random password, and the person chooses their own from an email link. Every action is written to an audit log that only administrators can read and nobody can edit from the browser.

## Keeping three things in step

The same decision is made in three places, and a change to one without the others leaves either a button that fails or a rule that is looser than the interface suggests. If you change roles, change all three, and the rule tests:

1. `src/auth/session.js` (`ROLES`),
2. the guards in `src/auth/` (they hide buttons),
3. `firestore.rules` and `functions/people-handler.js` (they decide).

`npm run test:rules` tests the rules against the Firestore emulator.
