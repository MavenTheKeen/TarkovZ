import { createStore, useStore } from './store';

// Small per-user conveniences kept in browser storage.

export const favoritesStore = createStore<string[]>('tarkovz.favorites.v1', []);
export const useFavorites = () => useStore(favoritesStore);
export function toggleFavorite(itemId: string) {
  favoritesStore.set((f) => (f.includes(itemId) ? f.filter((id) => id !== itemId) : [...f, itemId]));
}

/** Your own notes per extract id, e.g. "campers here". */
export const extractNotesStore = createStore<Record<string, string>>('tarkovz.extractNotes.v1', {});
export const useExtractNotes = () => useStore(extractNotesStore);
export function setExtractNote(extractId: string, note: string) {
  extractNotesStore.set((n) => {
    const next = { ...n };
    if (note.trim()) next[extractId] = note;
    else delete next[extractId];
    return next;
  });
}

/** Items you've said you carry, so extracts that need them aren't dimmed. */
export const ownedItemsStore = createStore<Record<string, true>>('tarkovz.ownedItems.v1', {});
export const useOwnedItems = () => useStore(ownedItemsStore);
export function toggleOwnedItem(itemId: string) {
  ownedItemsStore.set((o) => {
    const next = { ...o };
    if (next[itemId]) delete next[itemId];
    else next[itemId] = true;
    return next;
  });
}

export const lastMapStore = createStore<string | null>('tarkovz.lastMap', null);
