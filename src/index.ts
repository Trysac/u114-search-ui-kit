/**
 * Headless search UI kit: diacritic-insensitive highlighting, facet counts,
 * search state reducer, and escaped HTML renderers with safe link validation.
 *
 * Zero runtime dependencies, DOM-free, runs in Node.js and browsers.
 */

/** Error codes emitted by {@link SearchKitError}. */
export type SearchKitErrorCode = "TOO_LARGE" | "INVALID_INPUT";

/**
 * Typed error thrown by search-ui-kit operations.
 */
export class SearchKitError extends Error {
  readonly code: SearchKitErrorCode;

  constructor(message: string, code: SearchKitErrorCode) {
    super(message.length > 200 ? `${message.slice(0, 197)}...` : message);
    this.name = "SearchKitError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** A highlighted or non-highlighted text segment. */
export interface Segment {
  text: string;
  match: boolean;
}

/** Options for {@link highlight}. */
export interface HighlightOptions {
  /** Maximum number of match segments to mark (default: 50). Remaining matches stay unmarked. */
  maxMarks?: number;
  /** Maximum input text length in UTF-16 code units (default: 100_000). */
  maxChars?: number;
}

/** Options for {@link facetCounts}. */
export interface FacetCountOptions {
  /** Maximum number of facet values returned per field (default: 1_000). */
  maxValues?: number;
}

/** Single facet value count entry. */
export interface FacetCountEntry {
  value: string;
  count: number;
}

/** Search result item representation. */
export interface Item {
  id: string;
  title: string;
  url?: string;
  snippet?: string;
  [field: string]: unknown;
}

/** Search query, facet filters, and pagination state. */
export interface SearchState {
  query: string;
  facets: Record<string, string[]>;
  page: number;
}

/** Actions supported by {@link searchReducer}. */
export type Action =
  | { type: "setQuery"; query: string }
  | { type: "toggleFacet"; field: string; value: string }
  | { type: "setPage"; page: number }
  | { type: "reset" };

/**
 * Escapes HTML special characters (&, <, >, ", ') for safe insertion into text and attributes.
 *
 * @param str - The raw string to escape.
 * @returns The escaped HTML string.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Determines whether a URL is safe for use in anchor href attributes.
 * Follows WHATWG URL preprocessing: strips C0 controls and spaces, removes tabs and newlines,
 * then permits http:, https:, mailto:, or single-slash root-relative paths (disallowing '//').
 *
 * @param rawUrl - The candidate URL string.
 * @returns True if safe to render as a link; false otherwise.
 */
export function isSafeUrl(rawUrl: string | undefined): boolean {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    return false;
  }
  // Strip leading and trailing C0 controls and spaces (U+0000 to U+0020)
  let start = 0;
  while (start < rawUrl.length && rawUrl.charCodeAt(start) <= 0x20) {
    start++;
  }
  let end = rawUrl.length;
  while (end > start && rawUrl.charCodeAt(end - 1) <= 0x20) {
    end--;
  }
  let url = rawUrl.slice(start, end);
  // Remove tab and newline characters
  url = url.replace(/[\t\n\r]/g, "");

  if (url.length === 0) {
    return false;
  }

  // Paths starting with a single '/' (but not '//')
  if (url.startsWith("/") && !url.startsWith("//")) {
    return true;
  }

  const colonIndex = url.indexOf(":");
  if (colonIndex !== -1) {
    const scheme = url.slice(0, colonIndex).toLowerCase();
    if (
      /^[a-z]+$/.test(scheme) &&
      (scheme === "http" || scheme === "https" || scheme === "mailto")
    ) {
      return true;
    }
  }

  return false;
}

/** Normalizes a string with NFD, removes combining marks (\p{M}), and lower-cases. */
function foldString(str: string): string {
  return str.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Builds a folded view of the text with mappings back to original code unit ranges. */
function buildFoldedView(text: string): {
  folded: string;
  origStartMap: number[];
  origEndMap: number[];
} {
  let folded = "";
  const origStartMap: number[] = [];
  const origEndMap: number[] = [];

  let uIndex = 0;
  for (const cp of text) {
    const cpStart = uIndex;
    const cpEnd = uIndex + cp.length;
    uIndex = cpEnd;

    const foldedCp = foldString(cp);
    if (foldedCp.length === 0) {
      if (origEndMap.length > 0) {
        origEndMap[origEndMap.length - 1] = cpEnd;
      }
    } else {
      for (let i = 0; i < foldedCp.length; i++) {
        origStartMap.push(cpStart);
        origEndMap.push(cpEnd);
      }
      folded += foldedCp;
    }
  }

  return { folded, origStartMap, origEndMap };
}

/**
 * Highlights occurrences of query terms in the text with diacritic insensitivity.
 * Terms are whitespace-split, de-duplicated, and matched longest-first.
 * Segments slice the original text exactly without splitting surrogate pairs.
 *
 * @param text - The source text to highlight.
 * @param query - The search query.
 * @param opts - Highlighting configuration.
 * @returns An array of text segments covering the entire original string.
 */
export function highlight(text: string, query: string, opts?: HighlightOptions): Segment[] {
  const maxChars = opts?.maxChars ?? 100_000;
  const maxMarks = opts?.maxMarks ?? 50;

  if (typeof maxChars !== "number" || maxChars < 0 || !Number.isFinite(maxChars)) {
    throw new SearchKitError("maxChars must be a non-negative number", "INVALID_INPUT");
  }
  if (typeof maxMarks !== "number" || maxMarks < 0 || !Number.isFinite(maxMarks)) {
    throw new SearchKitError("maxMarks must be a non-negative number", "INVALID_INPUT");
  }
  if (text.length > maxChars) {
    throw new SearchKitError(
      `Text length ${text.length} exceeds maximum limit of ${maxChars}`,
      "TOO_LARGE",
    );
  }
  if (query.length > 10_000) {
    throw new SearchKitError("Query length exceeds maximum limit of 10000", "TOO_LARGE");
  }

  if (text.length === 0) {
    return [];
  }

  const rawTerms = query.trim().split(/\s+/).filter(Boolean);
  const foldedTermsSet = new Set<string>();
  for (const t of rawTerms) {
    const folded = foldString(t);
    if (folded.length > 0) {
      foldedTermsSet.add(folded);
    }
  }

  if (foldedTermsSet.size === 0 || maxMarks === 0) {
    return [{ text, match: false }];
  }

  const sortedTerms = Array.from(foldedTermsSet).sort((a, b) => b.length - a.length);
  const { folded, origStartMap, origEndMap } = buildFoldedView(text);

  if (folded.length === 0) {
    return [{ text, match: false }];
  }

  const occupied = new Uint8Array(folded.length);
  interface FoldedMatch {
    start: number;
    end: number;
  }
  const foldedMatches: FoldedMatch[] = [];

  for (const term of sortedTerms) {
    let pos = 0;
    while (pos <= folded.length - term.length) {
      const idx = folded.indexOf(term, pos);
      if (idx === -1) break;
      const end = idx + term.length;

      let isFree = true;
      for (let i = idx; i < end; i++) {
        if (occupied[i]) {
          isFree = false;
          break;
        }
      }
      if (isFree) {
        for (let i = idx; i < end; i++) {
          occupied[i] = 1;
        }
        foldedMatches.push({ start: idx, end });
        pos = end;
      } else {
        pos = idx + 1;
      }
    }
  }

  if (foldedMatches.length === 0) {
    return [{ text, match: false }];
  }

  foldedMatches.sort((a, b) => a.start - b.start);

  interface Range {
    start: number;
    end: number;
  }
  const origMatches: Range[] = [];
  for (const m of foldedMatches) {
    const oStart = origStartMap[m.start];
    const oEnd = origEndMap[m.end - 1];
    if (oStart !== undefined && oEnd !== undefined && oEnd > oStart) {
      origMatches.push({ start: oStart, end: oEnd });
    }
  }

  origMatches.sort((a, b) => a.start - b.start);
  const selectedMatches = origMatches.slice(0, maxMarks);

  const segments: Segment[] = [];
  function addSegment(segText: string, match: boolean) {
    if (!segText) return;
    const last = segments[segments.length - 1];
    if (last && last.match === match) {
      last.text += segText;
    } else {
      segments.push({ text: segText, match });
    }
  }

  let cursor = 0;
  for (const m of selectedMatches) {
    const start = Math.max(m.start, cursor);
    const end = Math.max(m.end, start);
    if (start > cursor) {
      addSegment(text.slice(cursor, start), false);
    }
    if (end > start) {
      addSegment(text.slice(start, end), true);
      cursor = end;
    }
  }

  if (cursor < text.length) {
    addSegment(text.slice(cursor), false);
  }

  return segments;
}

/**
 * Computes facet value counts for specified fields across an items list.
 * Values are counted once per item per field. Sorted by count descending, then value ascending.
 *
 * @param items - The collection of items.
 * @param fields - Facet field names to count.
 * @param opts - Options including maxValues.
 * @returns Map of field names to sorted facet count lists.
 */
export function facetCounts(
  items: Item[],
  fields: string[],
  opts?: FacetCountOptions,
): Record<string, FacetCountEntry[]> {
  if (items.length > 100_000) {
    throw new SearchKitError("Items array exceeds maximum limit of 100000", "TOO_LARGE");
  }
  if (fields.length > 1_000) {
    throw new SearchKitError("Fields array exceeds maximum limit of 1000", "TOO_LARGE");
  }
  const maxValues = opts?.maxValues ?? 1_000;
  if (typeof maxValues !== "number" || maxValues < 0 || !Number.isFinite(maxValues)) {
    throw new SearchKitError("maxValues must be a non-negative number", "INVALID_INPUT");
  }

  const result: Record<string, FacetCountEntry[]> = {};

  for (const field of fields) {
    const counts = new Map<string, number>();

    for (const item of items) {
      const raw = item[field];
      if (raw === undefined || raw === null) {
        continue;
      }
      const unique = new Set<string>();
      if (typeof raw === "string") {
        unique.add(raw);
      } else if (Array.isArray(raw)) {
        for (const v of raw) {
          if (typeof v === "string") {
            unique.add(v);
          }
        }
      }
      for (const val of unique) {
        counts.set(val, (counts.get(val) ?? 0) + 1);
      }
    }

    const entries: FacetCountEntry[] = Array.from(counts.entries()).map(([value, count]) => ({
      value,
      count,
    }));

    entries.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
    });

    result[field] = entries.slice(0, maxValues);
  }

  return result;
}

/**
 * Filters items matching active facet selections.
 * Logic is OR within a field, AND across fields. Fields with empty selection lists are ignored.
 *
 * @param items - The items to filter.
 * @param selected - Map of field names to selected value arrays.
 * @returns Items matching all active facet criteria.
 */
export function applyFacets(items: Item[], selected: Record<string, string[]>): Item[] {
  if (items.length > 100_000) {
    throw new SearchKitError("Items array exceeds maximum limit of 100000", "TOO_LARGE");
  }
  const activeEntries = Object.entries(selected).filter(
    ([, values]) => Array.isArray(values) && values.length > 0,
  );

  if (activeEntries.length === 0) {
    return [...items];
  }

  return items.filter((item) => {
    for (const [field, allowedValues] of activeEntries) {
      const raw = item[field];
      if (raw === undefined || raw === null) {
        return false;
      }
      const valSet = new Set(allowedValues);
      if (typeof raw === "string") {
        if (!valSet.has(raw)) return false;
      } else if (Array.isArray(raw)) {
        const matches = raw.some((v) => typeof v === "string" && valSet.has(v));
        if (!matches) return false;
      } else {
        return false;
      }
    }
    return true;
  });
}

/**
 * Pure state reducer for search UI state.
 * setQuery and toggleFacet reset page to 1. setPage requires an integer >= 1.
 *
 * @param state - The current search state.
 * @param action - Action to apply.
 * @returns New SearchState object.
 */
export function searchReducer(state: SearchState, action: Action): SearchState {
  if (!action || typeof action !== "object" || typeof action.type !== "string") {
    throw new SearchKitError("Invalid action", "INVALID_INPUT");
  }

  switch (action.type) {
    case "setQuery": {
      if (typeof action.query !== "string") {
        throw new SearchKitError("Query must be a string", "INVALID_INPUT");
      }
      if (action.query.length > 10_000) {
        throw new SearchKitError("Query exceeds maximum limit of 10000", "TOO_LARGE");
      }
      return {
        ...state,
        query: action.query,
        page: 1,
      };
    }
    case "toggleFacet": {
      if (typeof action.field !== "string" || typeof action.value !== "string") {
        throw new SearchKitError("Field and value must be strings", "INVALID_INPUT");
      }
      const currentValues = state.facets[action.field] ?? [];
      const exists = currentValues.includes(action.value);
      const nextValues = exists
        ? currentValues.filter((v) => v !== action.value)
        : [...currentValues, action.value];

      const nextFacets = { ...state.facets };
      if (nextValues.length === 0) {
        delete nextFacets[action.field];
      } else {
        nextFacets[action.field] = nextValues;
      }

      return {
        ...state,
        facets: nextFacets,
        page: 1,
      };
    }
    case "setPage": {
      if (typeof action.page !== "number" || !Number.isInteger(action.page) || action.page < 1) {
        throw new SearchKitError("Page must be an integer >= 1", "INVALID_INPUT");
      }
      return {
        ...state,
        page: action.page,
      };
    }
    case "reset": {
      return {
        query: "",
        facets: {},
        page: 1,
      };
    }
    default: {
      const exhaustiveCheck: never = action;
      throw new SearchKitError(
        `Unknown action type: ${(exhaustiveCheck as { type: string }).type}`,
        "INVALID_INPUT",
      );
    }
  }
}

/**
 * Renders results list markup with accessible live status and safe anchor links.
 *
 * @param state - Current query state.
 * @param items - Results items list.
 * @returns Exact HTML string representation.
 */
export function renderResults(state: { query: string }, items: Item[]): string {
  if (items.length > 100_000) {
    throw new SearchKitError("Items array exceeds maximum limit of 100000", "TOO_LARGE");
  }
  if (state.query.length > 10_000) {
    throw new SearchKitError("Query exceeds maximum limit of 10000", "TOO_LARGE");
  }

  const countText = items.length === 1 ? "1 result" : `${items.length} results`;
  const statusDiv = `<div role="status" aria-live="polite">${countText}</div>`;

  const itemLines = items.map((item) => {
    const titleSegments = highlight(item.title, state.query);
    const highlightedTitle = titleSegments
      .map((s) => (s.match ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text)))
      .join("");

    let linkOrTitle: string;
    if (isSafeUrl(item.url)) {
      linkOrTitle = `<a href="${escapeHtml(item.url ?? "").trimEnd()}">${highlightedTitle}</a>`;
    } else {
      linkOrTitle = highlightedTitle;
    }

    let snippetHtml = "";
    if (typeof item.snippet === "string") {
      const snippetSegments = highlight(item.snippet, state.query);
      const highlightedSnippet = snippetSegments
        .map((s) => (s.match ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text)))
        .join("");
      snippetHtml = `<p>${highlightedSnippet}</p>`;
    }

    return `<li>${linkOrTitle}${snippetHtml}</li>`;
  });

  const listContent = itemLines.length > 0 ? `${itemLines.join("\n")}\n` : "";
  const ul = `<ul class="sk-results">\n${listContent}</ul>`;

  return `${statusDiv}\n${ul}`;
}

/**
 * Renders facet controls using fieldsets, legends, and checkbox inputs.
 *
 * @param counts - Facet count entries by field.
 * @param selected - Active facet selections by field.
 * @returns Accessible HTML string for facet navigation.
 */
export function renderFacets(
  counts: Record<string, FacetCountEntry[]>,
  selected: Record<string, string[]>,
): string {
  if (Object.keys(counts).length > 1_000) {
    throw new SearchKitError("Counts fields exceed maximum limit of 1000", "TOO_LARGE");
  }
  const fieldsets: string[] = [];

  for (const [field, entries] of Object.entries(counts)) {
    const legend = escapeHtml(field);
    const selectedSet = new Set(selected[field] ?? []);

    const lines = entries.map(({ value, count }) => {
      const escField = escapeHtml(field);
      const escValue = escapeHtml(value);
      const checkedAttr = selectedSet.has(value) ? " checked" : "";
      return `<label><input type="checkbox" name="${escField}" value="${escValue}"${checkedAttr}> ${escValue} (${count})</label>`;
    });

    const inner = lines.length > 0 ? `${lines.join("\n")}\n` : "";
    fieldsets.push(`<fieldset class="sk-facet"><legend>${legend}</legend>\n${inner}</fieldset>`);
  }

  return fieldsets.join("\n");
}
