### What the divider looks like

One line of dashes with the name in it, placed below the main export and above
the helpers it calls. No second divider, no `// ====` block, and no divider at
all in a file with nothing to split.

```typescript
// =============================================================================
// Authenticated Fetch
// =============================================================================

export async function authenticatedFetch(…) { … }

// ---- Helpers ----------------------------------------------------------------

function fetchWith(token, input, options): Promise<Response> { … }

function isReplayable(input, options): boolean { … }
```

**✗** A banner block, a one-line `====` banner, or a divider per group of
helpers.

```typescript
// =============================================================================
// Helpers
// =============================================================================

// ======== Request ============================================================
```
