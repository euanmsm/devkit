### State what is true, do not argue for it

No `because`, `so that`, `rather than`, `which is what`, `the reason`,
`deliberately`, `prevents`, `defaults to`, `falls back`, `otherwise`. Trade-offs
go in the pull request body, where they are reviewed and then archived.

**✗**

```typescript
// Retries three times rather than once, so that a flaky provider does not fail the run.
```

**✓**

```typescript
// Three attempts, two seconds apart.
```
