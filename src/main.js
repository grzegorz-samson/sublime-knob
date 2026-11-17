import './styles/base.css';
import './styles/exhibition.css';
import './styles/panel.css';
import './styles/gallery.css';
import './styles/drawer.css';
import { loadFeedback } from './ui/load-feedback.js';
import { initGallery } from './ui/gallery.js';

loadFeedback.start();
initGallery();

import('./app.js').catch((error) => {
  console.error('Could not start the exhibition', error);
  const graphicsError = /WebGL.*context|context.*WebGL/i.test(error?.message);
  loadFeedback.fail(graphicsError ? 'graphics' : 'startup', error);
});
