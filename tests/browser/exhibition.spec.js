import { test, expect } from '@playwright/test';

async function openInstrument(page, suffix = '') {
  await page.goto(`./${suffix}`);
  await expect(page.locator('#exhibition-zoom')).toBeEnabled();
  await expect(page.locator('#model-error')).toBeHidden();
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
  await page.locator('#gallery-nav').click();
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
  await page.locator('.gallery-back').click();
  await expect(page.locator('#stage canvas')).toBeVisible();
});

test('fullscreen and mobile reflow keep the controls inside the panel', async ({
  page,
  browser,
}) => {
  await openInstrument(page);
  await page.locator('#fullscreen-toggle').click();
  await expect(page.locator('#fullscreen-toggle')).toHaveAttribute('aria-pressed', 'true');
  const measure = () =>
    page.evaluate(() => {
      const face = document.querySelector('.exhibition-face').getBoundingClientRect();
      return {
        width: face.width,
        height: face.height,
        bottom: face.bottom,
        controls: [...document.querySelectorAll('.exhibition-hardware')].map(
          (node) => node.getBoundingClientRect().bottom,
        ),
      };
    });
  let size = await measure();
  expect(size.height).toBeLessThanOrEqual(560);
  expect(size.width).toBeGreaterThan(390);
  await page.locator('#parameter-handle').click();
  size = await measure();
  expect(size.width / size.height).toBeGreaterThan(2);
  expect(size.height).toBeLessThan(360);
  expect(size.controls.every((bottom) => bottom < size.bottom)).toBe(true);
  await page.locator('#fullscreen-toggle').click();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const mobile = await mobileContext.newPage();
  try {
    await mobile.goto('http://127.0.0.1:4173/sublime-knob/');
    await expect(mobile.locator('#exhibition-zoom')).toBeEnabled();
    await expect(mobile.locator('#parameter-handle')).toBeHidden();
    await expect(mobile.locator('.viewer-section > .instrument-panel')).toBeVisible();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await mobile.locator('.exhibition-recall').tap();
    await expect(mobile.locator('.exhibition-recall')).not.toHaveClass(/is-pressed|is-click-pulse/);
  } finally {
    await mobileContext.close();
  }
});

test('native audio stays smooth while the main 3D knob moves in both directions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.__audioContexts = [];
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
  expect(signal.jump).toBeLessThan(3);
  await page.locator('#audio-toggle').click();
  await expect(page.locator('.audio-button-label')).toHaveText('Mute');
  await page.locator('.exhibition-hardware--tune button').press('ArrowUp');
  await expect(page.locator('.audio-button-label')).toHaveText('Mute');
});
