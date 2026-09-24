export const memory = {
  name: 'memory',
  description: 'Search & manage memory files',
  sections: [
    {
      title: 'Memory — Search & Manage Memory Files',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw memory status',
          desc: 'Show memory index and provider status',
          children: [
            {
              kind: 'flag',
              name: '--deep',
              desc: 'Include vector + embedding readiness checks',
            },
            {
              kind: 'flag',
              name: '--fix',
              desc: 'Repair stale recall artifacts',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw memory index',
          desc: 'Reindex memory files',
          children: [
            { kind: 'flag', name: '--force', desc: 'Force a full reindex' },
            {
              kind: 'flag',
              name: '--all',
              desc: 'Re-index all memory files',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw memory search "query"',
          desc: 'Semantic search over memory',
          children: [
            { kind: 'flag', name: '--query <query>', desc: 'Query text' },
            {
              kind: 'flag',
              name: '--max-results <n>',
              desc: 'Limit search results',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw memory promote',
          desc: 'Rank short-term recalls for long-term',
          children: [
            {
              kind: 'flag',
              name: '--limit <n>',
              desc: 'Review top N candidates',
            },
            {
              kind: 'flag',
              name: '--apply',
              desc: 'Append top candidates to MEMORY.md',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw memory promote-explain "topic"',
          desc: "Explain why a candidate would/wouldn't promote",
        },
        {
          kind: 'cmd',
          name: 'openclaw memory rem-harness --json',
          desc: 'Preview REM reflections without writing',
        },
      ],
    },
  ],
};
