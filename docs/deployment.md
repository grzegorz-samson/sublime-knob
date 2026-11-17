# GitHub Pages deployment (not yet published)

This worktree is prepared for a future project site at <https://grzegorz-samson.github.io/sublime-knob/>. No repository has been published or pushed as part of this preparation.

## One-time repository setup

1. Create or select the GitHub repository `sublime-knob` under `grzegorz-samson`.
2. Add this prepared exhibition history and push only its intended `main` branch. Do not push the original private source branch or all local branches.
3. In **Settings → Pages**, set the build and deployment source to **GitHub Actions**.

## Build and publish

The CI workflow validates pushes and pull requests; it does not publish. The Pages workflow has no push or pull-request trigger. When publication is intended, run **Deploy GitHub Pages** manually and set its `deploy` input to `true`. With the default `false`, the deployment jobs are skipped.

The workflow builds the static site, uploads only `dist/`, and deploys it with the official Pages actions. It grants read-only repository contents to the build job, and Pages write plus OIDC token permissions only to the deployment job. The Vite base path must remain `/sublime-knob/` for this project URL.

The project-path configuration follows [Vite's GitHub Pages guide](https://vite.dev/guide/static-deploy.html#github-pages); the future deployment uses [GitHub's custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Before a future publication, review the generated artifact and confirm that the repository and all included model, image, and code rights are cleared for that use. This documentation does not grant additional rights.
