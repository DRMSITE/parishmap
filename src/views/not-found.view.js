/** @type {import("../types.js").RenderFn} */
export function render(container) {
  container.innerHTML = `
    <article class="page">
      <h1>Page not found</h1>
      <p>There is nothing at this address. <a href="/">Go to the map</a>.</p>
    </article>
  `;
}
