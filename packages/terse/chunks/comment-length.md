### One sentence, one clause, {{commentMaxChars}} characters

No semicolons, no stacked em-dash clauses, no subordinate-clause pile-ups. A
second sentence means there are two comments, and probably one too many.

**✗**

```typescript
// Builds the payload for the provider; note that the email field is optional here, and when absent the provider fills it from the account.
```

**✓**

```typescript
// An absent email is filled by the provider from the account.
```
