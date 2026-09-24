export const gen = {
  name: 'gen',
  description: 'Generate types and keys',
  sections: [
    {
      title: 'gen — Code generation',
      items: [
        {
          kind: 'cmd',
          name: 'supabase gen types',
          desc: 'Generate types from schema',
          children: [
            {
              kind: 'flag',
              name: '--lang <ts|go|swift|python>',
              desc: 'Language (default: typescript)',
            },
            {
              kind: 'flag',
              name: '-s, --schema <names>',
              desc: 'Schemas to include',
            },
            {
              kind: 'flag',
              name: '--linked / --local',
              desc: 'Source database',
            },
            {
              kind: 'flag',
              name: '--db-url <url>',
              desc: 'Custom database URL',
            },
            {
              kind: 'flag',
              name: '--project-id <id>',
              desc: 'From project ID',
            },
            {
              kind: 'flag',
              name: '--postgrest-v9-compat',
              desc: 'PostgREST v9 compat',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase gen bearer-jwt',
          desc: 'Generate Data API JWT',
          children: [
            { kind: 'flag', name: '--role <role>', desc: 'Postgres role' },
            {
              kind: 'flag',
              name: '--sub <user-id>',
              desc: 'User ID (default: anonymous)',
            },
            { kind: 'flag', name: '--exp <time>', desc: 'Expiry timestamp' },
            {
              kind: 'flag',
              name: '--valid-for <dur>',
              desc: 'Validity (default: 30m)',
            },
            { kind: 'flag', name: '--payload <json>', desc: 'Custom claims' },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase gen signing-key',
          desc: 'Generate JWT signing key',
          children: [
            {
              kind: 'flag',
              name: '--algorithm <RS256|ES256>',
              desc: 'Algorithm (default: ES256)',
            },
            { kind: 'flag', name: '--append', desc: 'Append to existing keys' },
          ],
        },
      ],
    },
  ],
};
