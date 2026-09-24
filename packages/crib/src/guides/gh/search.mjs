export const search = {
  name: 'search',
  description: 'Search repos, code, issues and PRs',
  sections: [
    {
      title: 'search — Search across GitHub',
      items: [
        {
          kind: 'cmd',
          name: 'gh search repos <query>',
          desc: 'Search repositories',
          children: [
            {
              kind: 'flag',
              name: '--language / --license / --topic',
              desc: 'Filters',
            },
            {
              kind: 'flag',
              name: '--stars / --forks / --followers',
              desc: 'Numeric filters',
            },
            {
              kind: 'flag',
              name: '--visibility <public|private>',
              desc: 'Visibility',
            },
            { kind: 'flag', name: '--sort / --order', desc: 'Sort and order' },
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max results (default 30)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh search issues <query>',
          desc: 'Search issues',
          children: [
            {
              kind: 'flag',
              name: '--author / --assignee / --label',
              desc: 'Filters',
            },
            {
              kind: 'flag',
              name: '--state <open|closed>',
              desc: 'State filter',
            },
            { kind: 'flag', name: '--sort / --order', desc: 'Sort and order' },
            {
              kind: 'flag',
              name: '--include-prs',
              desc: 'Include pull requests',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh search prs <query>',
          desc: 'Search pull requests',
          children: [
            {
              kind: 'flag',
              name: '--author / --assignee / --label',
              desc: 'Filters',
            },
            {
              kind: 'flag',
              name: '--state / --draft / --merged',
              desc: 'State filters',
            },
            {
              kind: 'flag',
              name: '-B, --base / -H, --head',
              desc: 'Branch filters',
            },
            {
              kind: 'flag',
              name: '--checks / --review',
              desc: 'Check/review filters',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh search commits <query>',
          desc: 'Search commits',
          children: [
            {
              kind: 'flag',
              name: '--author / --committer',
              desc: 'Person filters',
            },
            {
              kind: 'flag',
              name: '--author-date / --committer-date',
              desc: 'Date filters',
            },
            { kind: 'flag', name: '-R, --repo <strings>', desc: 'Repo filter' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh search code <query>',
          desc: 'Search code',
          children: [
            {
              kind: 'flag',
              name: '--extension / --filename',
              desc: 'File filters',
            },
            {
              kind: 'flag',
              name: '--language / --owner',
              desc: 'Language/owner filters',
            },
            {
              kind: 'flag',
              name: '--match <file|path>',
              desc: 'Restrict match location',
            },
          ],
        },
      ],
    },
  ],
};
