export const backup = {
  name: 'backup',
  description: 'Backup & restore',
  sections: [
    {
      title: 'Backup & Restore',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw backup create',
          desc: 'Create backup archive (config, creds, sessions, workspaces)',
          children: [
            { kind: 'flag', name: '--output <path>', desc: 'Archive path' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            { kind: 'flag', name: '--dry-run', desc: 'Preview only' },
            {
              kind: 'flag',
              name: '--verify',
              desc: 'Verify archive after creation',
            },
            { kind: 'flag', name: '--only-config', desc: 'Config only' },
            {
              kind: 'flag',
              name: '--no-include-workspace',
              desc: 'Exclude workspace',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw backup verify <archive>',
          desc: 'Validate a backup archive + manifest',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
      ],
    },
  ],
};
