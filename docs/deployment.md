# GitHub Pages

Project address: <https://grzegorz-samson.github.io/sublime-knob/>.

## One-time repository setup

1. Create or select the GitHub repository `sublime-knob` under `grzegorz-samson`.
2. Use `main` as the repository's default branch.
3. In **Settings → Pages**, set the build and deployment source to **GitHub Actions**.

## Build and publish

Run **Deploy GitHub Pages** from the Actions tab and set its `deploy` input to `true`. The workflow runs manually; its default `false` value skips deployment. CI runs separately on pushes and pull requests.

The workflow builds the static site, uploads only `dist/`, and deploys it with the official Pages actions. It grants read-only repository contents to the build job, and Pages write plus OIDC token permissions only to the deployment job. The Vite base path must remain `/sublime-knob/` for this project URL.

References: [Vite's GitHub Pages guide](https://vite.dev/guide/static-deploy.html#github-pages) and [GitHub's custom Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
