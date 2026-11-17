/** Hash navigation keeps the exhibition and photographs on the same static Pages URL. */
export function initGallery() {
  const gallery = document.querySelector('#exhibition-gallery');
  const dialog = gallery.querySelector('.gallery-dialog');
  const largeImage = gallery.querySelector('.gallery-dialog-image');
  const caption = gallery.querySelector('.gallery-dialog-caption');
  const navigation = document.querySelector('#gallery-nav');

  function showView(focusHeading = false) {
    const isGallery = ['#gallery', '#exhibition-gallery'].includes(location.hash);
    document.documentElement.dataset.page = isGallery ? 'gallery' : 'instrument';
    if (isGallery) navigation.setAttribute('aria-current', 'page');
    else navigation.removeAttribute('aria-current');
    if (dialog.open) dialog.close();
    if (isGallery) {
      for (const image of gallery.querySelectorAll('.gallery-image img')) {
        if (!image.hasAttribute('src')) {
          image.src = `${import.meta.env.BASE_URL}media/gallery/${image.dataset.photo}`;
        }
      }
    }
    window.dispatchEvent(new CustomEvent('exhibitionviewchange', { detail: { isGallery } }));
    if (focusHeading) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const focusTarget = isGallery ? document.querySelector('#gallery-title') : navigation;
      focusTarget.focus({ preventScroll: true });
    }
  }

  window.addEventListener('hashchange', () => showView(true));
  showView();

  for (const button of gallery.querySelectorAll('.gallery-image')) {
    button.addEventListener('click', () => {
      largeImage.src = button.querySelector('img').src;
      caption.textContent =
        document.documentElement.lang === 'pl'
          ? button.dataset.captionPl
          : button.dataset.captionEn;
      largeImage.alt = `Sublime Knob — ${caption.textContent}`;
      dialog.showModal();
    });
  }
  gallery.querySelector('.gallery-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
