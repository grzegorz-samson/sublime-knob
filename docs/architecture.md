# Architecture

The exhibition is a static Vite application. Instrument state, interaction, animation, and audio run in the visitor's browser.

## Runtime

- `src/app.js` connects the controller, audio, panel, and optional 3D viewer.
- `src/instrument/` owns instrument state, preset timing, audio, physical-control interactions, the illustrated panel, and audio controls.
- `src/viewer/` owns the WebGL view, camera, model theme, and cover interactions.
- `src/ui/` contains language and theme preferences, fullscreen behavior, the control drawer, gallery, and loading feedback.
- `src/styles/` holds presentation styles.
- `public/media/` contains the optimized GLB model and WebP exhibition images.
- `index.html` is the application entry point.

The controller updates the display and tone locally. Its animation clock advances preset recall while the motor is moving. The 3D viewer has its own render loop for camera, cover, and control animation. Both clocks pause when the document is hidden.

The 2D panel and audio controls initialize before the optional 3D module. They remain usable while the model loads or when WebGL, the model file, or the graphics context is unavailable. The viewer receives the current state and encoder rotations when it becomes ready.

Audio starts on the first user gesture and frequency changes use a 25 ms smoothing time constant. Language and theme preferences are stored in localStorage; presets remain in memory for the current page.

## Production assets

Vite copies `public/` assets and bundles application code into `dist/`. Three.js and application code use separate bundles. The Vite base path is `/sublime-knob/` for the project Pages site. `scripts/check-public.mjs` defines the allowed deployment files.
