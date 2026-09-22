### Every file opens with a header

A `// ====` banner block at the top of the file, before the imports.

**✗**

```typescript
import type { FastifyInstance } from 'fastify';

export default async function health(app: FastifyInstance): Promise<void> {
```

**✓**

```typescript
// ============================================================================
// Health Route
// ============================================================================
//
// Liveness for the box's monitoring. Says nothing about providers or database.

import type { FastifyInstance } from 'fastify';
```
