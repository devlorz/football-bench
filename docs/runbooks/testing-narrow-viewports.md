# Testing a real 375px viewport

Two done tickets record that this could not be done: [ticket 0011](../tickets/done/0011-match-track-dashboard.md)'s
"The 375px caveat" and [ticket 0015](../tickets/done/0015-the-roster-refreshes-to-ten-entrants.md)'s
step 7, waived because "the window would not resize below a 601px viewport, so 375px was
never rendered." Both are about the *browser window* — neither is true of a page inside an
`<iframe>`, and an iframe is the fix.

## Why the window doesn't work

Chrome will not size its own window below roughly 757 CSS pixels, and browser-automation
resize calls (`resize_window` and similar) hit the same floor: they resize the window's
outer chrome, not the tab's rendered viewport, so `window.innerWidth` inside the page stays
near the window's real width no matter what size was asked for. Squeezing the *document* to
375px inside a wider window — the technique both tickets fall back to — proves `scrollWidth`
stayed at 375, not that anything was laid out against a 375px viewport: `@media` queries,
`vw` units and `window.innerWidth` all still read the window's true width.

## The fix: an iframe is its own browsing context

An `<iframe>` element gets its own `window`, its own `@media` evaluation, and its own
`innerWidth` — set by its CSS `width`, independent of the outer window's actual size. Load
the page into one sized to the width being tested:

```js
const iframe = document.createElement('iframe');
iframe.style.width = '375px';
iframe.style.height = '900px';
document.body.appendChild(iframe);
iframe.src = 'http://localhost:4321/fpl';
await new Promise(r => { iframe.onload = r; });
await iframe.contentDocument.fonts.ready;   // see the font-loading note below
await new Promise(r => setTimeout(r, 300)); // let post-load reflows settle
```

Run this through the Claude-in-Chrome `javascript_tool` against a tab already open on the
app (`tabId` required); it does not need `resize_window` at all. `iframe.contentWindow.innerWidth`
now reports the real 375, and every media query in `fpl.css` or `overrides.css` evaluates
against it for real.

## Measure, don't eyeball a screenshot

A screenshot of a narrow iframe inside a wide window gets scaled down to fit the image, and
a scaled-down screenshot is easy to misread — this repo's mobile-collapse review did, twice
in one session: a two-row header read as one row on first look, because the two rows sat
close enough together at that scale not to register as a wrap. Prefer numbers read straight
off the DOM to a screenshot as the primary evidence, and keep the screenshot as a sanity
check, not the record:

```js
const doc = iframe.contentDocument, win = iframe.contentWindow;
win.matchMedia('(max-width: 760px)').matches;             // breakpoint is actually active
doc.documentElement.scrollWidth > win.innerWidth + 1;      // any sideways scroll at all
el.scrollWidth > el.clientWidth + 1;                       // one element's own overflow
win.getComputedStyle(el).gridTemplateColumns;              // resolved track widths, not the declared 1fr
elA.getBoundingClientRect().top === elB.getBoundingClientRect().top; // same row or not — use a
                                                             // few px of tolerance, not exact
                                                             // equality: baseline-aligned text of
                                                             // different sizes sits a few px off
                                                             // on a genuinely single row
```

**Wait for fonts before measuring.** `doc.fonts.ready` matters: a custom heading font not
yet loaded falls back to a wider system font, which can measure as a wrap that resolves
itself a moment later once the real font is in. Skipping this produced a false positive in
this same session before it was added.

## What this does not cover

- Touch or pointer-type emulation — this only fixes the *viewport width* half of "mobile",
  not input method.
- Real devices. It proves what the CSS does at a given CSS-pixel width, not what a specific
  phone's browser does with it.
- Visual review entirely. A screenshot is still worth taking for anything the numbers above
  don't cover directly (does it *look* right, not just does it fit) — it just should not be
  the only evidence for a question a measurement can answer directly.
