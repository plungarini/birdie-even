import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import App from './App';
import './app.css';
// Side-effect import: bootstraps the raw-SDK glasses/HUD layer in the same bundle.
// The two layers never import each other; they share state via `./store` only.
import './glasses-main';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
