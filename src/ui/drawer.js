export class ExhibitionDrawer {
  constructor({ t }) {
    this.t = t;
    this.layout = document.querySelector('.stage-layout');
    this.panel = document.querySelector('.instrument-panel');
    this.drawer = document.querySelector('#parameter-drawer');
    this.handle = document.querySelector('#parameter-handle');
    this.home = document.createComment('Instrument panel');
    this.panel.before(this.home);
    this.open = false;
    this.mobileQuery = matchMedia('(max-width: 760px), (max-width: 1100px) and (pointer: coarse)');
    this.mobileQuery.addEventListener('change', () => this.setOpen(!this.mobileQuery.matches));
    this.handle.addEventListener('click', () => this.setOpen(!this.open));
    this.drawer.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        this.setOpen(false);
        this.handle.focus({ preventScroll: true });
      }
    });
    this.setOpen(!this.mobileQuery.matches);
  }

  setOpen(open) {
    open = open && !this.mobileQuery.matches;
    this.open = open;
    if (open) this.drawer.append(this.panel);
    else this.home.after(this.panel);
    this.drawer.hidden = !open;
    this.layout.classList.toggle('has-parameters', open);
    this.handle.setAttribute('aria-expanded', String(open));
    this.handle.firstElementChild.textContent = open ? '›' : '‹';
    this.translate();
  }

  translate() {
    const label = this.open
      ? this.t('Close parameter panel', 'Zamknij panel parametrów')
      : this.t('Open parameter panel', 'Otwórz panel parametrów');
    this.handle.setAttribute('aria-label', label);
    this.handle.title = label;
  }
}
