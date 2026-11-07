# Decoupled headless search kit with safe string rendering

Status: accepted (generated, pending human review)

## Context

Search front-ends frequently reimplement diacritic-insensitive highlighting, facet counting, search state management, and HTML rendering with ad-hoc string concatenation. These implementations commonly suffer from surrogate pair corruption, XSS vulnerabilities through raw attribute or content interpolation, and javascript: URL injection.

## Decision

Implement a zero-dependency headless search UI library with Unicode NFD normalization for diacritic-insensitive highlighting that maps back to original code units, an immutable search reducer, strict WHATWG-aligned URL safety validation, and escaped HTML renderers for accessible status announcements, result lists, and facet fieldsets.

## Consequences

Consumers obtain an accessible, secure search UI core that functions identically across browser and Node.js environments without DOM dependencies or backend lock-in. Custom rendering remains possible via the pure segmentation and state functions, while default renderers provide safe markup out of the box.
