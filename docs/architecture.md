# Architecture

The exhibition is a static Vite application. Its interactive state and animation run in the visitor's browser; it has no backend, shared worker, network synchronization, or electronics-lab simulation.

## Runtime

- `src/app.js` connects the interface to the instrument controller.
- `src/instrument/` owns state, input handling, audio, the 3D scene, the illustrated panel, and audio controls.
- `src/viewer/` contains model theme and cover interaction behavior.
- `src/ui/` contains language and theme preferences, the control drawer, gallery, and loading feedback.
- `src/styles/` holds presentation styles.
- `public/media/` contains the optimized GLB model and WebP exhibition images.
- `index.html` is the application entry point.

The controller updates the display and tone locally. The 3D view uses a requestAnimationFrame render loop. Audio is initialized on the first user gesture and frequency changes are smoothed over 25 ms. Browser storage may retain display preferences; no visitor data is sent to a service.

## Exhibition scope

The published build presents the instrument and its physical controls. It includes 2D and 3D interaction, interior inspection, gallery, language and theme choices, mobile layout, and tone playback. Source material, workshop files, electronics simulation, and development-only research are outside this repository.

## Production assets

Vite copies `public/` assets and bundles application code into `dist/`. The Vite base path is `/sublime-knob/` for a project Pages site. The public-output check prevents excluded or development-only material from entering the deployment artifact.
