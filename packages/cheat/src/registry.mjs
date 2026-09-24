// Which tools have guides, and how to load one.
//
// Summaries live here rather than in the guides so that `cheat` with no
// arguments can print the list without loading any content. Guides are
// imported lazily, so `cheat gh --pr` reads gh and nothing else.
//
// To add a tool: create src/guides/<name>/, then add a line here.

/**
 * @typedef {object} Entry
 * @property {string} name
 * @property {string} summary
 * @property {() => Promise<Guide>} load
 */

export const registry = [
  {
    name: 'gh',
    summary: 'GitHub CLI',
    load: async () => (await import('./guides/gh/index.mjs')).gh,
  },
  {
    name: 'git',
    summary: 'Git',
    load: async () => (await import('./guides/git/index.mjs')).git,
  },
  {
    name: 'infisical',
    summary: 'Infisical CLI',
    load: async () => (await import('./guides/infisical/index.mjs')).infisical,
  },
  {
    name: 'lsof',
    summary: 'List open files & network sockets',
    load: async () => (await import('./guides/lsof/index.mjs')).lsof,
  },
  {
    name: 'openclaw',
    summary: 'OpenClaw self-hosted AI assistant',
    load: async () => (await import('./guides/openclaw/index.mjs')).openclaw,
  },
  {
    name: 'rg',
    summary: 'ripgrep — recursive search',
    load: async () => (await import('./guides/rg/index.mjs')).rg,
  },
  {
    name: 'supabase',
    summary: 'Supabase CLI',
    load: async () => (await import('./guides/supabase/index.mjs')).supabase,
  },
];

export function findEntry(name) {
  const want = name.toLowerCase();
  return registry.find((e) => e.name === want);
}
