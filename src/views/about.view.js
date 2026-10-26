import { maker, product } from "../branding.js";
import { config } from "../config.js";
import { hasBoundary } from "../map/boundary-file.js";
import { describeChosenMap } from "../tiles/wording.js";
import { escapeHTML } from "../util/dom.js";

const chosen = describeChosenMap(config.tiles, config.council.clerkTitle);

/** @type {import("../types.js").RenderFn} */
export function render(container) {
  container.innerHTML = `
    <article class="page">
      <h1>About ${escapeHTML(config.appName)}</h1>
      <p>
        ${escapeHTML(config.appName)} is a private map for ${escapeHTML(config.council.councillors)} and the
        ${escapeHTML(config.council.clerkTitle)}. It is used to suggest possible changes and features in the ${config.council.kind} and to
        see what others have suggested. It is not open to the public.
      </p>
      <h2>What you can do</h2>
      <ul>
        <li>See ${hasBoundary ? `the ${config.council.kind} boundary and ` : ""}everything that has been suggested.</li>
        <li>
          Councillors and the Clerk can add a point, a line or an area, and edit or delete their
          own. The Clerk and administrators can change anything.
        </li>
        <li>Members can look at the map but not change it.</li>
        <li>
          The Points page lists everything as text, as an alternative to the map. It can be used
          with a keyboard or screen reader.
        </li>
        <li>
          The Projects page follows the Council's longer pieces of work. Each project has a
          responsible councillor and can have sub-projects. Councillors add actions and notes,
          which show who wrote them. The responsible councillor, the Clerk and administrators
          move actions between lanes. Projects and actions can be linked to places on the map.
        </li>
        <li>The Clerk and administrators can invite people and manage their accounts on the People page.</li>
      </ul>
      <h2>Your information</h2>
      <ul>
        <li>
          Your email address and role are kept so that you can sign in. Each point, line or area
          you add records your email address as its author, and so does each project, action and
          note, with the time you last changed it.
        </li>
        <li>
          When a councillor, the Clerk or an administrator chooses who is responsible for a
          project or who an action is for, they can see the email addresses of the other
          councillors, the Clerk and administrators. Members cannot.
        </li>
        <li>
          Points, lines, areas, projects, actions, notes and accounts are stored with Google
          Firebase, in the data centre location the council chose. Everyone signs in with a
          password and an authenticator app.
        </li>
        <li>
          Searching for a place, or dragging the pin when adding a point, sends what you type or
          the pin's position to OpenStreetMap's Nominatim service.
        </li>
        <li>
          Your browser fetches map tiles from OpenStreetMap, so that service can see your internet
          address. Menu icons are part of this site and are not fetched from anywhere else.
        </li>
        ${
          chosen?.proxied
            ? `<li>${escapeHTML(chosen.who)} can also see ${escapeHTML(chosen.label)} maps, sent through this site.</li>`
            : ""
        }
      </ul>
      <h2>Map data</h2>
      <p>
        Map data &copy;
        <a href="https://www.openstreetmap.org/copyright" rel="noopener">OpenStreetMap contributors</a>.
        ${chosen ? `${escapeHTML(chosen.label)} maps: ${chosen.attribution}.` : ""}
      </p>
      <h2>About this software</h2>
      <p>
        ${product.name} is free software, built by
        <a href="${maker.url}" rel="noopener">${maker.name}</a> and released under the
        <a href="${product.licenceUrl}" rel="noopener">${product.licence}</a>. It comes with no
        warranty. You can read and copy the
        <a href="${escapeHTML(config.sourceUrl)}" rel="noopener">source code</a>.
      </p>
      <p><a href="/">Back to the map</a></p>
    </article>
  `;
}
