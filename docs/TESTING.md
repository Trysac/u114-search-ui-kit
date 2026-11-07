# Testing Guide

## Test Coverage

- `test/index.test.ts`: Contains the entire test suite, covering all 6 public API functions, error handling, and security scenarios.

## Test Scenarios

- **Acceptance Tests**: Verifies exact output for specific highlighting, result rendering, and facet operations as defined in the technical specification.
- **Security & Adversarial**: Tests `isSafeUrl` against C0 controls, tabs, newlines, and prohibited protocols (`javascript:`, `data:`). Verifies XSS escaping of `<script>` and quotes.
- **Unicode**: Ensures surrogate pairs and decomposed NFD characters are never split during highlighting.
- **Bounds & Errors**: Validates `SearchKitError` is thrown for inputs exceeding defined size limits.