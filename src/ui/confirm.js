// Small confirmation dialogs (deleting a point, managing people). They use wa-dialog
// rather than window.confirm, so they are styled, accessible and testable like the rest
// of the app.

/**
 * Ask whether to delete a point. Resolves to true only if the user chooses Delete;
 * Cancel, Escape and closing the dialog all resolve to false.
 * @param {string} title The point's title, shown in the question.
 * @returns {Promise<boolean>}
 */
export function confirmDelete(title) {
  return confirmAction({
    label: "Delete point?",
    message: `Delete “${title}”? This cannot be undone.`,
    confirmText: "Delete",
  });
}

/**
 * Ask for confirmation of any action. Resolves to true only if the user chooses the
 * confirm button; Cancel, Escape and closing the dialog all resolve to false.
 * @param {object} options
 * @param {string} options.label The dialog's heading, ideally a question.
 * @param {string} options.message What will happen.
 * @param {string} options.confirmText The confirm button's text.
 * @param {"danger" | "brand"} [options.variant]
 * @returns {Promise<boolean>}
 */
export function confirmAction({
  label,
  message: text,
  confirmText,
  variant = "danger",
}) {
  return new Promise((resolve) => {
    const dialog = /** @type {any} */ (document.createElement("wa-dialog"));
    dialog.setAttribute("label", label);
    dialog.setAttribute("data-confirm", "");

    const message = document.createElement("p");
    message.textContent = text;

    const cancel = document.createElement("wa-button");
    cancel.slot = "footer";
    cancel.setAttribute("appearance", "outlined");
    cancel.textContent = "Cancel";

    const remove = document.createElement("wa-button");
    remove.slot = "footer";
    remove.setAttribute("variant", variant);
    remove.textContent = confirmText;

    let confirmed = false;
    cancel.addEventListener("click", () => {
      dialog.open = false;
    });
    remove.addEventListener("click", () => {
      confirmed = true;
      dialog.open = false;
    });
    dialog.addEventListener("wa-after-hide", (/** @type {Event} */ event) => {
      if (event.target !== dialog) return;
      dialog.remove();
      resolve(confirmed);
    });

    dialog.append(message, cancel, remove);
    document.body.append(dialog);
    dialog.open = true;
  });
}
