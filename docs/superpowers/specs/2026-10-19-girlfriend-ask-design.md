# For Shania — design

A mobile-first static page that asks Shania to be a girlfriend. GitHub Pages publishes the repository root with `.github/workflows/static.yml` (no build step) to `https://darthsaber23.github.io/Shania/`. Paths stay relative so the `/Shania/` base works.

This spec was written in a background run. The request already fixed the copy, the flow, the viewports, and the deploy constraints, so implementation continues from this document.

## Approaches

1. **Hash router on one page.** One state machine and an easy counter reset, but the back button depends on custom routing and Yes is not a real link.
2. **Three HTML files (chosen).** `index.html`, `sure.html`, and `yeayy.html` use normal navigation, so the browser back button moves between them. Shared CSS and two small modules. The No counter lives only in memory on the question page and starts at zero whenever that document loads.
3. **In-place screen swap.** Shortest code, but Back would leave the site from the later screens. Rejected.

## Flow

- Question page heading: "Shania, would you be my girlfriend?"
- **Yes** is a link to `yeayy.html` (celebration: hearts, a short burst of confetti, a happy message whose heading is "Yeayy!").
- **No** is a button. Each tap or click jumps it to a new position. The jump runs on `pointerdown` (mouse, touch, and pen) and on Enter/Space. Hover does not move it.
- The fifth No press opens `sure.html` with `location.assign` (counted press 1 through 4 only jump).
- On "Are you sure?", **Yes** jumps forever under the same placement rules. **No** is a link to `index.html`, which loads with the counter at zero.
- Back from either later page returns to the question. If the question is restored from the back-forward cache, it reloads so a stored count of five cannot immediately bounce forward again.

## Placement rules

The fleeing button, at its real width and height, must be:

- fully inside the visual viewport, inset by the safe-area and an 8px margin
- at least 16px clear of the question block (which contains the stationary button)
- preferably at least 96px from where it just was, so it leaves the finger; if that is impossible, visibility and clearance win

A spacer keeps the stationary button from sliding under the finger. A one-shot click shield ignores the click that belongs to the dodge gesture, and a new pointerdown on anything else cancels the shield so a real Yes or No tap still works.

If the free space is only a thin band, placement still finds it. The button becomes `position: fixed` on `document.body` (no transformed ancestor). Resize and visual-viewport changes re-place it without counting another press.

## Presentation

- Soft pink and rose palette. Text and button labels meet WCAG AA contrast on the blush background (4.5:1).
- Self-hosted Fraunces and Nunito, with serif and sans fallbacks. No network font request.
- Large controls: at least 56px tall, side by side, with a visible gap.
- `viewport-fit=cover`, safe-area padding, `100dvh`, and a fixed full-viewport body so the page does not scroll sideways or rubber-band. The question block may scroll inside itself if a short landscape screen cannot fit it.
- Gentle floating hearts. `prefers-reduced-motion: reduce` turns off decorative motion and confetti. The dodge is an instant jump in every mode.
- `:hover` may change color only. It must not move a button.
- Focus-visible outlines, forced-colors borders, 16px-or-larger text on controls, and decorative motion marked `aria-hidden`.

## Manifest and icons

Keep a web manifest and the icon set working. Update them to this palette:

- `name`: "For Shania"
- `short_name`: "Shania"
- `background_color`: `#fff1f4`
- `theme_color`: `#9f1239` (also the `theme-color` meta)
- icons: `icon-180.png`, `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`
- empty `.nojekyll` stays at the repository root

Do not add `package.json`. The existing Next.js workflow treats that file as a build it cannot run.

## Out of scope

Sound, accounts, a backend, a service worker, and dark theme. The page stays light on purpose.
