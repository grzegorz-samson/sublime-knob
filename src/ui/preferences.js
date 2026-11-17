const LANGUAGE_KEY = 'sublime-knob-exhibition-language';
const THEME_KEY = 'sublime-knob-exhibition-theme';

function readPreference(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences still apply to the current page when storage is unavailable.
  }
}

export function createExhibitionPreferences({ onChange } = {}) {
  let language = readPreference(LANGUAGE_KEY, ['en', 'pl'], 'en');
  let theme = readPreference(THEME_KEY, ['light', 'dark'], 'light');
  const languageButton = document.querySelector('#exhibition-language');
  const themeButton = document.querySelector('#exhibition-theme');

  const t = (english, polish) => (language === 'pl' ? polish : english);

  function translate() {
    document.documentElement.lang = language;
    for (const element of document.querySelectorAll(
      '[data-en][data-pl], [data-aria-en], [data-title-en]',
    )) {
      if (element.hasAttribute('data-en'))
        element.textContent = t(element.dataset.en, element.dataset.pl);
      if (element.hasAttribute('data-aria-en')) {
        element.setAttribute('aria-label', t(element.dataset.ariaEn, element.dataset.ariaPl));
      }
      if (element.hasAttribute('data-title-en')) {
        element.setAttribute('title', t(element.dataset.titleEn, element.dataset.titlePl));
      }
    }
    document.title = t('Sublime Knob — Exhibition', 'Sublime Knob — wystawa');
    if (languageButton) {
      const label = t('Switch language to Polish', 'Zmień język na angielski');
      languageButton.textContent = language.toUpperCase();
      languageButton.setAttribute('aria-label', label);
      languageButton.title = label;
    }
    if (themeButton) {
      themeButton.setAttribute('aria-pressed', String(theme === 'dark'));
      themeButton.setAttribute('aria-label', t('Dark mode', 'Tryb ciemny'));
      themeButton.title =
        theme === 'dark'
          ? t('Enable light mode', 'Włącz tryb jasny')
          : t('Enable dark mode', 'Włącz tryb ciemny');
    }
  }

  function setLanguage(nextLanguage) {
    if (!['en', 'pl'].includes(nextLanguage) || nextLanguage === language) return;
    language = nextLanguage;
    savePreference(LANGUAGE_KEY, language);
    translate();
    onChange?.({ language, theme });
  }

  function setTheme(nextTheme) {
    if (!['light', 'dark'].includes(nextTheme) || nextTheme === theme) return;
    theme = nextTheme;
    document.documentElement.dataset.theme = theme;
    savePreference(THEME_KEY, theme);
    translate();
    onChange?.({ language, theme });
  }

  document.documentElement.dataset.theme = theme;
  languageButton?.addEventListener('click', () => setLanguage(language === 'en' ? 'pl' : 'en'));
  themeButton?.addEventListener('click', () => setTheme(theme === 'light' ? 'dark' : 'light'));
  translate();

  return {
    t,
    translate,
    get language() {
      return language;
    },
    get theme() {
      return theme;
    },
    setLanguage,
    setTheme,
  };
}
