# Security Model

## Threat Model & Defenses

### Cross-Site Scripting (XSS)

- **Defended**: All rendered text nodes and HTML attributes pass through `escapeHtml`, encoding `&`, `<`, `>`, `"`, and `'` as their respective entities.

### Malicious URL Injection

- **Defended**: `isSafeUrl` follows WHATWG URL parsing by stripping C0 controls, spaces, tabs, and newlines. Only `http:`, `https:`, `mailto:`, and single-slash root-relative paths (`/`) are accepted. `javascript:`, `data:`, and `//` are rejected.

### Denial of Service

- **Defended**: Hard limits on inputs prevent resource exhaustion:
  - `highlight`: `maxChars` (default 100,000), `maxMarks` (default 50), query (10,000).
  - `facetCounts`, `renderResults`: items (100,000), fields (1,000).
  - Violations throw `SearchKitError` with `TOO_LARGE` code.

- **Not Defended**: The library does not perform regex optimization for extremely pathological user-provided regular expression strings in search, though search terms are split by whitespace, not used directly in a regex engine.