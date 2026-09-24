export const api = {
  name: 'api',
  description: 'Authenticated REST and GraphQL requests',
  sections: [
    {
      title: 'api — Make authenticated API requests',
      items: [
        {
          kind: 'cmd',
          name: 'gh api <endpoint>',
          desc: 'Call GitHub API',
          children: [
            {
              kind: 'flag',
              name: '-X, --method <method>',
              desc: 'HTTP method (default GET)',
            },
            {
              kind: 'flag',
              name: '-F, --field <key=value>',
              desc: 'Typed parameter',
            },
            {
              kind: 'flag',
              name: '-f, --raw-field <key=value>',
              desc: 'String parameter',
            },
            {
              kind: 'flag',
              name: '-H, --header <key:value>',
              desc: 'HTTP header',
            },
            {
              kind: 'flag',
              name: '--input <file>',
              desc: 'Request body from file',
            },
            { kind: 'flag', name: '--paginate', desc: 'Fetch all pages' },
            {
              kind: 'flag',
              name: '--slurp',
              desc: 'With --paginate, wrap in array',
            },
            { kind: 'flag', name: '-q, --jq <expr>', desc: 'jq filter' },
            {
              kind: 'flag',
              name: '-t, --template <tmpl>',
              desc: 'Go template',
            },
            {
              kind: 'flag',
              name: '--cache <duration>',
              desc: 'Cache response',
            },
            {
              kind: 'flag',
              name: '-i, --include',
              desc: 'Include HTTP headers',
            },
            {
              kind: 'flag',
              name: '--verbose',
              desc: 'Full HTTP request/response',
            },
            {
              kind: 'flag',
              name: '--silent',
              desc: "Don't print response body",
            },
            {
              kind: 'flag',
              name: '--hostname <host>',
              desc: 'GitHub hostname',
            },
          ],
        },
      ],
    },
  ],
};
