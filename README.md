# Shania

A static page served by GitHub Pages.

`index.html` lives at the repository root. It uses inline CSS and needs no build step. An empty `.nojekyll` file is included so Pages serves those files as-is.

Pushes to `main` run `.github/workflows/static.yml`, which uploads the repository root and deploys it to GitHub Pages. After that workflow succeeds, the site is at [https://darthsaber23.github.io/Shania/](https://darthsaber23.github.io/Shania/).

The Next.js Pages workflow was removed. This repository has no Next.js app, so that workflow failed on every push and shared the Pages deployment with the static workflow.
