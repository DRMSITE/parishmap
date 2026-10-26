import AxeBuilder from "@axe-core/playwright";

/**
 * Run axe and return violations, ignoring one known false positive: wa-page's own
 * "Skip to content" link sits outside any landmark, and axe's `region` rule cannot
 * tell it is a skip link because its target lives in wa-page's shadow root. Every
 * other node, and every other rule, still fails the test.
 * @param {import("@playwright/test").Page} page
 * @param {{ excludeMap?: boolean }} [options] Leaflet's own markup is not ours to fix.
 */
export async function axeViolations(page, { excludeMap = false } = {}) {
  let builder = new AxeBuilder({ page });
  if (excludeMap) builder = builder.exclude(".leaflet-container");
  const { violations } = await builder.analyze();
  return violations
    .map((v) =>
      v.id === "region"
        ? {
            ...v,
            nodes: v.nodes.filter(
              (n) => !n.html.includes('part="skip-to-content"'),
            ),
          }
        : v,
    )
    .filter((v) => v.nodes.length > 0);
}
