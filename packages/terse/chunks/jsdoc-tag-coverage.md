### JSDoc documents every parameter, the return and the throws

A block that exists is not the same as a block that says anything. Every
parameter in the signature gets a `@param` naming it, a function returning a
value gets a `@returns`, and a function with a `throw` of its own gets a
`@throws`. A `@param` naming a parameter the signature no longer has is a
finding too — that is a block left behind after a rename.

Only the allowed tags are required, so dropping one from that list drops it from
this rule too. A destructured parameter documents as one `@param` named for the
object, not as one per key.

**✗**

```typescript
/** Fetches a paper. */
function fetchPaper(id: string): Promise<Paper> {
  if (!id) throw new Error('no id');
  return db.papers.find(id);
}
```

**✓**

```typescript
/**
 * Fetches a paper.
 *
 * @param id - The paper's id
 * @returns The paper
 * @throws When the id is empty
 */
function fetchPaper(id: string): Promise<Paper> {
  if (!id) throw new Error('no id');
  return db.papers.find(id);
}
```
