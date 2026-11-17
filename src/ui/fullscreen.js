export function createFullscreenControls({
  section: viewerSection,
  audioHome,
  audioPanel,
  t,
  onResize = () => {},
  onEscape = () => {},
}) {
  const fullscreenToggle = document.querySelector('#fullscreen-toggle');
  const fullscreenLabel = document.querySelector('#fullscreen-label');
  const events = new AbortController();
  let resizeFrame = null;
  function isFullscreen() {
    return (
      document.fullscreenElement === viewerSection ||
      viewerSection.classList.contains('is-expanded')
    );
  }

  function labelFullscreen() {
    const active = isFullscreen();
    const label = active
      ? t('Exit fullscreen', 'Zamknij pełny ekran')
      : t('Fullscreen', 'Pełny ekran');
    fullscreenToggle.setAttribute('aria-pressed', String(active));
    fullscreenToggle.setAttribute('aria-label', label);
    fullscreenToggle.title = label;
    fullscreenLabel.textContent = label;
  }

  function syncFullscreen() {
    if (isFullscreen()) viewerSection.prepend(audioPanel);
    else audioHome.append(audioPanel);
    labelFullscreen();
    if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = null;
      onResize();
    });
  }

  let backgroundInert = [];
  function setExpandedFallback(active) {
    viewerSection.classList.toggle('is-expanded', active);
    document.body.classList.toggle('viewer-expanded', active);
    if (active) {
      backgroundInert = [...viewerSection.parentElement.children]
        .filter((element) => element !== viewerSection)
        .map((element) => ({ element, inert: element.inert }));
      backgroundInert.forEach(({ element }) => {
        element.inert = true;
      });
    } else {
      backgroundInert.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      backgroundInert = [];
      fullscreenToggle.focus({ preventScroll: true });
    }
    syncFullscreen();
  }

  fullscreenToggle.addEventListener(
    'click',
    async () => {
      fullscreenToggle.disabled = true;
      try {
        if (document.fullscreenElement === viewerSection) {
          await document.exitFullscreen();
        } else if (viewerSection.classList.contains('is-expanded')) {
          setExpandedFallback(false);
        } else if (document.fullscreenEnabled && viewerSection.requestFullscreen) {
          try {
            await viewerSection.requestFullscreen({ navigationUI: 'hide' });
          } catch {
            setExpandedFallback(true);
          }
        } else {
          setExpandedFallback(true);
        }
      } finally {
        fullscreenToggle.disabled = false;
        syncFullscreen();
      }
    },
    { signal: events.signal },
  );
  document.addEventListener('fullscreenchange', syncFullscreen, { signal: events.signal });

  window.addEventListener(
    'keydown',
    (event) => {
      if (viewerSection.classList.contains('is-expanded')) {
        if (event.key === 'Escape') {
          event.preventDefault();
          onEscape();
          setExpandedFallback(false);
          return;
        }
        if (event.key === 'Tab') {
          const buttons = [
            ...viewerSection.querySelectorAll(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary',
            ),
          ].filter((element) => element.getClientRects().length);
          const first = buttons[0],
            last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }
    },
    { signal: events.signal },
  );
  labelFullscreen();
  return {
    isActive: isFullscreen,
    translate: labelFullscreen,
    dispose() {
      events.abort();
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      backgroundInert.forEach(({ element, inert }) => {
        element.inert = inert;
      });
      viewerSection.classList.remove('is-expanded');
      document.body.classList.remove('viewer-expanded');
      audioHome.append(audioPanel);
    },
  };
}
