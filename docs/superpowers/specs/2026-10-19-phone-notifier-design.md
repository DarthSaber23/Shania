# Phone notifier — design

Radit should learn what Shania does on the live question site, on his phone, without any change she can see. GitHub Pages still serves the repository root with no build step. This spec was written in a background run. The request already fixed the topic, the five events, the transport, and the "do not touch the existing flow" rule, so implementation continues from this document.

## Approaches

1. **Fetch calls inside `js/app.mjs`.** Shortest diff, but `app.mjs` runs against the DOM on import, so `node --test` cannot exercise it without a browser. Easy to accidentally `await` and stall a navigation.
2. **`js/notify.mjs` plus thin wiring (chosen).** Message text, priority, once-only flags, and the debounce live in a module that takes `fetch`, `sessionStorage`, and a clock. `app.mjs` only reports page events. Tests mock `fetch`.
3. **`sendBeacon` only.** Survives unload, but it is a worse match for the requested `fetch` shape and a clumsier mock. Keep it as a fallback when `fetch` throws before returning a promise.

## Transport

- Topic: `https://ntfy.sh/shania-radit-766350e890617d63`
- `fetch(url, { method: "POST", body: text, mode: "cors", keepalive: true })`
- No custom headers. `title`, `priority`, and `tags` go in the query string.
- Do not `await` the promise. Attach `.catch(() => {})` so a failure is silent.
- If `fetch` throws synchronously, or is missing, call `sendBeacon` with the same URL and text. If that throws too, ignore it.
- Notifications never `preventDefault`, never delay `location.assign`, and never add visible DOM.

## Priorities and copy

Local time is Asia/Jakarta, formatted `19 Oct, 23:51 WIB` (en-GB, 24-hour, no DST). It is appended to every body.

| Event | When | Priority | Tags | Body |
| --- | --- | --- | --- | --- |
| open | Question page, once per tab session | `low` | — | `Shania opened the page 👀 · {time}` |
| no | Each counted No on the question page, including the 5th | `low` | — | `Shania tapped NO ({count}/5) · {time}` |
| sure | `sure.html` loaded | `default` | — | `Shania reached Are you sure? · {time}` |
| sure-no | No on the sure page, delivered when the question page loads again | `default` | — | `Shania tapped NO on Are you sure? (went back home) · {time}` |
| yes | `yeayy.html` loaded because Yes was clicked | `urgent` | `heart,tada` | `Shania said YES! 💖 (after {count} NO taps) · {time}` |

`urgent` is ntfy priority 5. Titles are short query values (`Shania opened the page`, `Shania tapped NO`, `Are you sure?`, `Went back home`, `Shania said YES!`).

## Session rules

`sessionStorage` keys, all prefixed `shania.notify.`:

- `opened` — set before the open notification. A second load in the same tab does not send again. A new tab does.
- `noCount` — latest counted No on this attempt. The question page sets it to `0` on load, which preserves today's reset when No on the sure page returns home. The in-memory dodge counter stays the source of jumps.
- `sureNo` — set synchronously on click of the sure-page No link. The next question-page load sends the sure-no message and clears the flag. A normal visit does not send it.
- `yesToken` / `yesCount` / `yesSent` — Yes click writes a new token and the current `noCount`, then lets the link navigate. Yeayy sends only when a token is present and `yesSent` is not already that token. It records `yesSent` before the fetch, so a reload does not send a second time. A later Yes click mints a new token and may send again. Opening Yeayy directly does not send.

No-tap notifications use a 400ms leading-edge debounce so a ghost `pointerdown` plus `click` cannot publish twice. The stored count still updates on the suppressed tap, so the Yes message can say the real total. The dodge's own shield and `ignoreClick` stay as they are.

The 5th No publishes with `keepalive: true` and then assigns `sure.html` as it does today. The sure page publishes its own arrival on load.

## Failure

Offline, blocked storage, and a rejected response must not throw into the dodge, the Yes link, or confetti. Storage helpers swallow their own exceptions.

## Testing

`node --test` with an injected `fetch` and an in-memory storage. No `package.json`. Assert the exact body, the query priority and tags, `method` / `mode` / `keepalive`, the absence of a `headers` field, once-only open and Yes, debounce, sure-no only after it is armed, count reset on the question page, and silence when `fetch` rejects or throws. A source check confirms `app.mjs` calls the six hooks and the HTML files gain no notifier UI.

One real `[TEST]` publish per event is a manual check against the topic, not a committed test, so CI does not ping the phone.

## Out of scope

Visible UI, a backend, a service worker, changing dodge thresholds, confetti, copy, or the Pages workflow.
