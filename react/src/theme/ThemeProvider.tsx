import { useEffect, useMemo, type ReactNode } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { ThemeContext, type ThemeContextValue, type Theme } from './themeContext';

const STORAGE_KEY = 'css.theme';

// Syncfusion theme stylesheet URLs. Imported lazily from CDN at runtime so
// they are not bundled into the JS and so they can be swapped by toggling
// the [disabled] attribute on the corresponding <link>.
const SF_LIGHT_HREF = 'https://cdn.syncfusion.com/ej2/28.2.7/tailwind3.css';
const SF_DARK_HREF =
  'https://cdn.syncfusion.com/ej2/28.2.7/tailwind3-dark.css';

function ensureStylesheet(
  id: string,
  href: string,
  enabled: boolean
): HTMLLinkElement {
  let link = document.getElementById(id) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    // Set `disabled` BEFORE assigning `href`/appending so the browser does
    // not kick off a network request for the inactive theme on first render.
    link.disabled = !enabled;
    link.href = href;
    document.head.appendChild(link);
  } else {
    link.disabled = !enabled;
    if (link.href !== href) link.href = href;
  }
  return link;
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [theme, setTheme] = usePersistedState<Theme>(STORAGE_KEY, 'light');

  // Mirror the theme to <html data-theme="..."> so CSS selectors and
  // Tailwind's `dark:` variant pick it up. We also toggle the Syncfusion
  // stylesheet selection so its --sf-* variables resolve correctly.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.dataset.theme = theme;

    ensureStylesheet('sf-theme-light', SF_LIGHT_HREF, theme === 'light');
    ensureStylesheet('sf-theme-dark', SF_DARK_HREF, theme === 'dark');
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')),
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
