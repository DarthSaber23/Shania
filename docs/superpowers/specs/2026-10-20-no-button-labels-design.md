# No button labels while it dodges

On the main question page, each No tap that still dodges also changes the button label. The fifth tap still opens `sure.html`. GitHub Pages still publishes the repository root with no build step.

This spec was written in a background run. The request already fixed the words, the tap that opens the sure page, the phone width, the 48px target, and the reset, so implementation continues from this document.

## Approaches

1. **Label table in the dodge module, applied before placement (chosen).** `refusalAfterTap` returns the next count, whether to open the sure page, and the label for taps that stay on the question. The page sets `textContent` and `aria-label`, then the dodge re-measures that label and places with the existing lane rules. Tests stay in `node --test` with no new dependency. The sure-page Yes button never asks for a label.
2. **Put the four strings in `data-labels` on the button.** The sequence would be editable in HTML, but the sure-page control shares the dodge helper and must not read those strings. Two sources of copy are easier to drift from the tests.
3. **Swap the label with CSS `content` on a counter class.** The accessible name would not follow the visible words unless script still sets `aria-label`, and the script would still have to measure width. CSS would not know when the fifth tap should navigate instead.

## Sequence

Initial label, before any tap: `No`.

After each tap that does not navigate:

| Tap | Count after the tap | Visible label and `aria-label` |
| --- | --- | --- |
| 1 | 1 | `Are you sure?` |
| 2 | 2 | `Think again 🥺` |
| 3 | 3 | `Pleaseee 😭` |
| 4 | 4 | `Last chance 💔` |

Tap 5 still increments the counter, notifies, and assigns `sure.html`. It does not apply a further label.

Only the question-page control (`data-dodge="count"`) changes its label. The sure page still says Yes on the fleeing control and No on the link home.

## Reset

Going home loads `index.html` again. That document's button text and `aria-label` are `No`, and the in-memory counter starts at 0. A persisted page show already reloads, so back-forward cache cannot keep an old label.

## Measure, then place

The label is updated before the button is placed. Placement then reads the button's border box after the width lock from the previous label is cleared (`width: max-content`, `height: auto`, `white-space: nowrap`). The first flee still leaves the grid before that read, so a column does not clamp the new words.

`placementSize` turns that measured box into the size passed to the existing lane search:

- Keep the measured width and height when they fit in the viewport lane.
- Never exceed the lane.
- The used width and height are at least 48px unless the lane itself is smaller.
- The current shrink ladder (full size, then 112px, then 96px by 48px) still runs so a tight band can find a clear spot. The full measured size is the first candidate.

`.btn.no` uses `white-space: nowrap` so the given labels stay one line on a 360px-wide phone. They are short enough to fit that lane beside the 8px page margin without a smaller font.

The accessible name is the same string as the visible label, including the emoji, so the name matches the control.

## Unchanged

- ntfy notifier behavior, including its topic. Tests mock `fetch`. Nothing in this work sends a real ntfy request.
- YouTube player on `yeayy.html`.
- Full-name row and question heading.
- Confetti.
- Sure-page copy and the endless Yes dodge.
- No hover dodge. Pointer and Enter/Space still drive the jump.
- No `package.json` and no build step.
