# Architecture

## Overview

`@trysac/search-ui-kit` is a headless, framework-agnostic search UI toolkit that operates in Node.js and browser runtimes without DOM dependencies. It handles:

1. **Highlighting**: Diacritic-insensitive, code-point-aware substring matching that always projects back to slices of the original text.
2. **Facet Calculation & Filtering**: Set-based counting and multidimensional filtering (OR within field, AND across fields).
3. **Search State Machine**: An immutable reducer managing query, facet selections, and page pagination.
4. **HTML Rendering**: Deterministic, XSS-safe string generators with WAI-ARIA status regions and native form elements.

## Component Breakdown

### Unicode-Safe Highlighting

- Query terms are split on whitespace, folded via `str.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()`, and sorted longest-first.
- Original text is parsed code-point by code-point. Each folded code point records start and end indexes pointing back into the original UTF-16 code units.
- Multiple expanding code points or combining accents map to their original enclosing boundaries, guaranteeing that surrogate pairs and accents are never split or distorted.
- Matched intervals are deduplicated and merged left-to-right.

### URL Sanitization

- Anchor tags are only generated for safe protocols (`http:`, `https:`, `mailto:`) or root-relative paths starting with a single `/`.
- Follows WHATWG URL parsing guidelines by stripping C0 controls, spaces, tabs, and newlines prior to scheme inspection.
- Unsafe URLs (such as `javascript:` or `data:`) cause the title to be rendered as plain text without an `<a>` wrapper.

### Accessibility (A11y)

- `renderResults` emits a `<div role="status" aria-live="polite">` element so assistive technologies announce result set size updates.
- `renderFacets` uses semantic `<fieldset>` and `<legend>` blocks, wrapping checkboxes inside `<label>` elements so every input has an implicit accessible name without requiring ARIA overrides.
