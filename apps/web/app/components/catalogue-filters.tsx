"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  EMPTY_FILTERS,
  activeFilterChips,
  activeFilterCount,
  catalogueHref,
  type CatalogueFilterState,
  type FilterOption,
} from "@/lib/catalogue-filters";

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17">
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8" cy="17" r="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <fieldset className="filter-group">
      <legend>{title}</legend>
      <div className="filter-options">
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <label
              key={option.value}
              className={`filter-option${checked ? " is-selected" : ""}${option.count === 0 && !checked ? " is-empty" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={option.count === 0 && !checked}
                onChange={() => onToggle(option.value)}
              />
              <span>{option.label}</span>
              <small>{option.count}</small>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CatalogueFilters({
  brands,
  prices,
  discounts,
  flags,
  active,
  q,
  cat,
  sort,
}: {
  brands: FilterOption[];
  prices: FilterOption[];
  discounts: FilterOption[];
  flags: FilterOption[];
  active: CatalogueFilterState;
  q?: string;
  cat?: string;
  sort?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CatalogueFilterState>(active);
  const count = activeFilterCount(active);
  const chips = activeFilterChips(active);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const openDrawer = () => {
    setDraft({
      brands: [...active.brands],
      prices: [...active.prices],
      discounts: [...active.discounts],
      flags: [...active.flags],
    });
    setOpen(true);
  };

  const toggle = (key: keyof CatalogueFilterState, value: string) => {
    setDraft((current) => {
      const values = current[key];
      return {
        ...current,
        [key]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value],
      };
    });
  };

  const apply = () => {
    router.push(
      catalogueHref({
        q,
        cat,
        sort,
        brands: draft.brands,
        prices: draft.prices,
        discounts: draft.discounts,
        flags: draft.flags,
      }),
    );
    setOpen(false);
  };

  const removeChip = (key: keyof CatalogueFilterState, value: string) => {
    const next = {
      ...active,
      [key]: active[key].filter((item) => item !== value),
    };
    router.push(
      catalogueHref({
        q,
        cat,
        sort,
        brands: next.brands,
        prices: next.prices,
        discounts: next.discounts,
        flags: next.flags,
      }),
    );
  };

  const clearAll = () => {
    router.push(catalogueHref({ q, cat, sort }));
  };

  return (
    <>
      <div className="catalogue-filter-tools">
        <button
          type="button"
          className="filter-trigger"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={openDrawer}
        >
          <FilterIcon />
          Filters
          {count > 0 ? <span className="filter-trigger-count">{count}</span> : null}
        </button>

        {chips.length > 0 ? (
          <div className="active-filter-list" aria-label="Active filters">
            {chips.map((chip) => (
              <button
                key={`${chip.key}:${chip.value}`}
                type="button"
                className="active-filter-chip"
                aria-label={`Remove ${chip.label} filter`}
                onClick={() => removeChip(chip.key, chip.value)}
              >
                {chip.label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="active-filter-clear" onClick={clearAll}>
              Clear all
            </button>
          </div>
        ) : (
          <span className="filter-hint">Brand, price, discount and availability</span>
        )}
      </div>

      {open
        ? createPortal(
            <div className="filter-scrim" role="presentation" onClick={() => setOpen(false)}>
              <section
                className="filter-drawer"
                role="dialog"
                aria-modal="true"
                aria-labelledby="filter-title"
                onClick={(event) => event.stopPropagation()}
              >
                <header className="filter-drawer-head">
                  <div>
                    <span className="eyebrow">Refine the catalogue</span>
                    <h2 id="filter-title">Filters</h2>
                  </div>
                  <button
                    type="button"
                    className="filter-close"
                    aria-label="Close filters"
                    onClick={() => setOpen(false)}
                  >
                    ✕
                  </button>
                </header>

                <div className="filter-drawer-body">
                  <FilterGroup
                    title="Brand"
                    options={brands}
                    selected={draft.brands}
                    onToggle={(value) => toggle("brands", value)}
                  />
                  <FilterGroup
                    title="Price"
                    options={prices}
                    selected={draft.prices}
                    onToggle={(value) => toggle("prices", value)}
                  />
                  <FilterGroup
                    title="Discount"
                    options={discounts}
                    selected={draft.discounts}
                    onToggle={(value) => toggle("discounts", value)}
                  />
                  <FilterGroup
                    title="Availability"
                    options={flags}
                    selected={draft.flags}
                    onToggle={(value) => toggle("flags", value)}
                  />
                </div>

                <footer className="filter-drawer-footer">
                  <button
                    type="button"
                    className="filter-reset"
                    onClick={() => setDraft({ ...EMPTY_FILTERS })}
                  >
                    Reset
                  </button>
                  <button type="button" className="button" onClick={apply}>
                    Apply filters
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
