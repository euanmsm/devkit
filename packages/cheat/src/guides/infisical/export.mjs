export const export_ = {
  name: 'export',
  description: 'Export secrets to a file or stdout',
  sections: [
    {
      title: 'export — Export secrets to file/stdout',
      items: [
        {
          kind: 'cmd',
          name: 'infisical export',
          desc: 'Export environment variables',
          children: [
            {
              kind: 'flag',
              name: '-e, --env <env>',
              desc: 'Environment (default: dev)',
            },
            {
              kind: 'flag',
              name: '-f, --format <dotenv|json|csv>',
              desc: 'Output format (default: dotenv)',
            },
            {
              kind: 'flag',
              name: '-o, --output-file <path>',
              desc: 'Output file path',
            },
            { kind: 'flag', name: '--path <path>', desc: 'Folder path' },
            { kind: 'flag', name: '--recursive', desc: 'Include sub-folders' },
            {
              kind: 'flag',
              name: '--expand',
              desc: 'Expand variables (default: true)',
            },
            {
              kind: 'flag',
              name: '--include-imports',
              desc: 'Include linked secrets (default: true)',
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
              name: '--template <path>',
              desc: 'Template file for rendering',
            },
            { kind: 'flag', name: '--token <token>', desc: 'Access token' },
          ],
        },
      ],
    },
  ],
};
