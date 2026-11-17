const LOADING_DELAY_MS = 600;
const LOAD_TIMEOUT_MS = 20000;
const loading = document.querySelector('#model-loader');
const errorPanel = document.querySelector('#model-error');
const errorMessage = document.querySelector('#error-message');
const status = document.querySelector('#status-indicator');
const statusText = document.querySelector('#status-text');
const errorTitle = errorPanel.querySelector('strong');
const descriptions = {
  graphics: [
    'The 3D view is unavailable. You can still play using the controls below.',
    'Widok 3D jest niedostępny. Nadal możesz grać, używając kontrolek poniżej.',
  ],
  startup: [
    'The 3D view could not start. You can still play using the controls below.',
    'Nie udało się uruchomić widoku 3D. Nadal możesz grać, używając kontrolek poniżej.',
  ],
  model: [
    'The 3D model could not be loaded. You can still play using the controls below.',
    'Nie udało się wczytać modelu 3D. Nadal możesz grać, używając kontrolek poniżej.',
  ],
  timeout: [
    'The 3D model did not load in time. You can still play using the controls below.',
    'Model 3D nie został wczytany na czas. Nadal możesz grać, używając kontrolek poniżej.',
  ],
  context: [
    'The 3D view was interrupted. You can still play using the controls below.',
    'Widok 3D został przerwany. Nadal możesz grać, używając kontrolek poniżej.',
  ],
  core: [
    'Could not start the instrument. Reload the page to try again.',
    'Nie udało się uruchomić instrumentu. Odśwież stronę, aby spróbować ponownie.',
  ],
};

let state = 'loading';
let reason;
let delay;
let deadline;

function translate() {
  const polish = document.documentElement.lang === 'pl';
  const labels = {
    loading: ['Loading', 'Ładowanie'],
    ready: ['Model ready', 'Model gotowy'],
    error: ['Model unavailable', 'Błąd modelu'],
  };
  const language = polish ? 1 : 0;
  statusText.textContent = labels[state][language];
  if (state === 'error') {
    errorTitle.textContent = (
      reason === 'core'
        ? ['Could not start the instrument', 'Nie udało się uruchomić instrumentu']
        : ['3D view unavailable', 'Widok 3D niedostępny']
    )[language];
    errorMessage.textContent = descriptions[reason][language];
  }
}

function finish(nextState) {
  clearTimeout(delay);
  clearTimeout(deadline);
  state = nextState;
  loading.classList.add('is-hidden');
  errorPanel.hidden = state !== 'error';
  status.classList.toggle('error', state === 'error');
  status.classList.toggle('loaded', state === 'ready');
  translate();
}

function fail(cause, error) {
  reason = cause;
  if (error) console.error('Instrument loading failed', error);
  finish('error');
}

export const loadFeedback = {
  start({ onTimeout } = {}) {
    clearTimeout(delay);
    clearTimeout(deadline);
    state = 'loading';
    reason = undefined;
    loading.classList.add('is-hidden');
    errorPanel.hidden = true;
    translate();
    delay = setTimeout(() => loading.classList.remove('is-hidden'), LOADING_DELAY_MS);
    deadline = setTimeout(() => {
      if (onTimeout) onTimeout();
      else fail('timeout');
    }, LOAD_TIMEOUT_MS);
  },
  ready() {
    finish('ready');
  },
  fail,
  translate,
};
