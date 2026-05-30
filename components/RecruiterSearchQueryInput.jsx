"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  filterRecruiterSearchSuggestions,
  recruiterSearchSuggestionCategoryLabel,
} from "@/src/lib/ai/recruiter-search-suggestions";

/**
 * Natural-language search textarea with autocomplete suggestions.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {boolean} [props.disabled]
 * @param {string} [props.placeholder]
 */
export default function RecruiterSearchQueryInput({
  value,
  onChange,
  disabled = false,
  placeholder = 'e.g. "Find React developers"',
}) {
  const listboxId = useId();
  const rootRef = useRef(null);
  const textareaRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const loadSuggestions = useCallback(async (prefix) => {
    const trimmed = prefix.trim();
    setLoadingSuggestions(true);
    try {
      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      params.set("limit", "8");
      const res = await fetch(`/api/search/suggestions?${params.toString()}`, {
        credentials: "same-origin",
      });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        const rows = Array.isArray(body?.suggestions) ? body.suggestions : [];
        setSuggestions(
          rows.filter((r) => r && typeof r.text === "string").map((r) => ({
            text: r.text,
            label: typeof r.label === "string" ? r.label : r.text,
            categoryLabel:
              typeof r.categoryLabel === "string" ? r.categoryLabel : "Search",
          }))
        );
        return;
      }
    } catch {
      /* local fallback */
    } finally {
      setLoadingSuggestions(false);
    }

    setSuggestions(
      filterRecruiterSearchSuggestions(trimmed, { limit: 8 }).map((s) => ({
        text: s.text,
        label: s.label ?? s.text,
        categoryLabel: recruiterSearchSuggestionCategoryLabel(s.category),
      }))
    );
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => {
      void loadSuggestions(value);
    }, 120);
    return () => window.clearTimeout(timer);
  }, [value, open, loadSuggestions]);

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!rootRef.current?.contains(e.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function selectSuggestion(text) {
    onChange(text);
    setOpen(false);
    setActiveIndex(-1);
    textareaRef.current?.focus();
  }

  function onKeyDown(e) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (!open || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Tab" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex].text);
    } else if (e.key === "Enter" && activeIndex >= 0 && !e.shiftKey) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex].text);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showList = open && (suggestions.length > 0 || loadingSuggestions);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          setOpen(true);
          void loadSuggestions(value);
        }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={3}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "12px 14px",
          borderRadius: 10,
          border: "1px solid var(--app-border)",
          background: "var(--app-surface)",
          color: "var(--text-body)",
          fontSize: 14,
          lineHeight: 1.5,
          resize: "vertical",
          fontFamily: "'DM Sans',sans-serif",
        }}
      />
      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            margin: "4px 0 0",
            padding: 6,
            listStyle: "none",
            borderRadius: 10,
            border: "1px solid var(--app-border)",
            background: "var(--app-surface)",
            boxShadow: "0 12px 40px rgba(0,0,0,.25)",
            zIndex: 40,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {loadingSuggestions && suggestions.length === 0 ? (
            <li
              style={{
                padding: "10px 12px",
                fontSize: 12,
                color: "var(--text-muted)",
                fontFamily: "'DM Mono',monospace",
              }}
            >
              Loading suggestions…
            </li>
          ) : null}
          {!loadingSuggestions && suggestions.length === 0 ? (
            <li
              style={{
                padding: "10px 12px",
                fontSize: 12,
                color: "var(--text-muted)",
              }}
            >
              No matching suggestions
            </li>
          ) : null}
          {suggestions.map((item, index) => {
            const active = index === activeIndex;
            return (
              <li
                key={item.text}
                role="option"
                aria-selected={active}
                id={`${listboxId}-option-${index}`}
              >
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectSuggestion(item.text)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 12px",
                    cursor: "pointer",
                    background: active ? "rgba(59,130,246,.12)" : "transparent",
                    color: "var(--text-body)",
                    fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
                      {item.label}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--text-muted)",
                        fontFamily: "'DM Mono',monospace",
                      }}
                    >
                      {item.categoryLabel}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
