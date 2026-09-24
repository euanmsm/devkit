export const secrets = {
  name: 'secrets',
  description: 'Get, set, list and delete secrets',
  sections: [
    {
      title: 'secrets — Manage secrets',
      items: [
        {
          kind: 'cmd',
          name: 'infisical secrets',
          desc: 'List secrets for current env',
          children: [
            {
              kind: 'flag',
              name: '-e, --env <env>',
              desc: 'Environment (default: dev)',
            },
            {
              kind: 'flag',
              name: '--path <path>',
              desc: 'Folder path (default: /)',
            },
            { kind: 'flag', name: '--recursive', desc: 'Include sub-folders' },
            {
              kind: 'flag',
              name: '--include-imports',
              desc: 'Include linked secrets (default: true)',
            },
            {
              kind: 'flag',
              name: '--expand',
              desc: 'Expand shell variables (default: true)',
            },
            {
              kind: 'flag',
              name: '--secret-overriding',
              desc: 'Personal > shared (default: true)',
            },
            {
              kind: 'flag',
              name: '-t, --tags <slugs>',
              desc: 'Filter by tags',
            },
            {
              kind: 'flag',
              name: '-o, --output <yaml|json|dotenv>',
              desc: 'Output format',
            },
            { kind: 'flag', name: '--token <token>', desc: 'Access token' },
            { kind: 'flag', name: '--projectId <id>', desc: 'Project ID' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical secrets get <NAME>...',
          desc: 'Get specific secrets',
          children: [
            {
              kind: 'flag',
              name: '--plain',
              desc: 'Values only, one per line',
            },
            { kind: 'note', text: 'Inherits all list flags' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical secrets set <KEY=VALUE>...',
          desc: 'Set secrets',
          children: [
            {
              kind: 'flag',
              name: '--file <path>',
              desc: 'Load from .env or YAML file',
            },
            {
              kind: 'flag',
              name: '--type <personal|shared>',
              desc: 'Secret type (default: shared)',
            },
            { kind: 'flag', name: '--path <path>', desc: 'Folder path' },
            {
              kind: 'flag',
              name: '-o, --output <format>',
              desc: 'Output format',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical secrets delete <NAME>...',
          desc: 'Delete secrets',
          children: [
            {
              kind: 'flag',
              name: '--type <personal|shared>',
              desc: 'Type to delete (default: personal)',
            },
            { kind: 'flag', name: '--path <path>', desc: 'Folder path' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical secrets generate-example-env',
          desc: 'Generate .example-env',
          children: [
            { kind: 'flag', name: '--path <path>', desc: 'Folder path' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical secrets folders get',
          desc: 'List folders',
          children: [
            { kind: 'flag', name: '-p, --path <path>', desc: 'Parent path' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical secrets folders create',
          desc: 'Create folder',
          children: [
            { kind: 'flag', name: '-n, --name <name>', desc: 'Folder name' },
            { kind: 'flag', name: '-p, --path <path>', desc: 'Parent path' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical secrets folders delete',
          desc: 'Delete folder',
          children: [
            { kind: 'flag', name: '-n, --name <name>', desc: 'Folder name' },
            { kind: 'flag', name: '-p, --path <path>', desc: 'Parent path' },
          ],
        },
      ],
    },
  ],
};
