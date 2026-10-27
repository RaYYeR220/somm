"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchEntities, type SearchHit } from "@/lib/client/api";
import { cx, inputClass } from "./ui";

export type PickedEntity = { name: string; type: string; id?: string };

const TYPE_LABEL: Record<string, string> = { artist: "artist", person: "person", podcast: "podcast", brand: "brand", tv_show: "TV show", movie: "film", place: "place", book: "book", videogame: "game" };

/**
 * Typeahead over Qloo's entity search. Picking a suggestion pins the exact Qloo entity; pressing
 * Enter on free text adds it by name and lets Somm resolve it (and ask if it's ambiguous).
 */
export function EntityPicker({
  value,
  onChange,
  types,
  max = 10,
  placeholder,
}: {
  value: PickedEntity[];
  onChange: (next: PickedEntity[]) => void;
  types: string[];
  max?: number;
  placeholder: string;
}) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState(types[0]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const listId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) return;
    timer.current = setTimeout(async () => {
      try {
        const out = await searchEntities(query.trim(), type);
        setHits(out.results.slice(0, 6));
        setNote(out.status === "error" ? "Live suggestions are unavailable right now; add the name and Somm will look it up." : null);
        setActive(0);
        setOpen(true);
      } catch {
        setHits([]);
      }
    }, 220);
  }, [query, type]);

  const add = (entity: PickedEntity) => {
    if (value.length >= max || value.some((v) => v.name.toLowerCase() === entity.name.toLowerCase() && v.type === entity.type)) return;
    onChange([...value, entity]);
    setQuery("");
    setHits([]);
    setOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {value.map((e, i) => (
          <span key={`${e.name}-${i}`} className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-raised py-1 pl-3 pr-1.5 text-sm">
            <span className="text-bone">{e.name}</span>
            <span className="text-xs text-smoke">{TYPE_LABEL[e.type] ?? e.type}</span>
            {e.id && <span className="size-1.5 rounded-full bg-ember" title="Matched to a Qloo entity" />}
            <button type="button" aria-label={`Remove ${e.name}`} onClick={() => onChange(value.filter((_, j) => j !== i))} className="rounded-full px-1.5 text-ash hover:bg-panel hover:text-bone">
              ×
            </button>
          </span>
        ))}
        {value.length === 0 && <span className="text-sm text-smoke">Nothing added yet.</span>}
      </div>
      <div className="flex gap-2">
        {types.length > 1 && (
          <select aria-label="Entity type" value={type} onChange={(e) => setType(e.target.value)} className={cx(inputClass.replace("w-full ", ""), "w-36 shrink-0")}>
            {types.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        )}
        <div className="relative flex-1">
          <input
            role="combobox"
            aria-expanded={open && hits.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            className={inputClass}
            value={query}
            disabled={value.length >= max}
            placeholder={value.length >= max ? `That's the maximum of ${max}` : placeholder}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setHits([]);
            }}
            onFocus={() => hits.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const hit = open ? hits[active] : undefined;
                if (hit) add({ name: hit.name, type: hit.type || type, id: hit.id });
                else if (query.trim()) add({ name: query.trim(), type });
              } else if (e.key === "Escape") setOpen(false);
            }}
          />
          {open && hits.length > 0 && (
            <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-sm border border-line-strong bg-panel shadow-2xl">
              {hits.map((h, i) => (
                <li
                  key={h.id}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    add({ name: h.name, type: h.type || type, id: h.id });
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cx("flex cursor-pointer items-center justify-between px-3 py-2 text-sm", i === active ? "bg-raised text-bone" : "text-ash")}
                >
                  <span>{h.name}</span>
                  <span className="text-xs text-smoke">{TYPE_LABEL[h.type] ?? h.type}</span>
                </li>
              ))}
              <li className="border-t border-line px-3 py-1.5 text-xs text-smoke">Suggestions from Qloo. Enter adds the highlighted one.</li>
            </ul>
          )}
        </div>
      </div>
      {note && <p className="text-xs text-sand">{note}</p>}
    </div>
  );
}
