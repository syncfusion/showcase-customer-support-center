import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client';
import { registerLicense } from '@syncfusion/ej2-base';
import { BrowserRouter } from 'react-router-dom';
import { getPublicBasePath } from './basePath';
import './index.css';
// Syncfusion theme variables are bridged into our tokens inside tokens.css.
// We don't import the full Syncfusion theme sheets here to avoid double-paying
// for their base styles. The ThemeProvider injects only the active sheet
// at runtime so the bundle stays clean and the swap is instant.
import App from './App.tsx';

// Register the Syncfusion license before any Syncfusion component mounts.
// The key is read from VITE_SYNCFUSION_LICENSE_KEY at build time; if it is
// missing we call registerLicense('') which is a no-op so the app still runs
// (Syncfusion will emit a dev-mode console warning in that case).
const licenseKey = import.meta.env.VITE_SYNCFUSION_LICENSE_KEY as
      | string
      | undefined;

registerLicense(licenseKey || '');

// Defensive patch: Syncfusion React widgets (Toast, Dialog, RTE popups,
// dropdown popups, etc.) sometimes portal a DOM node out of the React-
// tracked subtree. When React later unmounts the tab, it calls
// parent.removeChild(child) on a node that is no longer a child
// (it has moved to <body>), which throws:
//   NotFoundError: Failed to execute 'removeChild' on 'Node'
// React's commit phase is not wrapped, so that throw aborts the root
// and blanks the whole app. Swallowing only this specific DOMException
// keeps the shell alive and lets the next tab render normally.
const originalRemoveChild = Node.prototype.removeChild;
Node.prototype.removeChild = function <T extends Node>(child: T): T {
  try {
    return originalRemoveChild.call(this, child) as T;
  } catch (err) {
    if (
      err instanceof DOMException &&
      err.name === 'NotFoundError'
    ) {
      return child;
    }
    throw err;
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={getPublicBasePath()}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)