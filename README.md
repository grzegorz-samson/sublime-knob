# Sublime Knob

An interactive exhibition presentation of the Sublime Knob instrument. Explore its exterior and interior in 3D, inspect the recreated control panel, and hear the pitch change as you turn the main control.

**Live presentation:** <https://grzegorz-samson.github.io/sublime-knob/> (after a future deployment)

The page supports English and Polish, light and dark themes, a product gallery, an interactive 2D panel, and a 3D view with close-up and interior controls. Audio starts after the visitor's first interaction, as required by browser audio policies. The controls and tone are a local presentation; the exhibition build has no electronics simulator, shared worker, backend, or lab synchronization.

## Run locally

Requirements: Node.js 22.12 or later and npm.

```sh
npm ci
npm run dev
```

Vite prints the local address. To create and inspect a production build, use `npm run build` and `npm run preview`.

## Project map

- `src/` — application, instrument interaction, 3D viewer, and styles
- `public/media/` — optimized model and exhibition imagery
- `tests/` — unit and browser checks
- `docs/` — architecture, development, and future deployment notes
- `.github/workflows/` — validation and manually gated Pages deployment

See [Development](docs/development.md) for commands and [Deployment](docs/deployment.md) for the unpublished GitHub Pages setup.

The [preparation review](docs/review.md) records the cleanup, verification, and the remaining development-tool dependency advisory.

## Credits

Artistic supervision: Dr Krzysztof Cybulski

Instrument and presentation: Grzegorz Samson

Feliks Nowowiejski Academy of Music in Bydgoszcz

## Rights

This project is not offered under an open-source license. All rights to the application, instrument model, photographs, and other original project assets are reserved by their respective rights holders. Third-party components retain their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md). No reuse permission for the original project material is granted by this repository.
