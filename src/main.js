import './styles/base.css';
import './styles/exhibition.css';
import './styles/panel.css';
import './styles/gallery.css';
import './styles/drawer.css';
import './styles/fallback.css';
import { loadFeedback } from './ui/load-feedback.js';
import { initGallery } from './ui/gallery.js';

initGallery();

import('./app.js').catch((error) => {
  console.error('Could not start the exhibition', error);
  loadFeedback.fail('core', error);
});
