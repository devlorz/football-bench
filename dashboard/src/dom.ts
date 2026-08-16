/**
 * The handful of things every page on this dashboard builds its DOM with and
 * the DOM does not give it.
 *
 * Both sections' pages import them. The Match track's Entrant record page held
 * a copy of `svg` for one ticket, while spec 0014 put "any change to the Match
 * track's pages" out of scope for the FPL section's work; spec 0017 rewrote
 * that page wholesale, which is the ticket that condition was waiting for, and
 * the copy went with it.
 *
 * The layouts' own scripts are `is:inline` and can import nothing, which is why
 * the theme and burger handlers are duplicated between the two of them for a
 * reason no ticket can lift. A page's script is bundled and has no such excuse.
 */

/**
 * An SVG element built with its attributes.
 *
 * `document.createElement` makes an HTML element whatever name it is handed, so
 * a `<polyline>` built that way is in the wrong namespace and never paints.
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

/**
 * An element with its class and its text, which is what a row, a cell, a tag
 * and a tile each are.
 *
 * `textContent` and never `innerHTML`: every string these pages print came out
 * of a response, and the one that matters most — the Demonstration
 * qualification — is a sentence the scorer froze rather than a fragment of
 * markup.
 */
export const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K, className: string, value?: string
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
};

/**
 * An element the page's own built HTML declares, which is why this asserts
 * rather than answering null: every id these pages look up is written in the
 * Astro file beside the script that reads it, and one that is not there is a
 * page that failed to build and not a state to handle.
 */
export const byId = (id: string): HTMLElement => document.getElementById(id)!;

/** The text of one of those, which is most of what a render does. */
export const text = (node: HTMLElement, value: string): void => {
  node.textContent = value;
};
