### Every property carries one line of JSDoc

Single-line `/** … */` form, saying **what the property is**. One sentence, one
clause — a full stop in the middle means it is too long. No default, no
constraint, no consequence, no rationale.

**✗**

```typescript
interface ServiceOptions {
  /** Postgres connection string. Migrations run against this before the listener opens, so a bad value fails startup. */
  databaseUrl: string;
}
```

**✓**

```typescript
interface ServiceOptions {
  /** Postgres connection string. */
  databaseUrl: string;
}
```
