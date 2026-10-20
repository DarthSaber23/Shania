# Verification gate — design

Shania should see a gate before the question, the sure page, or the celebration when this browser is not verified yet. The gate sends an 8-character code to the existing ntfy topic so it can be read aloud to her. The site stays static, mobile-first, and in the current rose palette. This spec was written in a background run from a request that already fixed the copy, the transport, and the storage rules.

## Approaches

1. **Hide `main` with a class and put the fetch calls in `js/app.mjs`.** Smallest file count, but `app.mjs` runs against the DOM on import, so `node --test` cannot exercise the code, the cooldown, or the failure path.
2. **`js/gate.mjs` plus a gate card in each HTML file (chosen).** Code generation, the pending record, the cooldown, matching, and the ntfy posts live in a module that takes `fetch`, `localStorage`, a clock, and `crypto.getRandomValues`. A tiny inline script in `head` sets `is-gated` or `is-verified` before first paint. `app.mjs` mounts the gate and starts the existing page only after unlock.
3. **One shared gate document that redirects.** Breaks direct visits to `sure.html` and `yeayy.html` unless those pages still embed the gate, and it adds a navigation the current site does not use.

## Gate

Unverified visits to `index.html`, `sure.html`, and `yeayy.html` show the gate card instead of the page. The main card stays in the DOM with `inert` and is hidden. The floating hearts stay.

The first screen has the button text `Kirim kode verifikasi`. After a code is sent, or restored from storage, the card shows:

- a text field for the code
- the note `Kode belum masuk? Chat Fajar di WhatsApp ya 😊` directly under the field
- a gentle mismatch message
- `Kirim ulang kode`, disabled during the cooldown
- a visible countdown, `Kirim ulang dalam 1:00` down to `0:01`

User-facing sentences use Fajar, never Radit. `WA_NUMBER` in `js/gate.mjs` is `""`. When it stays empty, the note is plain text. When it contains a number, the same sentence becomes a link to `https://wa.me/` plus the digits only, opening in a new tab.

## Code

The alphabet is `A-Z`, `a-z`, and `0-9`. `crypto.getRandomValues` fills 8 bytes. Each character is `alphabet[byte % 62]`. A new successful send replaces the pending record, so only the newest code matches. Comparison trims surrounding whitespace and is case-sensitive. An empty field does not notify ntfy.

The pending record is JSON in `localStorage` under `shania.gate.pending`:

```json
{ "code": "Ab12Cd34", "cooldownUntil": 1710000060000 }
```

`cooldownUntil` is 60 seconds after the successful send. A refresh keeps that code and the remaining cooldown. A failed send does not write the record and does not clear the previous code.

A match sets `shania.gate.verified` to `1`, removes the pending record, and reveals the page. The flag stays until storage is cleared.

## Notifications

Topic: `https://ntfy.sh/shania-radit-766350e890617d63`

The code post uses `fetch` with `method: "POST"`, `mode: "cors"`, and `keepalive: true`. No custom headers. The query sets `title` to `Kode verifikasi Shania` and `priority` to `high`. The body is `Kode: {code} · {WIB stamp}`.

A non-empty mismatch posts `title` `Kode verifikasi salah`, `priority` `high`, and body `Shania memasukkan kode yang tidak cocok · {WIB stamp}`. The typed guess is not included. The card shows the gentle error without waiting for that post.

Before a code is published, the gate probes `localStorage.setItem`. If that throws, nothing is posted and the previous code stays. If the code post throws or returns a non-OK response, the gate stays up and shows `Kodenya belum terkirim. Chat Fajar di WhatsApp ya 😊`. The same WhatsApp wording is used when storage cannot be written. The mismatch message stays `Kodenya belum cocok. Coba lagi pelan-pelan ya.` even if the mismatch post fails.

The existing page-open, No, sure, and Yes notifications are unchanged and run only after the page is revealed. An already verified visit boots the current page immediately, so the open notification still fires on the question page.

## Testing

`node --test` covers the alphabet, persistence, cooldown, newest-code rule, WhatsApp link, and both ntfy posts with an injected `fetch`. A headless phone viewport (390×844) checks the gate, the countdown, the mismatch, and the unlocked question. Those checks intercept ntfy so they do not publish to the live topic.
