# Shania

A mobile-first static page served by GitHub Pages.

`index.html` lives at the repository root. It uses inline CSS and a short inline script, and needs no build step. On a phone it switches between Home, Note, About, and Install. The note and color choice stay in that browser. An empty `.nojekyll` file is included so Pages serves those files as-is. `manifest.webmanifest` plus the PNG icons let the page be added to a phone home screen.

Pushes to `main` run `.github/workflows/static.yml`, which uploads the repository root and deploys it to GitHub Pages. After that workflow succeeds, the site is at [https://darthsaber23.github.io/Shania/](https://darthsaber23.github.io/Shania/).

The Next.js Pages workflow was removed. This repository has no Next.js app, so that workflow failed on every push and shared the Pages deployment with the static workflow.
