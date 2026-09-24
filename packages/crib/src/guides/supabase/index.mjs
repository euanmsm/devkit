import { start } from './start.mjs';
import { db } from './db.mjs';
import { migration } from './migration.mjs';
import { gen } from './gen.mjs';
import { functions } from './functions.mjs';
import { secrets } from './secrets.mjs';
import { storage } from './storage.mjs';
import { inspect } from './inspect.mjs';
import { test } from './test.mjs';
import { branches } from './branches.mjs';
import { projects } from './projects.mjs';
import { infra } from './infra.mjs';
import { misc } from './misc.mjs';

export const supabase = {
  name: 'supabase',
  title: 'supabase — Supabase CLI',
  summary: 'Supabase CLI',
  intro: [
    { kind: 'note', text: 'Global flags:' },
    { kind: 'flag', name: '--debug', desc: 'Output debug logs to stderr' },
    {
      kind: 'flag',
      name: '-o, --output <env|pretty|json|toml|yaml>',
      desc: 'Output format (default: pretty)',
    },
    { kind: 'flag', name: '--workdir <path>', desc: 'Project directory path' },
    {
      kind: 'flag',
      name: '--experimental',
      desc: 'Enable experimental features',
    },
    { kind: 'flag', name: '--yes', desc: 'Answer yes to all prompts' },
  ],
  topics: [
    start,
    db,
    migration,
    gen,
    functions,
    secrets,
    storage,
    inspect,
    test,
    branches,
    projects,
    infra,
    misc,
  ],
};
