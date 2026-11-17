const LOADING_DELAY_MS = 600;
const LOAD_TIMEOUT_MS = 20000;
const loading = document.querySelector('#model-loader');
const errorPanel = document.querySelector('#model-error');
const errorMessage = document.querySelector('#error-message');
const status = document.querySelector('#status-indicator');
const statusText = document.querySelector('#status-text');
const descriptions = {
  graphics: [
    '3D is unavailable in this browser. Open the exhibition in a browser with WebGL enabled.',
    'Widok 3D jest niedostępny w tej przeglądarce. Otwórz wystawę w przeglądarce z włączoną obsługą WebGL.',
  ],
  startup: [
    'Could not start the 3D view. Reload the page to try again.',
    'Nie udało się uruchomić widoku 3D. Odśwież stronę, aby spróbować ponownie.',
  ],
  model: [
    'Could not load the instrument. Check your connection and reload the page.',
    'Nie udało się wczytać instrumentu. Sprawdź połączenie i odśwież stronę.',
  ],
  timeout: [
    'The 3D model is taking too long to load. Try reloading the page.',
    'Wczytywanie modelu 3D trwa zbyt długo. Spróbuj odświeżyć stronę.',
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
  start() {
    delay = setTimeout(() => loading.classList.remove('is-hidden'), LOADING_DELAY_MS);
    deadline = setTimeout(() => fail('timeout'), LOAD_TIMEOUT_MS);
  },
  ready() {
    finish('ready');
  },
  fail,
  translate,
};
