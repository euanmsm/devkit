export const secrets = {
  name: 'secrets',
  description: 'Repo and org secrets and variables',
  sections: [
    {
      title: 'secret — Manage secrets',
      items: [
        {
          kind: 'cmd',
          name: 'gh secret set <name>',
          desc: 'Set a secret',
          children: [
            { kind: 'flag', name: '-b, --body <value>', desc: 'Secret value' },
            {
              kind: 'flag',
              name: '-f, --env-file <file>',
              desc: 'Load from .env file',
            },
            {
              kind: 'flag',
              name: '-e, --env <env>',
              desc: 'Target environment',
            },
            {
              kind: 'flag',
              name: '-o, --org <org>',
              desc: 'Target organization',
            },
            { kind: 'flag', name: '-u, --user', desc: 'Target user' },
            {
              kind: 'flag',
              name: '-a, --app <actions|codespaces|dependabot>',
              desc: 'Target app',
            },
            {
              kind: 'flag',
              name: '-v, --visibility <all|private|selected>',
              desc: 'Org visibility',
            },
            {
              kind: 'flag',
              name: '-r, --repos <repos>',
              desc: 'Repos that can access (org/user)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh secret list',
          desc: 'List secrets',
          children: [
            {
              kind: 'flag',
              name: '-e, --env / -o, --org / -u, --user',
              desc: 'Scope',
            },
            { kind: 'flag', name: '-a, --app <app>', desc: 'App filter' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh secret delete <name>',
          desc: 'Delete a secret',
        },
      ],
    },
    {
      title: 'variable — Manage variables',
      items: [
        {
          kind: 'cmd',
          name: 'gh variable set <name>',
          desc: 'Set a variable',
          children: [
            {
              kind: 'flag',
              name: '-b, --body <value>',
              desc: 'Variable value',
            },
            {
              kind: 'flag',
              name: '-f, --env-file <file>',
              desc: 'Load from .env file',
            },
            { kind: 'flag', name: '-e, --env / -o, --org', desc: 'Scope' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh variable get <name>',
          desc: 'Get a variable',
        },
        {
          kind: 'cmd',
          name: 'gh variable list',
          desc: 'List variables',
        },
        {
          kind: 'cmd',
          name: 'gh variable delete <name>',
          desc: 'Delete a variable',
        },
      ],
    },
  ],
};
