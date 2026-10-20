# Shania

A mobile-first static page that asks Shania a question. It needs no build step.

`index.html` asks the question. Yes opens `yeayy.html`. No jumps away on tap, and its label goes from No to Are you sure?, Think again, Pleaseee, and Last chance. The fifth press opens `sure.html`, where Yes is the button that keeps moving and No returns to the question, which loads again with the counter at zero and the label No. `yeayy.html` plays the celebration clip (`tt6FPKyQamk`) inline from the privacy-enhanced YouTube host. If sound is blocked, the page asks for a tap; if the embed cannot load, it links to the video. An empty `.nojekyll` file is included so Pages serves those files as-is. `manifest.webmanifest` plus the PNG icons let the page be added to a phone home screen.

Pushes to `main` run `.github/workflows/static.yml`, which uploads the repository root and deploys it to GitHub Pages. After that workflow succeeds, the site is at [https://darthsaber23.github.io/Shania/](https://darthsaber23.github.io/Shania/).

The Next.js Pages workflow was removed. This repository has no Next.js app, so that workflow failed on every push and shared the Pages deployment with the static workflow.
