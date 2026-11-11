import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import './type-scale.css';
import './light-theme.css';
import './polish.css';
import './tools.css';
import './calm.css';

// Serve Excalidraw's fonts from this origin so the whiteboard works offline and makes no CDN requests.
window.EXCALIDRAW_ASSET_PATH = '/excalidraw-assets/';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
