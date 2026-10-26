// The map page. It is the only view that touches the map and the flags, and it
// reaches the data only through `ctx.data` (see types.js DataSource). What it offers
// (add, edit, delete) is decided by `ctx.guard`.

import L from "leaflet";
import { config } from "../config.js";
import { canShow } from "../map/basemaps.js";
import { hasBoundary } from "../map/boundary-file.js";
import { createMap } from "../map/map.js";
import { canFinish, startDrawing } from "../map/draw.js";
import { buildPopup } from "../map/markers.js";
import {
  loadProjectsQuietly,
  NO_PROJECTS,
  projectsForFeature,
} from "../projects/links.js";
import { buildProjectLinks } from "../projects/places.js";
import { createRecordLayer } from "../map/shapes.js";
import { confirmDelete } from "../ui/confirm.js";
import { createPointDialog } from "../ui/point-dialog.js";
import { on } from "../util/dom.js";
import { geometryBounds, shapeKind } from "../util/geo.js";

/** @typedef {import("../types.js").GeoRecord} GeoRecord */

const MARKERS_FLAG = "markers";
const BOUNDARY_FLAG = "boundary";
const PREFERRED_FLAG = "preferred-map";

/** @type {import("../types.js").RenderFn} */
export function render(container, ctx) {
  ctx.flags.register({
    id: MARKERS_FLAG,
    label: "Show points, lines and areas",
    hint: "What has been added to the map.",
  });
  // The council's chosen map, when this person can have it. Tiles that need a key come
  // through our proxy, for the roles the provider allows; everyone else sees OpenStreetMap.
  const preferred = config.tiles.providers[config.tiles.basemap];
  const tileOptions = ctx.tiles && {
    getToken: ctx.tiles.getToken,
    canUse: ctx.tiles.canUse,
    onFail: () => {
      handle.setBasemap("osm");
      showNotice(
        `The ${preferred.label} map could not be loaded, so OpenStreetMap is shown.`,
      );
    },
  };
  const preferredAvailable =
    preferred.id !== "osm" && canShow(preferred, tileOptions);
  if (preferredAvailable)
    ctx.flags.register({
      id: PREFERRED_FLAG,
      label: `Use the ${preferred.label} map`,
      hint: "Turn off to see OpenStreetMap instead.",
    });
  if (hasBoundary)
    ctx.flags.register({
      id: BOUNDARY_FLAG,
      label: `Show the ${config.council.kind} boundary`,
      hint: `A dotted outline of the ${config.council.kind}.`,
    });

  container.innerHTML = `
    <div class="map-page">
      <h1 class="visually-hidden">Map</h1>
      <div class="map-toolbar" role="toolbar" aria-label="Map actions">
        <wa-button data-action="add" appearance="filled" variant="brand" size="xs">
          <wa-icon slot="start" name="plus"></wa-icon>
          Add point
        </wa-button>
        <wa-button data-action="pick" appearance="outlined" size="xs">
          <wa-icon slot="start" name="location-crosshairs"></wa-icon>
          <span data-pick-label>Pick on map</span>
        </wa-button>
        <wa-button data-action="options" appearance="outlined" size="xs">
          <wa-icon slot="start" name="sliders"></wa-icon>
          Options
        </wa-button>
        <div class="map-toolbar-row" data-draw-start>
          <wa-button data-action="draw-line" appearance="outlined" size="xs">
            <wa-icon slot="start" name="route"></wa-icon>
            Draw a line
          </wa-button>
          <wa-button data-action="draw-area" appearance="outlined" size="xs">
            <wa-icon slot="start" name="draw-polygon"></wa-icon>
            Draw an area
          </wa-button>
        </div>
        <div class="map-toolbar-row" data-draw-controls hidden>
          <wa-button data-action="draw-undo" appearance="outlined" size="xs">Undo</wa-button>
          <wa-button data-action="draw-centre" appearance="outlined" size="xs">Add at centre</wa-button>
          <wa-button data-action="draw-finish" appearance="filled" variant="brand" size="xs">Finish</wa-button>
          <wa-button data-action="draw-cancel" appearance="outlined" size="xs">Cancel</wa-button>
        </div>
        <p class="map-status" role="status" data-status hidden></p>
      </div>

      <div id="map" class="map" role="region" aria-label="Map"></div>

      <wa-drawer label="Options" data-drawer placement="end">
        <div data-flags class="stack"></div>
      </wa-drawer>
    </div>
  `;

  const mapEl = /** @type {HTMLElement} */ (container.querySelector("#map"));
  const drawer = /** @type {any} */ (container.querySelector("[data-drawer]"));
  const statusEl = /** @type {HTMLElement} */ (
    container.querySelector("[data-status]")
  );
  const pickLabel = /** @type {HTMLElement} */ (
    container.querySelector("[data-pick-label]")
  );

  const basemapId = () =>
    preferredAvailable && ctx.flags.get(PREFERRED_FLAG) ? preferred.id : "osm";
  const handle = createMap(mapEl, {
    basemap: basemapId(),
    basemapOptions: tileOptions,
  });
  /** @type {L.Map | undefined} */
  let map;
  const markers = L.layerGroup();
  let picking = false;
  /** @type {(() => void)[]} */
  const disposers = [];

  // ── Flags drawer ────────────────────────────────────────────────────────────
  // One switch per registered flag, so new flags appear here without edits.
  const flagsEl = /** @type {HTMLElement} */ (
    container.querySelector("[data-flags]")
  );
  for (const flag of ctx.flags.definitions()) {
    const el = /** @type {any} */ (document.createElement("wa-switch"));
    el.checked = ctx.flags.get(flag.id);
    el.textContent = flag.label;
    if (flag.hint) {
      const hint = document.createElement("span");
      hint.slot = "hint";
      hint.textContent = flag.hint;
      el.append(hint);
    }
    el.addEventListener("change", () => ctx.flags.set(flag.id, el.checked));
    flagsEl.append(el);
  }

  // ── Markers ─────────────────────────────────────────────────────────────────
  async function refreshMarkers() {
    const records = await ctx.data.list();
    markers.clearLayers();
    for (const record of records)
      markers.addLayer(createRecordLayer(record, actionsFor(record)));
  }

  // The projects that concern each place are shown in its popup. They are read when the
  // popup opens, so this only has to be kept up to date, and the map works without it.
  let projectData = NO_PROJECTS;
  async function refreshProjects() {
    projectData = await loadProjectsQuietly(ctx);
  }
  const unsubscribeProjects = ctx.projects?.available()
    ? ctx.projects.subscribe(() => void refreshProjects())
    : undefined;
  if (unsubscribeProjects) disposers.push(unsubscribeProjects);

  /**
   * The popup actions the guard allows for a record.
   * @param {GeoRecord} record
   * @returns {import("../map/markers.js").PopupActions}
   */
  function actionsFor(record) {
    return {
      extra: () =>
        buildProjectLinks(projectsForFeature(projectData, record.id)),
      edit: ctx.guard.can("update", record)
        ? () => {
            map?.closePopup();
            pointDialog.open({ record });
          }
        : undefined,
      remove: ctx.guard.can("delete", record)
        ? () => {
            map?.closePopup();
            void removeRecord(record);
          }
        : undefined,
    };
  }

  /** @param {boolean} visible */
  function showMarkers(visible) {
    if (!map) return;
    if (visible) markers.addTo(map);
    else markers.remove();
  }

  disposers.push(ctx.flags.watch(MARKERS_FLAG, showMarkers));
  disposers.push(
    ctx.flags.watch(PREFERRED_FLAG, () =>
      handle.setBasemap(basemapId(), tileOptions),
    ),
  );

  // The council boundary (if the deployment has one) loads on demand and follows its own flag.
  /** @type {L.Layer | null} */
  let boundary = null;
  /** @param {boolean} visible */
  function showBoundary(visible) {
    if (!map || !boundary) return;
    if (visible) boundary.addTo(map);
    else boundary.remove();
  }
  disposers.push(ctx.flags.watch(BOUNDARY_FLAG, showBoundary));
  const unsubscribe = ctx.data.subscribe?.(() => void refreshMarkers());
  if (unsubscribe) disposers.push(unsubscribe);

  handle.ready.then(async (readyMap) => {
    map = readyMap;
    await refreshProjects();
    await refreshMarkers();
    showMarkers(ctx.flags.get(MARKERS_FLAG));
    await showRequestedPlace();
    if (hasBoundary) {
      const { createBoundaryLayer } = await import("../map/boundary.js");
      boundary = await createBoundaryLayer();
    }
    showBoundary(ctx.flags.get(BOUNDARY_FLAG));
    map.on("click", (e) => {
      if (picking) openAdd(e.latlng.lat, e.latlng.lng);
    });
  });

  // ── Adding, editing and deleting ────────────────────────────────────────────
  /**
   * Bring a record into view: a point is centred, a line or an area is fitted.
   * @param {GeoRecord} record
   */
  function frame(record) {
    if (!map) return;
    if (shapeKind(record.geometry) === "point")
      map.setView(
        [record.lat, record.lng],
        Math.max(map.getZoom(), config.map.focusZoom),
      );
    else if (record.geometry) {
      const { south, west, north, east } = geometryBounds(record.geometry);
      map.fitBounds(
        [
          [south, west],
          [north, east],
        ],
        { maxZoom: config.map.focusZoom },
      );
    }
  }

  const pointDialog = createPointDialog(container, ctx, {
    onSaved(record) {
      void refreshMarkers();
      frame(record);
    },
  });
  disposers.push(() => pointDialog.destroy());

  /**
   * /?place=<id> (a link from a project) frames that record and opens its popup. A record
   * that has since been deleted is reported rather than ignored.
   */
  async function showRequestedPlace() {
    const id = new URLSearchParams(globalThis.location.search).get("place");
    if (!id || !map) return;
    const record = await ctx.data.get(id).catch(() => undefined);
    if (!map) return;
    if (!record) {
      showNotice("That place is no longer on the map.");
      return;
    }
    frame(record);
    L.popup()
      .setLatLng([record.lat, record.lng])
      .setContent(buildPopup(record, actionsFor(record)))
      .openOn(map);
  }

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let noticeTimer;
  disposers.push(() => clearTimeout(noticeTimer));

  /** A short message in the status line, for the result of a delete. @param {string} message */
  function showNotice(message) {
    setPicking(false);
    statusEl.textContent = message;
    statusEl.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      if (!picking) {
        statusEl.hidden = true;
        statusEl.textContent = "";
      }
    }, 6000);
  }

  // ── Drawing a line or an area ───────────────────────────────────────────────
  const drawStart = /** @type {HTMLElement} */ (
    container.querySelector("[data-draw-start]")
  );
  const drawControls = /** @type {HTMLElement} */ (
    container.querySelector("[data-draw-controls]")
  );
  /** @type {import("../map/draw.js").Drawing | null} */
  let drawing = null;
  /** @type {"line" | "area"} */
  let drawKind = "line";

  /** @param {number} count */
  function drawMessage(count) {
    const noun = drawKind === "line" ? "line" : "area";
    statusEl.textContent = canFinish(drawKind, count)
      ? `${count} points on the ${noun}. Choose Finish when you have them all.`
      : `Click the map to add the points of the ${noun}. ${count} so far.`;
  }

  /** @param {"line" | "area"} kind */
  function beginDrawing(kind) {
    if (!map || drawing) return;
    setPicking(false);
    drawKind = kind;
    drawing = startDrawing(map, kind, {
      maxVertices: config.limits.vertices,
      onChange: drawMessage,
    });
    drawStart.hidden = true;
    drawControls.hidden = false;
    statusEl.hidden = false;
    drawMessage(0);
  }

  /** @param {boolean} finished */
  function endDrawing(finished) {
    if (!drawing) return;
    const vertices = drawing.vertices();
    drawing.stop();
    drawing = null;
    drawStart.hidden = false;
    drawControls.hidden = true;
    statusEl.hidden = true;
    statusEl.textContent = "";
    if (finished) pointDialog.open({ kind: drawKind, vertices });
  }

  function finishDrawing() {
    if (!drawing) return;
    if (!canFinish(drawKind, drawing.vertices().length)) {
      statusEl.textContent = `${drawKind === "line" ? "A line needs at least 2" : "An area needs at least 3"} points.`;
      return;
    }
    endDrawing(true);
  }

  /** @param {KeyboardEvent} event */
  const onEscape = (event) => {
    if (event.key === "Escape" && drawing) endDrawing(false);
  };
  document.addEventListener("keydown", onEscape);
  disposers.push(() => {
    document.removeEventListener("keydown", onEscape);
    drawing?.stop();
  });

  /** @param {boolean} value */
  function setPicking(value) {
    picking = value;
    mapEl.classList.toggle("is-picking", value);
    pickLabel.textContent = value ? "Cancel" : "Pick on map";
    statusEl.hidden = !value;
    statusEl.textContent = value
      ? "Click the map where you want the point."
      : "";
  }

  /**
   * @param {number} lat
   * @param {number} lng
   */
  function openAdd(lat, lng) {
    setPicking(false);
    pointDialog.open({ lat, lng });
  }

  /** @param {GeoRecord} record */
  async function removeRecord(record) {
    const title = String(record.data.title ?? "Untitled point");
    if (!(await confirmDelete(title))) return;
    try {
      await ctx.data.remove(record.id);
      void refreshMarkers();
      showNotice(`Deleted “${title}”.`);
    } catch (error) {
      console.error("[map] Delete failed.", error);
      showNotice(`“${title}” could not be deleted.`);
    }
  }

  on(container, '[data-action="add"]', "click", () => {
    const centre = map?.getCenter();
    openAdd(
      centre?.lat ?? config.map.centre[0],
      centre?.lng ?? config.map.centre[1],
    );
  });
  on(container, '[data-action="pick"]', "click", () => setPicking(!picking));
  on(container, '[data-action="draw-line"]', "click", () =>
    beginDrawing("line"),
  );
  on(container, '[data-action="draw-area"]', "click", () =>
    beginDrawing("area"),
  );
  on(container, '[data-action="draw-undo"]', "click", () => drawing?.undo());
  on(container, '[data-action="draw-centre"]', "click", () =>
    drawing?.addAtCentre(),
  );
  on(container, '[data-action="draw-finish"]', "click", finishDrawing);
  on(container, '[data-action="draw-cancel"]', "click", () =>
    endDrawing(false),
  );
  on(container, '[data-action="options"]', "click", () => {
    drawer.open = true;
  });

  // Adding needs permission to create; without it those buttons are not offered.
  if (!ctx.guard.can("create")) {
    const createButtons = /** @type {NodeListOf<HTMLElement>} */ (
      container.querySelectorAll(
        '[data-action="add"], [data-action="pick"], [data-draw-start]',
      )
    );
    for (const el of createButtons) el.hidden = true;
  }

  // Cleanup, called by the router before the next view renders.
  return () => {
    for (const dispose of disposers) dispose();
    handle.destroy();
  };
}
