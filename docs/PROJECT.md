# Project Record

## Objective

Provide an enterprise-grade, headless search UI library with Unicode-correct diacritic-insensitive highlighting, facet calculations, search reducer, and XSS-safe HTML renderers.

## Scope

- Highlighting logic with Unicode-safe index mapping.
- Facet counting and filtering (OR within field, AND across fields).
- State management via pure reducers.
- HTML string generation for results and facet controls.
- URL sanitization.

## Out of Scope

- Integration with frameworks (React, Vue, etc.).
- Network search clients.
- Keyboard-driven combobox widgets.
- CSS styling (class names only are provided).

## Factory run u114 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | gemini-3.8-flash | yes | 4533 | 54303 | 0 | 0 | 0.1035 |
| fix-1 | gemini-3.8-flash | no | 80022 | 1865 | 0 | 448928 | 0.1007 |
| audit | gemini-3.1-flash-lite | no | 47747 | 322 | 0 | 91639 | 0.0147 |
| fix-2 | gemini-3.8-flash | no | 29094 | 423 | 0 | 27907 | 0.0255 |
| docs | gemini-3.1-flash-lite | no | 15553 | 1470 | 0 | 0 | 0.0061 |

Total: $0.2505. Prices: Anthropic list prices.
