# Session timeout — design

A verified visit should not stay open forever. After the gate accepts a code, the same page returns to the gate when the phone has been idle for 15 minutes, or when 60 minutes have passed since verification, whichever comes first. This spec was written in a background run from a request that already fixed the durations, the expiry copy, the ntfy reason, and the rule that the YouTube clip must stop.

## Approaches

1. **Store only `shania.gate.verified = "1"` and keep the timers in memory.** A locked phone freezes timers, so a later visit cannot tell how long the page was idle.
2. **Persist `verifiedAt` and `lastActivityAt`, and enforce them from `js/gate.mjs` (chosen).** The head script uses the same two durations before first paint. `mountGate` shows the gate again on the open page, and a storage claim keeps the ntfy post to one per verification.
3. **Reload the page when the timer fires.** That would also lock the page, but it would restart scripts, flash, and make the “no refresh” requirement miss.

## Durations

`js/session.mjs` exports:

- `INACTIVITY_MS` = `15 * 60 * 1000`
- `ABSOLUTE_MS` = `60 * 60 * 1000`

The inline script in `index.html`, `sure.html`, and `yeayy.html` repeats those two expressions. A test fails if the script and the exports drift.

A query string may only shorten a duration, and only for that load: `?inactivityMs=1500&absoluteMs=60000`. A missing, non-numeric, or larger value keeps the constant. Shortening is stricter, so it cannot extend a session.

## Session record

Verification still sets `shania.gate.verified` to `1` and still deletes `shania.gate.pending`. It also writes `shania.gate.session`:

```json
{ "verifiedAt": 1710000000000, "lastActivityAt": 1710000000000 }
```

Both fields are numbers. `verifiedAt` does not move when the person taps, types, or scrolls. `lastActivityAt` does.

Activity is `touchstart`, `pointerdown`, `keydown`, `scroll`, and `click`, listened to in the capture phase. `visibilitychange` is not activity. Writes to `lastActivityAt` are skipped when the last stored stamp is less than 5 seconds old, but the in-memory stamp still resets the idle timer. Hiding the page or `pagehide` writes the stamp immediately so a locked phone counts as idle.

The idle deadline is `lastActivityAt + INACTIVITY_MS`. The absolute deadline is `verifiedAt + ABSOLUTE_MS`. At an exact boundary the session is expired (`>=`). If both deadlines have passed, the notice uses the deadline that came first. An open page schedules both deadlines and also checks on load and when the page becomes visible again.

A verified flag with no usable session is treated as expired: the flag is cleared and the gate shows the expiry sentence. It does not post to ntfy, because there is no honest 15-minute or 60-minute reason.

## Expiry

Expiry clears `shania.gate.verified` and `shania.gate.session`. It does not restore a pending code. The current page adds `is-gated`, removes `is-verified`, sets `inert` on `#page-main`, unhides the gate, and shows:

`Sesi kamu habis, minta kode baru ya 😊`

The sentence stays, including across a reload, until the next code is accepted. The page does not reload.

One ntfy post uses the existing topic, `POST`, `mode: "cors"`, `keepalive: true`, no custom headers, title `Sesi verifikasi habis`, and priority `high`. The body states the reason and the WIB stamp:

- inactive: `Sesi habis karena tidak aktif 15 menit · {stamp}`
- absolute: `Sesi habis karena batas 60 menit · {stamp}`

The minute counts come from the durations that actually fired. The claim key is `shania.gate.expiryNotice`. Its value is the verification timestamp, so a second tab or a reload of the same verification does not post again. A later successful code writes a new `verifiedAt` and may notify once more. A failed post still locks the page.

The celebration player is paused and stopped. The same command is posted to the YouTube iframe origin. If the iframe API becomes ready after the lock, it does not autoplay.

`onUnlock` still starts the question, the dodge, the confetti, and the video once per page load. Entering a new code after expiry shows the page again without binding those controls a second time.

## Testing

`node --test` covers both boundaries, activity resetting only the idle clock, the earlier reason when both have passed, the single ntfy post, the legacy flag, and the player stop helper. A phone viewport of 390×844 loads the question with a shortened idle timer, waits until the gate returns, and checks the expiry sentence. ntfy is intercepted so the check does not publish.
