# @trysac/search-ui-kit

Headless search UI kit: diacritic-insensitive highlighting, facet counts and filters, a search state reducer, and escaped, accessible HTML renderers with safe links.

## The Problem

Search front ends frequently re-implement highlighting, facet counting, and result rendering logic, often introducing bugs such as broken surrogate pairs or accents during highlighting, unsafe HTML injection, or insecure URL handling (e.g., `javascript:` links). This library provides a framework-agnostic, zero-dependency core that handles these logic and rendering concerns independently of any specific UI framework or DOM requirement.

## Installation

```bash
npm install @trysac/search-ui-kit
```

## Usage

```ts
import { highlight, searchReducer, renderResults } from "@trysac/search-ui-kit";

const state = { query: "cafe", facets: {}, page: 1 };
const items = [{ id: "1", title: "Caf&eacute; cr&egrave;me", url: "https://example.com/cafe" }];
const html = renderResults(state, items);
console.log(html);
```

## Public API Summary

- `highlight(text: string, query: string, opts?: HighlightOptions): Segment[]`: Diacritic-insensitive highlighting that maps segments to the original text. `opts` include `maxMarks` (default 50) and `maxChars` (default 100,000).
- `facetCounts(items: Item[], fields: string[], opts?: FacetCountOptions): Record<string, FacetCountEntry[]>`: Computes sorted facet values per field. `opts` include `maxValues` (default 1,000).
- `applyFacets(items: Item[], selected: Record<string, string[]>): Item[]`: Filters items using OR within fields and AND across fields.
- `searchReducer(state: SearchState, action: Action): SearchState`: Pure state management for search.
- `renderResults(state: { query: string }, items: Item[]): string`: Generates accessible HTML for search results.
- `renderFacets(counts: Record<string, FacetCountEntry[]>, selected: Record<string, string[]>): string`: Generates fieldset markup for facets.
- `escapeHtml(str: string): string`: Escapes HTML entities.
- `isSafeUrl(url: string | undefined): boolean`: Validates URL schemes.

### Limits and Errors

Public functions throw `SearchKitError` (with code `TOO_LARGE` or `INVALID_INPUT`) when limits are exceeded, such as items > 100,000 or text length > 100,000.

## Why not InstantSearch?

Unlike InstantSearch, this library has no backend coupling or framework dependencies. It provides a tiny, tested core that outputs exact, escaped markup, allowing full control over the UI layer.

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for the threat model and sanitization guarantees.

## License

MIT