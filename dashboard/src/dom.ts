/**
 * The one thing every chart on this dashboard needs and the DOM does not give
 * it: an SVG element built with its attributes.
 *
 * `document.createElement` makes an HTML element whatever name it is handed, so
 * a `<polyline>` built that way is in the wrong namespace and never paints.
 *
 * Both sections' chart pages import it. The Match track's Entrant record page
 * held a copy of this for one ticket, while spec 0014 put "any change to the
 * Match track's pages" out of scope for the FPL section's work; spec 0017
 * rewrote that page wholesale, which is the ticket that condition was waiting
 * for, and the copy went with it.
 *
 * The layouts' own scripts are `is:inline` and can import nothing, which is why
 * the theme and burger handlers are duplicated between the two of them for a
 * reason no ticket can lift. A page's script is bundled and has no such excuse.
 */
export const svg = (
  name: string,
  attributes: Record<string, string | number>
): SVGElement => {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
};
