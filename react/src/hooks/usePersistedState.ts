import { useCallback, useState } from 'react';

function readStored<T>(key: string, initial: T): T {
  if (typeof window === 'undefined') return initial;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return initial;
    return JSON.parse(stored) as T;
  } catch {
    return initial;
  }
}

/**
 * A `useState`-like hook that persists the value to `localStorage`.
 *
 * - SSR-safe: `localStorage` is only touched during the initial render on the
 *   client (via lazy state initializer), so server renders are unaffected.
 * - Falls back to `initial` when no value is stored or the stored value fails
 *   to parse.
 * - Writes are best-effort; storage errors are swallowed so the UI still works
 *   in private browsing or restricted contexts.
 */
export function usePersistedState<T>(
  key: string,
  initial: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => readStored(key, initial));

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // ignore quota / availability errors
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, update];
}
