// The actions board: one list per lane, each action a card. Moving a card has two routes
// that do the same thing. The first works for everyone: a "Move to" list on the card, and
// buttons to move it up or down within its lane (so keyboard, touch and screen reader
// users never need to drag). The second is dragging a card to a lane or between cards,
// for people with a mouse. Both are offered only to people who may move cards in the
// project (`can.canMoveActions`); firestore.rules refuses everyone else anyway.
//
// Everything is built as DOM, never from strings, so action content is not parsed as HTML.

import { actionButton } from "../map/markers.js";
import { formatDueDate, isOverdue } from "./format.js";
import { buildPlaces } from "./places.js";
import {
  actionsInLane,
  endOfLane,
  LANES,
  laneLabel,
  orderAfterShift,
  orderAtIndex,
} from "./model.js";

/** @typedef {import("../types.js").Project} Project */
/** @typedef {import("../types.js").ProjectAction} ProjectAction */
/** @typedef {import("../types.js").ProjectGuard} ProjectGuard */

/**
 * @typedef {object} BoardHandlers
 * @property {(action: ProjectAction, lane: string, order: number, how: "move" | "up" | "down" | "drag") => void} move
 *   Put the card in this lane at this position. `how` says what the person used, so the
 *   page can say what happened and put focus back on the same control.
 * @property {(action: ProjectAction) => void} edit
 * @property {(action: ProjectAction) => void} remove
 */

/** @param {string} text @param {string} [className] */
function paragraph(text, className) {
  const p = document.createElement("p");
  if (className) p.className = className;
  p.textContent = text;
  return p;
}

/**
 * @param {ProjectAction[]} actions Every action in the project.
 * @param {object} options
 * @param {Project} options.project
 * @param {ProjectGuard} options.can
 * @param {BoardHandlers} options.handlers
 * @param {Map<string, import("../types.js").GeoRecord>} [options.features] Every map
 *   feature by id, so linked places can be named.
 * @returns {HTMLElement}
 */
export function buildBoard(
  actions,
  { project, can, handlers, features = new Map() },
) {
  const mayMove = can.canMoveActions(project);
  const board = document.createElement("div");
  board.className = "board";
  /** The card being dragged, if any. @type {string | null} */
  let dragging = null;

  /**
   * @param {ProjectAction} action
   * @param {ProjectAction[]} cards The action's lane, in board order.
   */
  function buildCard(action, cards) {
    const card = document.createElement("li");
    card.className = "action-card";
    card.dataset.id = action.id;
    card.tabIndex = -1; // A place for focus to land if the control it was on has gone.

    const title = document.createElement("h4");
    title.className = "action-title";
    title.textContent = action.title;
    card.append(title);

    const facts = [];
    if (action.assigneeEmail) facts.push(`For: ${action.assigneeEmail}`);
    if (action.dueDate)
      facts.push(
        `Due: ${formatDueDate(action.dueDate)}${isOverdue(action) ? " (overdue)" : ""}`,
      );
    if (facts.length) card.append(paragraph(facts.join(". "), "action-meta"));
    if (action.details)
      card.append(paragraph(action.details, "action-details"));
    const places = buildPlaces(action.featureIds, features, "action-meta");
    if (places) card.append(places);

    const controls = document.createElement("div");
    controls.className = "action-controls";

    if (mayMove) {
      const label = document.createElement("label");
      label.className = "field";
      // Reads "Move to" and, to a screen reader, "Move <title> to".
      const text = document.createElement("span");
      text.className = "field-label";
      const hidden = document.createElement("span");
      hidden.className = "visually-hidden";
      hidden.textContent = action.title;
      text.append("Move ", hidden, " to");
      const select = document.createElement("select");
      select.className = "field-select";
      select.dataset.control = "move";
      for (const lane of LANES) {
        const option = document.createElement("option");
        option.value = lane.id;
        option.textContent = lane.label;
        option.selected = lane.id === action.lane;
        select.append(option);
      }
      select.addEventListener("change", () => {
        if (select.value === action.lane) return;
        handlers.move(
          action,
          select.value,
          endOfLane(actions, select.value),
          "move",
        );
      });
      label.append(text, select);
      controls.append(label);

      const index = cards.findIndex((a) => a.id === action.id);
      /** @type {[string, "up" | "down", -1 | 1, boolean][]} */
      const shifts = [
        ["Move up", "up", -1, index > 0],
        ["Move down", "down", 1, index < cards.length - 1],
      ];
      for (const [verb, how, step, offered] of shifts) {
        if (!offered) continue;
        const button = actionButton(verb, action.title, () => {
          const order = orderAfterShift(cards, action.id, step);
          if (order !== null) handlers.move(action, action.lane, order, how);
        });
        button.dataset.control = how;
        controls.append(button);
      }

      card.draggable = true;
      card.addEventListener("dragstart", (event) => {
        dragging = action.id;
        card.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", action.title);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", () => {
        dragging = null;
        card.classList.remove("is-dragging");
        for (const list of board.querySelectorAll(".is-drop-target"))
          list.classList.remove("is-drop-target");
      });
    }

    if (can.canEditAction(action, project)) {
      const edit = actionButton("Edit", action.title, () =>
        handlers.edit(action),
      );
      edit.dataset.control = "edit";
      controls.append(edit);
    }
    if (can.canDeleteAction(action, project)) {
      const remove = actionButton(
        "Delete",
        action.title,
        () => handlers.remove(action),
        "danger",
      );
      remove.dataset.control = "remove";
      controls.append(remove);
    }
    if (controls.childElementCount) card.append(controls);
    return card;
  }

  for (const lane of LANES) {
    const cards = actionsInLane(actions, lane.id);
    const section = document.createElement("section");
    section.className = "lane";
    section.dataset.lane = lane.id;
    section.setAttribute("aria-labelledby", `lane-${lane.id}`);

    const heading = document.createElement("h3");
    heading.id = `lane-${lane.id}`;
    heading.className = "lane-title";
    heading.textContent = `${lane.label} (${cards.length})`;

    const list = document.createElement("ul");
    list.className = "lane-cards";
    list.append(...cards.map((action) => buildCard(action, cards)));
    if (cards.length === 0) {
      const empty = document.createElement("li");
      empty.className = "lane-empty";
      empty.textContent = "No actions";
      list.append(empty);
    }

    if (mayMove) {
      list.addEventListener("dragover", (event) => {
        if (!dragging) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        list.classList.add("is-drop-target");
      });
      list.addEventListener("dragleave", (event) => {
        if (
          !(
            event.relatedTarget instanceof Node &&
            list.contains(event.relatedTarget)
          )
        )
          list.classList.remove("is-drop-target");
      });
      list.addEventListener("drop", (event) => {
        if (!dragging) return;
        event.preventDefault();
        list.classList.remove("is-drop-target");
        const moved = actions.find((a) => a.id === dragging);
        if (!moved) return;
        // Where among the other cards the pointer is: before the first one whose middle
        // is below it.
        const others = cards.filter((a) => a.id !== moved.id);
        const shown = [...list.querySelectorAll(":scope > li[data-id]")].filter(
          (el) => /** @type {HTMLElement} */ (el).dataset.id !== moved.id,
        );
        let index = shown.findIndex((el) => {
          const box = el.getBoundingClientRect();
          return event.clientY < box.top + box.height / 2;
        });
        if (index === -1) index = shown.length;
        // Dropped back where it was.
        if (
          moved.lane === lane.id &&
          index === cards.findIndex((a) => a.id === moved.id)
        )
          return;
        handlers.move(moved, lane.id, orderAtIndex(others, index), "drag");
      });
    }

    section.append(heading, list);
    board.append(section);
  }
  return board;
}

/**
 * What the page says after a card has moved.
 * @param {string} title
 * @param {string} lane
 * @param {"move" | "up" | "down" | "drag"} how
 */
export function movedMessage(title, lane, how) {
  if (how === "up" || how === "down")
    return `Moved “${title}” ${how} in ${laneLabel(lane)}.`;
  return `Moved “${title}” to ${laneLabel(lane)}.`;
}
