import { useMemo, useState } from 'react';
import { searchEntries, type SearchEntry } from '../lib/search';

/** "Where is it": find a quest, item, extract or boss on any map. */
export default function SearchBox({ index, onSelect }: { index: SearchEntry[]; onSelect: (e: SearchEntry) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const results = useMemo(() => searchEntries(index, query), [index, query]);

  const choose = (entry: SearchEntry) => {
    onSelect(entry);
    setQuery(entry.label);
    setOpen(false);
  };

  return (
    <div className="search-box">
      <input
        type="search"
        placeholder="Where is… (quest, item, extract, boss)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && results[0]) choose(results[0]);
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((r) => (
            <li key={r.key}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)}>
                <span className="result-label">{r.label}</span>
                <span className="result-meta">
                  {r.kind} · {r.mapName}
                  {r.points.length > 1 ? ` · ${r.points.length} spots` : r.points.length === 0 ? ' · no marker' : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
