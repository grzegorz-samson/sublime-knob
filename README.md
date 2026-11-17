# Sublime Knob

An interactive exhibition presentation of the Sublime Knob instrument. Explore its exterior and interior in 3D, use the control panel, and hear the pitch change as you turn the main control.

**Project address:** <https://grzegorz-samson.github.io/sublime-knob/>

The page supports English and Polish, light and dark themes, a product gallery, an interactive 2D panel, and a 3D view with close-up and interior controls. Audio starts with the visitor's first interaction. The 2D controls and sound remain available when the 3D view cannot be displayed.

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
- `docs/` — architecture, development, and deployment
- `.github/workflows/` — validation and manually gated Pages deployment

See [Development](docs/development.md) for commands and [Deployment](docs/deployment.md) for GitHub Pages configuration.

## Credits

Artistic supervision: Dr Krzysztof Cybulski

Instrument and presentation: Grzegorz Samson

Feliks Nowowiejski Academy of Music in Bydgoszcz

## Rights

This project is not offered under an open-source license. All rights to the application, instrument model, photographs, and other original project assets are reserved by their respective rights holders. Third-party components retain their own licenses; see [Third-party notices](THIRD_PARTY_NOTICES.md). No reuse permission for the original project material is granted by this repository.
