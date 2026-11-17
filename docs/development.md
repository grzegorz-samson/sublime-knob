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

Browser checks use Chromium. Install it for a local run with `npx playwright install chromium`. GitHub Actions installs Chromium in the CI job.

An installed Microsoft Edge can be used instead by setting `PLAYWRIGHT_CHANNEL=msedge` before running the browser checks. Tests inspect the production build at `/sublime-knob/`, including the rendered audio during a main-knob gesture. They do not require a physical audio-output device.

Keep changes within the exhibition scope. Do not add workshop, electronics-simulator, source-model, or private research material to this public-ready tree. Keep third-party license notices with dependencies and do not infer reuse rights for original artwork or assets from the presence of this repository.
