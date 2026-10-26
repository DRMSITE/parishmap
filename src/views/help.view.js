// The guide. Everyone signed in sees the first part; the Clerk and administrators also see
// the part about looking after other people's accounts. It describes what the app does
// today, so change it when the screens change.

import { config } from "../config.js";
import { describeChosenMap } from "../tiles/wording.js";
import { escapeHTML } from "../util/dom.js";

const chosen = describeChosenMap(config.tiles, config.council.clerkTitle);

const EVERYONE = `
  <h3>Signing in</h3>
  <ol>
    <li>
      The first time, you are emailed an invitation. Follow its link to choose a password. It
      comes from <code>${escapeHTML(config.senderAddress)}</code>, so look in your spam folder
      if it does not arrive.
    </li>
    <li>
      Sign in with your email address and password. If asked, press
      <strong>Send verification email</strong>, follow the link in it, then come back and press
      <strong>I have verified my email</strong>.
    </li>
    <li>
      Set up an authenticator app on your phone (for example Google Authenticator, Microsoft
      Authenticator or Authy). Scan the QR code, or choose &ldquo;Cannot scan the code?&rdquo; to
      type the setup key. Then enter the six-digit code the app shows.
    </li>
    <li>
      From then on, you sign in with your password and then a six-digit code from the app. The code
      changes every 30 seconds.
    </li>
  </ol>
  <p>
    If you forget your password, choose <strong>Forgotten your password?</strong> on the sign-in
    screen and enter your email address. If you see &ldquo;No access yet&rdquo;, you have an
    account but no role. Ask the ${escapeHTML(config.council.clerkTitle)}.
  </p>

  <h3>Adding to the map</h3>
  <ul>
    <li>
      <strong>A point</strong> (a single place): choose <strong>Add point</strong>, then search for
      a place, drag the pin or type the latitude and longitude. Or choose
      <strong>Pick on map</strong> and click the spot.
    </li>
    <li>
      <strong>A line</strong> (a path or route) or <strong>an area</strong> (a field, verge or
      building plot): choose <strong>Draw a line</strong> or <strong>Draw an area</strong>, click
      each corner on the map, then <strong>Finish</strong>. <strong>Undo</strong> removes the last
      point and <strong>Cancel</strong> stops. Without a mouse, use <strong>Add at centre</strong>
      and move the map with the arrow keys.
    </li>
    <li>Give it a title and, if you like, notes. Choose Save.</li>
    <li>
      You can edit or delete what you added from its popup on the map, or from the
      <a href="/list">Points</a> page. You cannot change other people's items unless you are the
      Clerk or an administrator. A line or area can be corrected by editing its list of points as
      text.
    </li>
    <li>
      <strong>Options</strong> shows or hides points, lines and areas and the ${config.council.kind} boundary, and
      switches between maps.
    </li>
  </ul>

  <h3>The maps</h3>
  <p>
    ${
      chosen
        ? `${escapeHTML(chosen.who)} can use the ${escapeHTML(chosen.label)} map, which is the one shown by default. ${chosen.memberSees ? "" : "Everyone else sees OpenStreetMap only. "}`
        : "The map is OpenStreetMap. "
    }The map covers ${escapeHTML(config.council.area)} and the
    surrounding area only: it cannot be zoomed out or moved much beyond that.${
      chosen && chosen.maxZoom < 19
        ? ` The ${escapeHTML(chosen.label)} map is not available beyond a certain zoom, so when you zoom in further the map changes to OpenStreetMap.`
        : ""
    }
  </p>

  <h3>Projects</h3>
  <ul>
    <li>
      The <a href="/projects">Projects</a> page lists the Council's projects and their
      sub-projects. Choose a project's name to see its actions and notes.
    </li>
    <li>
      Every project has a councillor who is responsible for it. The Clerk and administrators
      start projects and choose who is responsible. The responsible councillor can change the
      project and add sub-projects under it.
    </li>
    <li>
      <strong>Actions</strong> are the jobs within a project. Any councillor can add one with
      <strong>Add action</strong>, say who it is for and when it is due. A new action goes in the
      <strong>Ideas</strong> lane (the responsible councillor, the Clerk and administrators can
      choose another). The other lanes are Agreed, In progress, Blocked and Done.
    </li>
    <li>
      Only the responsible councillor, the Clerk and administrators can move an action to
      another lane or change its place in a lane. Use the <strong>Move to</strong> list on the
      action, or <strong>Move up</strong> and <strong>Move down</strong>. With a mouse you can
      also drag the action. You can edit or delete the actions you added.
    </li>
    <li>
      <strong>Notes</strong> are a log on the project, or on one of its actions. Any councillor can
      add one and edit their own. Each action and note shows who wrote it.
    </li>
    <li>
      A project or action can be linked to places already on the map. Choose them when you add or
      edit it. Each link opens the map at that place, and that place's popup on the map and its
      entry on the <a href="/list">Points</a> page name the projects that concern it.
    </li>
    <li>Members can read projects but not change them.</li>
  </ul>
`;

const CLERK = `
  <h3>Who can do what</h3>
  <table class="people-table">
    <caption class="visually-hidden">What each role can do</caption>
    <thead>
      <tr><th scope="col">Role</th><th scope="col">Can do</th></tr>
    </thead>
    <tbody>
      <tr><th scope="row">Administrator</th><td>Everything, including inviting and managing the Clerk and other administrators, and starting, changing and deleting projects. Cannot change their own account.</td></tr>
      <tr><th scope="row">Clerk</th><td>Add, edit and delete anything on the map. Start and delete projects, choose who is responsible and move any action. Invite and manage councillors and members. Cannot manage administrators or other clerks, or change their own account.</td></tr>
      <tr><th scope="row">Councillor</th><td>Add items, and edit or delete their own.${chosen?.councillorSees ? ` Sees the ${escapeHTML(chosen.label)} map.` : ""} Adds actions and notes to any project, and runs the projects they are responsible for.</td></tr>
      <tr><th scope="row">Member</th><td>Look only.${chosen?.memberSees ? ` Sees the ${escapeHTML(chosen.label)} map.` : " Sees OpenStreetMap only."}</td></tr>
    </tbody>
  </table>

  <h3>Inviting someone</h3>
  <ol>
    <li>Open <a href="/people">People</a> and choose <strong>Invite someone</strong>.</li>
    <li>Enter their email address and choose their role. Choose <strong>Send invitation</strong>.</li>
    <li>
      They are emailed a link to choose a password, then set up their authenticator app when they
      first sign in (see &ldquo;Signing in&rdquo; above).
    </li>
    <li>
      If the email does not arrive, choose <strong>Resend invitation</strong> against their name. It
      is offered until they have signed in for the first time.
    </li>
  </ol>
  <p>
    Someone shows as <strong>Invited</strong> until they first sign in, then <strong>Active</strong>.
    Check the address carefully: the invitation goes to exactly what you type.
  </p>

  <h3>When someone loses their phone</h3>
  <p>
    Open <a href="/people">People</a> and choose <strong>Reset authenticator</strong> against their
    name. They are signed out and, next time they sign in with their password, are asked to set up
    an authenticator app again. Only do this when you are sure it is really them asking.
  </p>
  <p>
    The Clerk cannot reset an administrator's or another clerk's authenticator, or their own.
    Ask an administrator.
  </p>

  <h3>When someone forgets their password</h3>
  <p>
    They can choose <strong>Forgotten your password?</strong> on the sign-in screen and enter their
    email address. They are emailed a link to choose a new password, and still need their
    authenticator app to sign in. If the email does not arrive, ask them to check their spam
    folder. An administrator can also send a new link from the Firebase console (Authentication,
    Users, the three dots beside the person, Reset password).
  </p>

  <h3>Changing a role</h3>
  <p>
    Choose <strong>Change role</strong> against their name. They are signed out straight away and
    get their new role the next time they sign in.
  </p>

  <h3>When someone leaves</h3>
  <p>
    Choose <strong>Disable</strong> against their name. They are signed out everywhere and cannot
    sign in. Nothing they added is removed, and each item keeps their email address as its author.
    <strong>Enable</strong> brings them back. Accounts are not deleted from this page.
  </p>

  <h3>The Clerk's shared mailbox</h3>
  <p>
    If more than one person uses the Clerk's account, they all need the six-digit codes. The
    authenticator is set up once, on one phone. To use it on a second phone, scan the QR code (or
    type the setup key) into both phones at the same time, while setting up. You cannot add a
    phone afterwards without resetting the authenticator.
  </p>

  <h3>Starting a project</h3>
  <ol>
    <li>Open <a href="/projects">Projects</a> and choose <strong>New project</strong>.</li>
    <li>
      Give it a title, a short summary and a status, and choose the councillor who will be
      responsible. Administrators, the Clerk and councillors with an account are listed.
    </li>
    <li>Choose any places on the map it concerns, then <strong>Save project</strong>.</li>
  </ol>
  <p>
    You can change who is responsible by editing the project. The responsible councillor then
    runs it. <strong>Delete</strong> removes a project together with its sub-projects, actions and
    notes, and cannot be undone. Setting its status to Complete keeps the record.
  </p>

  <h3>Good practice</h3>
  <ul>
    <li>Keep at least two administrators who can sign in, so one lost phone is not a lockout.</li>
    <li>Give people the lowest role that lets them do their job.</li>
    <li>
      Administrators can see a record of who invited, changed or disabled whom on the
      <a href="/activity">Activity</a> page. It cannot be edited.
    </li>
    <li>
      Councillors' names and email addresses are personal information. Only invite people who
      need access, and disable accounts when someone stops being a councillor. Councillors,
      the Clerk and administrators can see each other's email addresses when choosing who is
      responsible for a project or who an action is for. Actions and notes also show their
      author's address.
    </li>
  </ul>
`;

/** @type {import("../types.js").RenderFn} */
export function render(container, ctx) {
  const forClerk = ctx.people?.available() ?? false;
  container.innerHTML = `
    <article class="page">
      <h1 tabindex="-1" data-heading>Help</h1>
      <p>How to use ${escapeHTML(config.appName)}.</p>
      <h2>For everyone</h2>
      ${EVERYONE}
      ${forClerk ? `<h2>For the Clerk and administrators</h2>${CLERK}` : ""}
      <p><a href="/">Back to the map</a></p>
    </article>
  `;
}
