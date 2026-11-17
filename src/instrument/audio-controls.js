/** Sound and volume controls, independent of the model and its control panel. */
export class AudioControls {
  constructor({ root, audio, t }) {
    this.audio = audio;
    this.t = t;
    this.messageText = ['', ''];
    this.lastFrequency = null;
    this.lastAudioEnabled = null;
    this.audioBusy = false;
    const get = (id) => root.querySelector(`#${id}`);
    this.message = get('instrument-message');
    this.audioButton = get('audio-toggle');
    this.audioLabel = this.audioButton.querySelector('.audio-button-label');
    this.awaitingFirstGesture = true;
    this.audioButton.disabled = !audio.supported;
    this.volume = get('audio-volume');
    this.volume.addEventListener('pointerdown', () => this.activateSound());
    this.volume.addEventListener('keydown', () => this.activateSound());
    this.volume.addEventListener('input', (event) => {
      const volume = Number(event.target.value);
      get('volume-value').textContent = `${volume}%`;
      this.volume.style.setProperty('--range-fill', `${volume}%`);
      audio.setVolume(volume / 100);
    });
    this.audioButton.addEventListener('click', async () => {
      if (this.audioBusy) return;
      if (audio.snapshot().enabled || this.awaitingFirstGesture) {
        this.suspendAudio();
        this.say('Sound off.', 'Dźwięk wyłączony.');
      } else {
        await this.enableSound();
      }
      this.paintAudio();
    });
    this.translate();
  }

  async enableSound() {
    if (this.audioBusy || !this.audio.supported) return;
    this.audioBusy = true;
    this.audioButton.disabled = true;
    try {
      const result = await this.audio.enable();
      this.awaitingFirstGesture = false;
      if (result.enabled) this.say('Sound on.', 'Dźwięk włączony.');
      else
        this.say(
          'Could not start audio. Try again.',
          'Nie udało się uruchomić dźwięku. Spróbuj ponownie.',
        );
    } finally {
      this.audioBusy = false;
      this.audioButton.disabled = !this.audio.supported;
      this.paintAudio();
    }
  }

  activateSound() {
    if (this.awaitingFirstGesture) this.enableSound();
  }

  suspendAudio() {
    this.awaitingFirstGesture = false;
    this.audio.disable();
    this.paintAudio();
  }

  say(en, pl) {
    this.messageText = [en, pl];
    if (this.message) this.message.textContent = this.t(en, pl);
  }

  translate() {
    this.say(...this.messageText);
    this.volume.setAttribute('aria-label', this.t('Volume', 'Głośność dźwięku'));
    this.lastAudioEnabled = null;
    this.paintAudio();
  }

  paintAudio() {
    const audio = this.audio.snapshot();
    const enabled = audio.supported && (audio.enabled || this.awaitingFirstGesture);
    if (enabled !== this.lastAudioEnabled) {
      const label = enabled
        ? this.t('Mute sound', 'Wyłącz dźwięk')
        : this.t('Enable sound', 'Włącz dźwięk');
      const displayLabel = enabled ? this.t('Sound', 'Dźwięk') : this.t('Mute', 'Wycisz');
      this.audioLabel.textContent = audio.supported
        ? displayLabel
        : this.t('Audio unavailable', 'Audio niedostępne');
      this.audioButton.setAttribute(
        'aria-label',
        audio.supported ? label : this.t('Audio unavailable', 'Audio niedostępne'),
      );
      this.audioButton.title = label;
      this.audioButton.setAttribute('aria-pressed', String(enabled));
      this.lastAudioEnabled = enabled;
    }
  }

  pollAudio() {
    // Before the first enable, there is no running context whose state can change.
    if (this.audio.context || this.audioBusy) this.paintAudio();
  }

  update(snapshot) {
    if (this.lastFrequency === snapshot.frequencyHz) return;
    this.audio.setFrequency(snapshot.frequencyHz);
    this.lastFrequency = snapshot.frequencyHz;
  }
}
