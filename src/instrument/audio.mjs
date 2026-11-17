const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const FREQUENCY_TIME_CONSTANT = 0.025;

export class InstrumentAudio {
  constructor(contextFactory = null) {
    this.contextFactory = contextFactory;
    this.context = null;
    this.oscillator = null;
    this.highpass = null;
    this.master = null;
    this.analyser = null;
    this.enabled = false;
    this.desiredEnabled = false;
    this.frequencyHz = 440;
    this.volume = 0.5;
    this.generation = 0;
    this._stateChangeHandler = null;
    this.hasBeenEnabled = false;
    this.pendingEnable = null;
  }

  get supported() {
    return Boolean(this.contextFactory || globalThis.AudioContext || globalThis.webkitAudioContext);
  }

  _makeGraph() {
    if (this.context) return;
    const context = this.contextFactory
      ? this.contextFactory()
      : new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    if (!context) throw new Error('Web Audio is unavailable');
    this.context = context;
    try {
      this.oscillator = context.createOscillator();
      this.highpass = context.createBiquadFilter();
      this.master = context.createGain();
      this.analyser = context.createAnalyser();
      this.highpass.type = 'highpass';
      this.highpass.frequency.value = 20;
      this.highpass.Q.value = 0.707;
      this.master.gain.value = 0;
      this.analyser.fftSize = 256;
      this.oscillator.type = 'sine';
      this.frequencyHz = clamp(this.frequencyHz, 20, Math.min(20000, context.sampleRate * 0.45));
      this.oscillator.frequency.value = this.frequencyHz;
      this.oscillator.connect(this.highpass);
      this.highpass.connect(this.master);
      this.master.connect(this.analyser);
      this.analyser.connect(context.destination);
      this.oscillator.start();
      this._stateChangeHandler = () => {
        this._handleInterruption();
      };
      context.addEventListener?.('statechange', this._stateChangeHandler);
    } catch (error) {
      this._cleanupFailedGraph();
      throw error;
    }
  }

  _cleanupFailedGraph() {
    const context = this.context;
    for (const node of [this.oscillator, this.highpass, this.master, this.analyser]) {
      try {
        node?.disconnect?.();
      } catch {
        /* partially-created nodes may already be disconnected */
      }
    }
    if (context && this._stateChangeHandler)
      context.removeEventListener?.('statechange', this._stateChangeHandler);
    if (context && context.state !== 'closed') Promise.resolve(context.close?.()).catch(() => {});
    this.context = null;
    this.oscillator = null;
    this.highpass = null;
    this.master = null;
    this.analyser = null;
    this._stateChangeHandler = null;
    this.enabled = false;
  }

  _handleInterruption() {
    if (this.pendingEnable === this.generation) return;
    if (
      this.hasBeenEnabled &&
      this.context &&
      this.context.state !== 'running' &&
      this.desiredEnabled
    ) {
      this.desiredEnabled = false;
      this.enabled = false;
      if (this.master && this.context.state !== 'closed') this._ramp(this.master.gain, 0, 0.03);
    }
  }

  _ramp(param, value, duration) {
    const now = this.context.currentTime || 0;
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
    else {
      if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
      if (typeof param.setValueAtTime === 'function') param.setValueAtTime(param.value, now);
    }
    if (typeof param.linearRampToValueAtTime === 'function')
      param.linearRampToValueAtTime(value, now + duration);
    else param.value = value;
  }

  async enable() {
    this.desiredEnabled = true;
    const generation = ++this.generation;
    this.pendingEnable = generation;
    try {
      this._makeGraph();
      if (this.context.state !== 'running' && typeof this.context.resume === 'function')
        await this.context.resume();
      if (generation !== this.generation || !this.desiredEnabled) return this.snapshot();
      if (this.context.state === 'running') {
        this.enabled = true;
        this.hasBeenEnabled = true;
        this._ramp(this.master.gain, this.volume * 0.2, 0.03);
      } else this.enabled = false;
    } catch {
      if (generation === this.generation) {
        this.enabled = false;
        if (this.master) this.master.gain.value = 0;
      }
    } finally {
      if (this.pendingEnable === generation) this.pendingEnable = null;
    }
    return this.snapshot();
  }

  setFrequency(hz) {
    if (!finite(hz)) return this.snapshot();
    const upper = this.context ? Math.min(20000, this.context.sampleRate * 0.45) : 20000;
    this.frequencyHz = clamp(hz, 20, upper);
    if (this.oscillator && this.context.state !== 'closed') {
      // Retarget the running curve without cancelling a linear ramp mid-render.
      // A 25 ms time constant reaches about 98% of the new pitch after 100 ms.
      this.oscillator.frequency.setTargetAtTime(
        this.frequencyHz,
        this.context.currentTime,
        FREQUENCY_TIME_CONSTANT,
      );
    }
    return this.snapshot();
  }

  setVolume(normalized) {
    if (!finite(normalized)) return this.snapshot();
    this.volume = clamp(normalized, 0, 1);
    if (this.master && this.enabled) this._ramp(this.master.gain, this.volume * 0.2, 0.03);
    return this.snapshot();
  }

  async mute() {
    return this.disable();
  }

  async disable() {
    this.desiredEnabled = false;
    const generation = ++this.generation;
    if (this.master && this.context && this.context.state !== 'closed')
      this._ramp(this.master.gain, 0, 0.03);
    this.enabled = false;
    await Promise.resolve();
    if (generation === this.generation) this.enabled = false;
    return this.snapshot();
  }

  async dispose() {
    await this.disable();
    if (this.context && this._stateChangeHandler)
      this.context.removeEventListener?.('statechange', this._stateChangeHandler);
    if (this.context && typeof this.context.close === 'function' && this.context.state !== 'closed')
      await this.context.close();
    this.enabled = false;
    this._stateChangeHandler = null;
    return this.snapshot();
  }

  snapshot() {
    this._handleInterruption();
    let rms = 0;
    if (this.analyser && typeof this.analyser.getFloatTimeDomainData === 'function') {
      const samples = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      rms = Math.sqrt(sum / samples.length);
    }
    if (this.context && this.context.state !== 'running') this.enabled = false;
    return {
      enabled: this.enabled,
      supported: this.supported,
      contextState: this.context?.state ?? 'uninitialized',
      frequencyHz: this.frequencyHz,
      volume: this.volume,
      rms,
    };
  }
}
