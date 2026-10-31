import { useSyncExternalStore } from 'react';

// A tiny store shared by every component that reads it, by default kept in
// localStorage. Storage can throw or be empty (cleared data), so the app
// always falls back to the default.
export interface Store<T> {
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

/** Pass a null key for state that should not outlive the window. */
export function createStore<T>(key: string | null, initial: T): Store<T> {
  let value = initial;
  if (key) try {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const saved = JSON.parse(raw) as T;
      // Merge plain objects so settings added in a later version get their defaults.
      const isPlainObject = typeof initial === 'object' && initial !== null && !Array.isArray(initial);
      value = isPlainObject ? { ...initial, ...saved } : saved;
    }
  } catch {
    // Keep the default.
  }

  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      if (key) try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Not persisted this time; the in-memory value still updates.
      }
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
