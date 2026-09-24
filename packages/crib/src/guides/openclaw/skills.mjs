export const skills = {
  name: 'skills',
  description: 'Install & manage agent skills',
  sections: [
    {
      title: 'Skills — Install & Manage Agent Skills',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw skills list',
          desc: 'List all available skills',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            {
              kind: 'flag',
              name: '--verbose',
              desc: 'Include missing requirements',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw skills search [query...]',
          desc: 'Search ClawHub for skills',
          children: [
            { kind: 'flag', name: '--limit <n>', desc: 'Cap search results' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw skills info <skill>',
          desc: 'Show detailed info about a skill',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw skills install <slug>',
          desc: 'Install a skill from ClawHub',
          children: [
            {
              kind: 'flag',
              name: '--version <version>',
              desc: 'Install specific version',
            },
            {
              kind: 'flag',
              name: '--force',
              desc: 'Overwrite existing workspace skill',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw skills update <slug|--all>',
          desc: 'Update tracked ClawHub skills',
        },
        {
          kind: 'cmd',
          name: 'openclaw skills check',
          desc: 'Check which skills are ready vs missing deps',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            { kind: 'note', text: 'Skills marketplace: https://clawhub.com' },
            {
              kind: 'note',
              text: 'Always review skills before installing — prompt injection risk',
            },
          ],
        },
      ],
    },
  ],
};
