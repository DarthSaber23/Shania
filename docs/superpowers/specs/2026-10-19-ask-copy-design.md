# Ask copy — two-row question and celebration message

A small copy and type change on the live static ask site. GitHub Pages still publishes the repository root with no build step. Dodge behavior stays as it is.

This spec was written in a background run. The request already fixed the words, the two rows, the viewports, and the celebration sentence, so implementation continues from this document.

## Approaches

1. **Name line plus the existing heading (chosen).** `index.html` shows `Shania Dea Menany Soputan` in its own element, then an `h1` that reads `Would you be my girlfriend?`. The name can be slightly smaller and wrap on its own. The question stays the page's one heading. The card (`main.scene`) remains the dodge obstacle, so the No button's lane is the space around the card, not a gap inside it.
2. **Two spans inside one `h1`.** One heading for assistive tech, but the big line and the smaller line share one box and are harder to size without the name inheriting the question's scale.
3. **Put the full name in the eyebrow.** Reuses a label style. The name would look like a caption, not an elegant line above the question.

## Question page

- First row: `Shania Dea Menany Soputan`. Fraunces, about 80% of the question size, centered, `text-wrap: balance`, breaks only on spaces.
- Second row: `Would you be my girlfriend?` remains the `h1` and the largest line.
- Document title: `Would you be my girlfriend?`
- Keep the eyebrow, the note, Yes, and No.
- On a short landscape screen, the name drops to one smaller line when it fits, and the card stays short enough that a band remains under it. That band is the No button's lane (button height plus the 16px clearance). The name stays inside the card's border box.

## Celebration page

- Replace the note under `Yeayy!` with exactly `I'm so happyyy… I'm gonna die!`
- Characters: U+0027 apostrophes, U+2026 ellipsis, four `y`s in `happyyy`, trailing `!`.
- The `Yeayy!` heading, confetti, and page title stay.

## Unchanged

- No dodges on pointerdown and Enter/Space, five times, then `sure.html`.
- On the sure page, Yes dodges without a limit. No returns to `index.html`, which loads with the counter at zero.
- Hover does not move a button.
- No `package.json`. No build step.
