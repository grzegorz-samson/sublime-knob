import { test, expect } from '@playwright/test';

async function openInstrument(page, suffix = '') {
  await page.goto(`./${suffix}`);
  await expect(page.locator('#exhibition-zoom')).toBeEnabled();
  await expect(page.locator('#model-error')).toBeHidden();
}

async function expectUnavailableWithWorking2D(page) {
  const viewer = page.locator('.viewer-section');
  await expect(viewer).toHaveAttribute('data-viewer-state', 'unavailable');
  await expect(page.locator('#model-error')).toBeVisible();
  await expect(viewer.locator('[data-view="inside"]')).toBeDisabled();
  await expect(viewer.locator('[data-view="display"]')).toBeDisabled();
  await expect(viewer.locator('#reset-view')).toBeDisabled();
  await expect(page.locator('.viewer-section > .instrument-panel')).toBeVisible();

  const tune = page.locator('.exhibition-hardware--tune button');
  await tune.press('ArrowUp');
  await expect(page.locator('.exhibition-lcd')).toContainText('+1');
  await tune.click({ modifiers: ['Control'] });
  await expect(page.locator('.exhibition-lcd')).toContainText('+0');
  await tune.press('Enter');
  await expect(page.locator('.exhibition-lcd')).toContainText('25c');

  await page.locator('.exhibition-hardware--preset button').press('ArrowUp');
  await expect(page.locator('.exhibition-lcd')).toContainText('SET:01');
  await page.locator('.exhibition-recall').click();
  await expect(page.locator('.exhibition-lcd span').first()).toHaveText('00134Hz SET:01');

  if (await hasWebAudio(page)) {
    await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => measureInstrumentRms(page)).toBeGreaterThan(0.005);
    await page.locator('#audio-toggle').click();
    await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => measureInstrumentRms(page)).toBeLessThan(0.005);
  } else {
    await expect(page.locator('#audio-toggle')).toBeDisabled();
    await expect(page.locator('.audio-button-label')).toHaveText('Audio unavailable');
  }
}

async function hasWebAudio(page) {
  return page.evaluate(() => Boolean(window.AudioContext || window.webkitAudioContext));
}

async function measureInstrumentRms(page) {
  return page.evaluate(() => {
    const analyser = window.__instrumentAnalysers?.[0];
    if (!analyser) return 0;
    const samples = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  });
}

async function captureInstrumentAudio(page) {
  await page.addInitScript(() => {
    const Audio = window.AudioContext ?? window.webkitAudioContext;
    window.__instrumentAnalysers = [];
    if (!Audio) return;
    const createAnalyser = Audio.prototype.createAnalyser;
    Audio.prototype.createAnalyser = function (...args) {
      const analyser = createAnalyser.apply(this, args);
      analyser.fftSize = 2048;
      window.__instrumentAnalysers.push(analyser);
      return analyser;
    };
  });
}

test('production starts in English at the project path with no technical features', async ({
  page,
}) => {
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  await openInstrument(page, '?mode=technical');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'exhibition');
  await expect(
    page.locator('[data-technical], #main-position, .component-explorer, a[href*="lab/"]'),
  ).toHaveCount(0);
  await expect(page.locator('#stage canvas')).toBeVisible();
  expect(
    await page.evaluate(() => [typeof window.viewerState, typeof window.viewerPerformance]),
  ).toEqual(['undefined', 'undefined']);
  expect(failures).toEqual([]);
});

test('language, theme, LCD view, panel encoders and press feedback work', async ({ page }) => {
  await openInstrument(page);
  const tune = page.locator('.exhibition-hardware--tune button');
  await tune.press('ArrowUp');
  await expect(page.locator('.exhibition-lcd')).toContainText('+1');
  await tune.click({ modifiers: ['Control'] });
  await expect(page.locator('.exhibition-lcd')).toContainText('+0');
  await tune.press('Enter');
  await expect(page.locator('.exhibition-lcd')).toContainText('25c');
  const recall = page.locator('.exhibition-recall');
  await recall.hover();
  await page.mouse.down();
  await expect(recall).toHaveClass(/is-pressed/);
  await page.mouse.up();
  await expect(recall).not.toHaveClass(/is-pressed|is-click-pulse/);
  await page.locator('#exhibition-zoom').click();
  await expect(page.locator('#exhibition-zoom')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-view="inside"]').click();
  await expect(page.locator('[data-view="inside"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#reset-view').click();
  await expect(page.locator('[data-view="front"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#exhibition-language').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.locator('#exhibition-language')).toHaveText('PL');
  await page.locator('#exhibition-theme').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pl');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('preset recall advances the local motor and settles', async ({ page }) => {
  await openInstrument(page);
  await page.locator('.exhibition-hardware--preset button').press('ArrowUp');
  await expect(page.locator('.exhibition-lcd')).toContainText('SET:01');
  const before = await page.locator('.exhibition-lcd span').first().textContent();
  await page.locator('.exhibition-recall').click();
  await expect(page.locator('.exhibition-lcd span').first()).not.toHaveText(before);
  await expect(page.locator('.exhibition-lcd span').first()).toHaveText('00134Hz SET:01');
});

test('gallery loads only published photographs and returns to the instrument', async ({ page }) => {
  await openInstrument(page);
  const navigation = page.locator('#gallery-nav');
  const navigationWidth = (await navigation.boundingBox()).width;
  await expect(navigation).toHaveAccessibleName('Gallery');
  await navigation.click();
  await expect(navigation).toHaveAccessibleName('Home');
  expect((await navigation.boundingBox()).width).toBe(navigationWidth);
  await expect(page.locator('.viewer-section')).toBeHidden();
  for (const image of await page.locator('.gallery-image img').all()) {
    await expect.poll(() => image.evaluate((node) => node.naturalWidth)).toBeGreaterThan(0);
    expect(await image.getAttribute('src')).toMatch(/^\/sublime-knob\/media\/gallery\//);
  }
  await page.locator('.gallery-image').first().click();
  await expect(page.locator('.gallery-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.gallery-dialog')).toBeHidden();
  await page.reload();
  await expect(page.locator('.exhibition-gallery')).toBeVisible();
  for (const image of await page.locator('.gallery-image img').all()) {
    await image.evaluate((node) => node.decode());
  }
  await expect(navigation).toHaveAccessibleName('Home');
  await page.locator('#exhibition-language').click();
  await expect(navigation).toHaveAccessibleName('Start');
  expect((await navigation.boundingBox()).width).toBe(navigationWidth);
  await navigation.click();
  await expect(page.locator('#stage canvas')).toBeVisible();
  await expect(navigation).toHaveAccessibleName('Galeria');
});

test('fullscreen hides the 2D panel and restores its layout on exit', async ({ page }) => {
  await openInstrument(page);
  const fullscreen = page.locator('#fullscreen-toggle');
  const panelFace = page.locator('.exhibition-face');
  const handle = page.locator('#parameter-handle');
  const measureAudio = () =>
    page.evaluate(() => {
      const audio = document.querySelector('#exhibition-aux');
      const slider = document.querySelector('#audio-volume');
      return {
        width: audio.getBoundingClientRect().width,
        icon: audio.querySelector('.audio-symbol').getBoundingClientRect().width,
        text: getComputedStyle(document.querySelector('#audio-toggle')).fontSize,
        slider: slider.getBoundingClientRect().width,
        thumb: getComputedStyle(slider).getPropertyValue('--range-thumb-size').trim(),
      };
    });
  const standardAudio = await measureAudio();
  const expectFullStage = async ({ inlineAudio }) => {
    await expect(fullscreen).toHaveAttribute('aria-pressed', 'true');
    await expect(panelFace).toBeHidden();
    await expect(handle).toBeHidden();
    await expect(page.locator('#stage canvas')).toBeVisible();
    await expect(
      page.locator(
        inlineAudio ? '.viewer-toolbar > #exhibition-aux' : '.viewer-section > #exhibition-aux',
      ),
    ).toBeVisible();
    expect(await measureAudio()).toEqual(standardAudio);
    if (inlineAudio) {
      const aligned = await page.evaluate(() => {
        const centerY = (selector) => {
          const { top, height } = document.querySelector(selector).getBoundingClientRect();
          return top + height / 2;
        };
        const centers = [
          centerY('.view-tab'),
          centerY('#audio-toggle'),
          centerY('#audio-volume'),
          centerY('#fullscreen-toggle'),
        ];
        return Math.max(...centers) - Math.min(...centers) < 1;
      });
      expect(aligned).toBe(true);
    }
    await expect
      .poll(() =>
        page.evaluate(() => {
          const viewer = document.querySelector('.viewer-section').getBoundingClientRect();
          const toolbar = document.querySelector('.viewer-toolbar').getBoundingClientRect();
          const stage = document.querySelector('#stage').getBoundingClientRect();
          return (
            Math.abs(stage.width - viewer.width) < 1 &&
            Math.abs(stage.top - toolbar.bottom) < 1 &&
            Math.abs(stage.bottom - viewer.bottom) < 1
          );
        }),
      )
      .toBe(true);
  };
  const measure = () =>
    page.evaluate(() => {
      const panel = document.querySelector('.exhibition-face');
      const face = panel.getBoundingClientRect();
      const lcd = panel.querySelector('.exhibition-lcd').getBoundingClientRect();
      const topScrew = panel.querySelector('.panel-screw--top-left').getBoundingClientRect();
      const recall = panel.querySelector('.exhibition-hardware--recall').getBoundingClientRect();
      const encoder = panel.querySelector('.exhibition-hardware--preset').getBoundingClientRect();
      const tune = panel.querySelector('.exhibition-hardware--tune').getBoundingClientRect();
      const hints = panel.querySelector('.exhibition-hints').getBoundingClientRect();
      return {
        width: face.width,
        height: face.height,
        bottom: face.bottom,
        lcdGap: lcd.top - 8 - topScrew.bottom,
        recallGap: encoder.top - recall.bottom,
        encoderGap: encoder.left - tune.right,
        recallAlignment: recall.x + recall.width / 2 - (encoder.x + encoder.width / 2),
        hintsSpanPanel:
          hints.left < tune.left && hints.right > encoder.right && hints.bottom <= recall.top,
        controls: [...panel.querySelectorAll('.exhibition-lcd, .exhibition-hardware')].map(
          (node) => {
            const { width, height, bottom } = node.getBoundingClientRect();
            return { width, height, bottom };
          },
        ),
        screws: [...panel.querySelectorAll('.panel-screw')].map((node) => {
          const rect = node.getBoundingClientRect();
          return {
            size: rect.width,
            horizontalInset: Math.round(Math.min(rect.left - face.left, face.right - rect.right)),
            verticalInset: Math.round(Math.min(rect.top - face.top, face.bottom - rect.bottom)),
          };
        }),
      };
    });
  const side = await measure();
  expect(side.height).toBeLessThanOrEqual(560);
  expect(side.width).toBeGreaterThan(260);
  expect(side.lcdGap).toBeGreaterThanOrEqual(7);
  expect(side.recallGap).toBeGreaterThanOrEqual(23);
  expect(side.hintsSpanPanel).toBe(true);

  await fullscreen.click();
  await expectFullStage({ inlineAudio: true });
  await fullscreen.click();
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#parameter-drawer .exhibition-face')).toBeVisible();

  await handle.click();
  const wide = await measure();
  expect(wide.width / wide.height).toBeGreaterThan(2);
  expect(wide.width).toBeLessThanOrEqual(720);
  expect(wide.height).toBeLessThan(240);
  expect(wide.encoderGap).toBeCloseTo(24);
  expect(wide.recallAlignment).toBeCloseTo(0);
  const controlSizes = (panel) => panel.controls.map(({ width, height }) => [width, height]);
  expect(controlSizes(wide)).toEqual(controlSizes(side));
  expect(wide.controls.every(({ bottom }) => bottom < wide.bottom)).toBe(true);
  expect(wide.screws).toHaveLength(4);
  expect(wide.screws).toEqual(side.screws);
  for (const screw of wide.screws) {
    expect(screw).toEqual(wide.screws[0]);
    expect(screw.horizontalInset).toBe(screw.verticalInset);
  }
  await page.evaluate(() => {
    Object.defineProperty(document, 'fullscreenEnabled', { value: false });
  });
  await fullscreen.click();
  await expect(page.locator('.viewer-section')).toHaveClass(/is-expanded/);
  await expectFullStage({ inlineAudio: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expectFullStage({ inlineAudio: false });
  await page.keyboard.press('Escape');
  await expect(fullscreen).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.viewer-section > .instrument-panel')).toBeVisible();

  await expect(page.locator('#exhibition-zoom')).toBeEnabled();
  await expect(page.locator('#parameter-handle')).toBeHidden();
  await expect(page.locator('.viewer-section > .instrument-panel')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const mobile = await measure();
  expect(controlSizes(mobile)).toEqual(controlSizes(side));
  expect(mobile.screws).toEqual(side.screws);
  expect(mobile.lcdGap).toBeGreaterThanOrEqual(7);
  expect(mobile.recallGap).toBeGreaterThanOrEqual(23);
  expect(mobile.hintsSpanPanel).toBe(true);
  await fullscreen.click();
  await expectFullStage({ inlineAudio: false });
  await fullscreen.click();
  await expect(panelFace).toBeVisible();
  await page.locator('.exhibition-recall').click();
  await expect(page.locator('.exhibition-recall')).not.toHaveClass(/is-pressed|is-click-pulse/);
});

test('the first touch on a control starts audible playback', async ({ browser, browserName }) => {
  test.skip(
    browserName === 'firefox',
    'Playwright Firefox does not support the isMobile context option; touch activation is tested in Chromium and WebKit.',
  );
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobile = await context.newPage();
  try {
    await captureInstrumentAudio(mobile);
    await mobile.goto('http://127.0.0.1:4173/sublime-knob/');
    await expect(mobile.locator('#exhibition-zoom')).toBeEnabled();
    test.skip(
      !(await hasWebAudio(mobile)),
      'This Playwright browser build does not expose the Web Audio API.',
    );
    expect(await measureInstrumentRms(mobile)).toBe(0);
    await mobile.locator('.exhibition-hardware--tune button').tap();
    await expect(mobile.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => measureInstrumentRms(mobile)).toBeGreaterThan(0.005);
    await mobile.locator('#audio-toggle').tap();
    await expect(mobile.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => measureInstrumentRms(mobile)).toBeLessThan(0.005);
  } finally {
    await context.close();
  }
});

test('2D controls remain usable when WebGL is unavailable', async ({ page }) => {
  await captureInstrumentAudio(page);
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (['webgl2', 'webgl', 'experimental-webgl'].includes(type)) return null;
      return getContext.call(this, type, ...args);
    };
  });
  await page.goto('./');
  await expectUnavailableWithWorking2D(page);
});

test('2D controls remain usable when the model request fails', async ({ page }) => {
  await captureInstrumentAudio(page);
  await page.route('**/media/sublime-knob.glb', (route) => route.fulfill({ status: 404 }));
  await page.goto('./');
  await expectUnavailableWithWorking2D(page);
});

test('2D controls remain usable when the Three.js module fails to load', async ({ page }) => {
  await captureInstrumentAudio(page);
  await page.route('**/assets/three-*.js', (route) => route.abort('failed'));
  await page.goto('./');
  await expectUnavailableWithWorking2D(page);
});

test('2D controls remain usable after WebGL context loss', async ({ page }) => {
  await captureInstrumentAudio(page);
  await openInstrument(page);
  const contextLost = page.evaluate(
    () =>
      new Promise((resolve) => {
        const canvas = document.querySelector('#stage canvas');
        canvas.addEventListener('webglcontextlost', () => resolve(true), { once: true });
        const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
        const extension = gl?.getExtension('WEBGL_lose_context');
        if (!extension) resolve(false);
        else extension.loseContext();
      }),
  );
  expect(await contextLost).toBe(true);
  await expectUnavailableWithWorking2D(page);
});

test('2D controls and audio work before a delayed model finishes loading', async ({ page }) => {
  await captureInstrumentAudio(page);
  let loaded = false;
  await page.route('**/media/sublime-knob.glb', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 5000));
    loaded = true;
    await route.fulfill({ response });
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.viewer-section')).toHaveAttribute('data-viewer-state', 'loading');
  await expect(page.locator('.exhibition-panel')).toBeVisible();
  await expect(page.locator('#exhibition-zoom')).toBeDisabled();
  const tune = page.locator('.exhibition-hardware--tune button');
  await tune.press('ArrowUp');
  await expect(page.locator('.exhibition-lcd')).toContainText('+1');
  await tune.click({ modifiers: ['Control'] });
  await page.locator('.exhibition-hardware--preset button').press('ArrowUp');
  await page.locator('.exhibition-recall').click();
  await expect(page.locator('.exhibition-lcd span').first()).toHaveText('00134Hz SET:01');
  if (await hasWebAudio(page)) {
    await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => measureInstrumentRms(page)).toBeGreaterThan(0.005);
    await page.locator('#audio-toggle').click();
    await expect(page.locator('#audio-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => measureInstrumentRms(page)).toBeLessThan(0.005);
  } else {
    await expect(page.locator('#audio-toggle')).toBeDisabled();
    await expect(page.locator('.audio-button-label')).toHaveText('Audio unavailable');
  }
  await expect(page.locator('#exhibition-zoom')).toBeEnabled({ timeout: 10000 });
  expect(loaded).toBe(true);
  await expect(page.locator('.exhibition-lcd span').first()).toHaveText('00134Hz SET:01');
});

test('starting from the gallery lets the hidden viewer reach ready without rendering first', async ({
  page,
}) => {
  await page.goto('./#gallery', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.viewer-section')).toHaveAttribute('data-viewer-state', 'ready');
  await expect(page.locator('#exhibition-gallery')).toBeVisible();
  await expect(page.locator('.viewer-section')).toBeHidden();
  await expect(page.locator('#model-error')).toBeHidden();
});

test('a timed-out viewer stays unavailable when its model arrives late', async ({ page }) => {
  await captureInstrumentAudio(page);
  await page.addInitScript(() => {
    const setTimeoutNative = window.setTimeout;
    window.setTimeout = function (callback, delay, ...args) {
      return setTimeoutNative.call(this, callback, delay === 20000 ? 1000 : delay, ...args);
    };
  });
  let finishModelDelivery;
  const modelDelivered = new Promise((resolve) => {
    finishModelDelivery = resolve;
  });
  await page.route('**/media/sublime-knob.glb', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.fulfill({ response });
    finishModelDelivery();
  });
  await page.goto('./', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.viewer-section')).toHaveAttribute('data-viewer-state', 'unavailable');
  await expect(page.locator('#model-error')).toBeVisible();
  await expect(page.locator('#stage canvas')).toHaveCount(0);
  await modelDelivered;
  await page.waitForTimeout(50);
  await expect(page.locator('.viewer-section')).toHaveAttribute('data-viewer-state', 'unavailable');
  await expect(page.locator('#stage canvas')).toHaveCount(0);
  await expectUnavailableWithWorking2D(page);
});

test('native audio stays smooth while the main 3D knob moves in both directions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.__audioContexts = [];
    if (!NativeAudioContext) return;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        this.testGains = [];
        window.__audioContexts.push(this);
      }
      createGain() {
        const gain = super.createGain();
        this.testGains.push(gain);
        return gain;
      }
    };
  });
  await openInstrument(page);
  test.skip(
    !(await hasWebAudio(page)),
    'This Playwright browser build does not expose the Web Audio API.',
  );
  expect(await page.evaluate(() => window.__audioContexts.length)).toBe(0);
  const hint = page.locator('#model-grab-hint');
  await expect(hint).toBeVisible();
  const knob = await hint.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const onRight = parseFloat(node.style.getPropertyValue('--leader-left')) < 0;
    return { x: onRight ? bounds.x - 44 : bounds.right + 44, y: bounds.y + bounds.height / 2 };
  });
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  await expect.poll(() => page.evaluate(() => window.__audioContexts[0]?.state)).toBe('running');
  await expect(hint).toBeHidden();
  await page.waitForTimeout(80);
  await page.evaluate(async () => {
    const context = window.__audioContexts[0];
    const code = `class Recorder extends AudioWorkletProcessor {
      constructor() { super(); this.data = []; this.port.onmessage = () => this.port.postMessage(this.data); }
      process(inputs) { if(inputs[0]?.[0]) this.data.push(...inputs[0][0]); return true; }
    } registerProcessor('exhibition-audio-test', Recorder);`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const recorder = new AudioWorkletNode(context, 'exhibition-audio-test');
    context.testGains[0].connect(recorder);
    recorder.connect(context.destination);
    window.__recording = {
      recorder,
      result: new Promise((resolve) => {
        recorder.port.onmessage = (event) => resolve(event.data);
      }),
    };
  });
  for (const direction of [1, -1])
    for (let step = 1; step <= 60; step++) {
      const distance = direction === 1 ? step * 0.5 : (60 - step) * 0.5;
      await page.mouse.move(knob.x, knob.y - distance);
      await page.waitForTimeout(12);
    }
  await page.mouse.up();
  await page.waitForTimeout(150);
  const signal = await page.evaluate(async () => {
    const { recorder, result } = window.__recording;
    recorder.port.postMessage('stop');
    const samples = await result;
    const context = window.__audioContexts[0];
    context.testGains[0].disconnect(recorder);
    recorder.disconnect();
    let peak = 0;
    const crossings = [];
    for (let i = 1; i < samples.length - 1; i++) {
      peak = Math.max(peak, Math.abs(samples[i]));
      if (samples[i] < 0 && samples[i + 1] >= 0)
        crossings.push((i - samples[i] / (samples[i + 1] - samples[i])) / context.sampleRate);
    }
    const frequencies = crossings.slice(1).map((time, i) => 1 / (time - crossings[i]));
    return {
      peak,
      cycles: frequencies.length,
      min: Math.min(...frequencies),
      max: Math.max(...frequencies),
      jump: Math.max(...frequencies.slice(1).map((hz, i) => Math.abs(hz - frequencies[i]))),
    };
  });
  expect(signal.cycles).toBeGreaterThan(300);
  expect(signal.peak).toBeLessThan(0.106);
  expect(signal.min).toBeGreaterThan(430);
  expect(signal.max).toBeLessThan(680);
  expect(signal.jump).toBeLessThan(3.5);
  await page.locator('#audio-toggle').click();
  await expect(page.locator('.audio-button-label')).toHaveText('Mute');
  await page.locator('.exhibition-hardware--tune button').press('ArrowUp');
  await expect(page.locator('.audio-button-label')).toHaveText('Mute');
});
