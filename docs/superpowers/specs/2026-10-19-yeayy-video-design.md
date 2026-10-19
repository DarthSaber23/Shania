# Yeayy video — design

Add the celebration clip to `yeayy.html` on the existing static site. GitHub Pages publishes the repository root with `.github/workflows/static.yml` and sends no `Content-Security-Policy` header, so a YouTube iframe is allowed. Do not add a CSP meta tag. Paths stay relative. No `package.json` and no build step.

This spec was written in a background run. The request already fixed the video, the placement, the autoplay fallback, and the viewports, so implementation continues from this document.

The clip is `https://youtu.be/tt6FPKyQamk` (`tt6FPKyQamk`, “It's so fluffy I'm gonna die!”). YouTube oEmbed returns an embeddable iframe for it. Runtime errors can still hide the player, so the page keeps a link fallback.

## Approaches

1. **Static iframe only.** `autoplay=1&playsinline=1` on `youtube-nocookie.com` is short, but the page cannot tell autoplay-with-sound failure from an embed block, and `iframe` `error` does not fire for player errors. Rejected.
2. **IFrame API plus a pure view reducer (chosen).** `js/player.mjs` decides the view. `js/app.mjs` loads `https://www.youtube.com/iframe_api`, creates the player with `host: https://www.youtube-nocookie.com`, and paints the view. Node tests cover the reducer and the markup without a browser.
3. **Muted autoplay first.** Mobile would more often start playback, but the request is to try sound first because Yes was just tapped. The gesture does not survive the navigation, so unmuted autoplay will usually fail and the fallback still matters. Rejected as the first attempt.

## Placement and look

On `yeayy.html` only, below the `Yeayy!` heading and the line `I'm so happyyy… I'm gonna die!`:

- A 16:9 frame, `width: min(100%, calc(46dvh * 16 / 9))`, centered, so portrait phones (360×800 and 375×812) use the card width and short landscape keeps the heading on screen.
- Corner radius `1.15rem` and `overflow: hidden`, in the same soft family as the card (`1.6rem`).
- Rose surface behind the player so a slow iframe is never a blank or broken rectangle.
- Confetti, floating hearts, dodge flow, and the other two pages stay as they are.

## Playback

Player vars: `autoplay=1`, `playsinline=1`, `rel=0`, `modestbranding=1`, `enablejsapi=1`. The iframe `allow` list includes `autoplay`. The frame title is “It's so fluffy I'm gonna die!”.

Views:

| View | When | What she sees |
| --- | --- | --- |
| `loading` | API or first play attempt still in flight | Rose frame and “Getting the video ready…” |
| `playing` | Player state is playing and not muted | Veil hidden, YouTube controls usable |
| `tap-for-sound` | Playing while muted | Video visible and a rose “Tap for sound” control |
| `tap-to-play` | Player exists, no embed error, still not playing after the muted attempt | Rose veil and a “Tap to play” button |
| `fallback` | API script fails, API never arrives, or player error 2, 5, 100, 101, or 150 | Copy plus a link to `https://www.youtube.com/watch?v=tt6FPKyQamk` |

The frame’s first paint is the rose surface and “Getting the video ready…”, already in the HTML, so the box is never empty while the module starts. The same watch link lives in that HTML, hidden until the view is `fallback`, and again inside `<noscript>` (with a style that hides the loading veil) so a browser with scripts disabled still has the link.

Sequence:

1. Try unmuted `playVideo` on ready.
2. If that has not reached playing after 2.5s, mute and call `playVideo` again.
3. If that has not reached playing after another 2.5s, show tap-to-play. The button’s gesture calls `unMute` and `playVideo`.
4. If playback starts muted, show tap-for-sound. That button calls `unMute` and `playVideo`.
5. If the API script errors or is not ready after 8s, or the player reports an error code above, show the fallback link.

`prefers-reduced-motion` still skips confetti. It does not block the video.

## Tests

`node --test` gains `test/player.test.mjs` for the embed URL, the watch URL, and each view transition. `test/site.test.mjs` checks that the player node sits after the happy line, the nocookie host and `playsinline` are present, the CSS keeps 16:9 and the radius, and no CSP meta tag is introduced. Existing dodge and confetti tests stay green.

## Out of scope

Changing the question or the sure page, adding a build, merging the pull request, and hosting the video file in the repo.
