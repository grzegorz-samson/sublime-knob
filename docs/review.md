# Publication preparation review

Reviewed on 17 November 2026. This checkout contains the exhibition presentation only.

## Changes

- Removed the technical viewer, circuit simulator, component explorer, private documents, source-model files, and their dependency graph from the prepared repository.
- Replaced the cross-tab worker/session layer with a small page-local instrument controller. Preset recall advances on animation frames and stops rendering when the instrument settles.
- Separated instrument state, audio, physical controls, viewer interactions, interface preferences, and styles into focused modules.
- Removed the hidden legacy controls and unused technical styles. The actual exhibition remains intact, including the visual interior of the instrument.
- Corrected Reset so it returns through the camera transition instead of jumping to an obsolete camera position after resizing.
- Replaced manual cache-query versions and the bundled vendor directory with pinned npm dependencies, a lockfile, and Vite production asset hashes. Three.js remains at r180 to preserve the approved rendering and is cached separately from application code.
- Corrected model, gallery, texture, and script paths for the project URL `/sublime-knob/`. Production loading messages no longer refer to a local server.
- Added a publication allowlist: the build check rejects unexpected public files, technical runtime references, and development diagnostics in the production output.
- Prepared a new root history containing only this tree. The original development branch remains separate in the source checkout.

## Verification

- Shared Prettier formatting check passes.
- 19 Node.js state/audio/controller tests pass.
- Six production browser tests pass in Microsoft Edge, including EN/PL, theme persistence, preset recall, gallery reload, fullscreen, mobile layout, press feedback, and a native audio recording during a main-knob gesture.
- Production requests were checked under `/sublime-knob/`; model and photographs load without missing-resource errors.
- Desktop, dark-theme, gallery, and mobile screenshots were reviewed locally.
- The generated output contains only the exhibition entry point, bundled application/Three.js/styles, explicitly listed media, favicon, and required license notice.

These checks use the browser audio graph; they do not verify a particular speaker or physical audio device. GitHub Actions and the remote Pages configuration have not been executed or changed.

## Dependency audit

`npm audit --omit=dev` reports **zero vulnerabilities**. The full audit reports the same unpatched [picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) through four development-tool packages in Vite's file-pattern matching chain. It concerns attacker-supplied glob patterns in a Node.js process. These packages are absent from the static website and do not execute for visitors. Vite remains pinned to 8.3.8; the advisory currently lists no upstream patched version. Build/validation jobs have explicit time limits. Recheck the tooling audit when upgrading dependencies.

## Deployment status

No push or publication was performed. CI validates changes without deploying. The Pages workflow runs only when manually requested with its deployment input enabled; it uploads `dist/` rather than the repository tree.
