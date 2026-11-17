# Development

Use Node.js 22.12 or later with npm. Install the lockfile-defined dependencies with `npm ci`.

| Command                | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `npm run dev`          | Start the local Vite server                                         |
| `npm run build`        | Create the production site in `dist/`                               |
| `npm run preview`      | Serve the production build locally                                  |
| `npm test`             | Run Node.js unit tests                                              |
| `npm run check`        | Check the public deployment contents                                |
| `npm run test:browser` | Run Playwright browser checks                                       |
| `npm run format`       | Apply the shared source formatting                                  |
| `npm run format:check` | Check source formatting without editing files                       |
| `npm run validate`     | Check formatting, tests, build, public output, and browser behavior |

Browser checks run against Chromium, Firefox, and WebKit. Install their browser binaries locally with `npx playwright install chromium firefox webkit`; GitHub Actions installs the browsers and Linux runtime dependencies in CI.

The responsive-layout check runs at a narrow viewport in all three engines. A separate touch-activation check uses real Playwright touch input in Chromium and WebKit. Firefox's narrow-viewport run does not emulate a touch device because Playwright Firefox does not support the `isMobile` context option. Audio-output checks run when an engine exposes `AudioContext` or `webkitAudioContext`; otherwise tests verify the disabled unavailable-audio control while continuing the 2D and viewer-fallback checks. To run the Chromium project with an installed Microsoft Edge, set `PLAYWRIGHT_CHANNEL=msedge` before running the browser checks.
