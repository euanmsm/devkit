export const security = {
  name: 'security',
  description: 'Security audit & secrets management',
  sections: [
    {
      title: 'Security & Secrets',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw security audit',
          desc: 'Run a local security audit',
          children: [
            {
              kind: 'flag',
              name: '--deep',
              desc: 'Include live gateway probe checks',
            },
            {
              kind: 'flag',
              name: '--fix',
              desc: 'Apply safe remediations + file permission fixes',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            {
              kind: 'flag',
              name: '--token <token>',
              desc: 'Explicit token for deep probe',
            },
            {
              kind: 'flag',
              name: '--password <password>',
              desc: 'Explicit password for deep probe',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw secrets reload',
          desc: 'Reload secret references at gateway',
          children: [
            {
              kind: 'flag',
              name: '--url, --token, --timeout, --expect-final',
              desc: 'RPC options',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw secrets audit',
          desc: 'Audit SecretRef usage and resolution',
          children: [
            {
              kind: 'flag',
              name: '--check',
              desc: 'Exit non-zero on findings',
            },
            {
              kind: 'flag',
              name: '--allow-exec',
              desc: 'Enable exec checks',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw secrets configure',
          desc: 'Interactive secrets configuration',
          children: [
            { kind: 'flag', name: '--apply', desc: 'Apply configuration' },
            { kind: 'flag', name: '--yes', desc: 'Accept defaults' },
            {
              kind: 'flag',
              name: '--providers-only',
              desc: 'Configure providers only',
            },
            {
              kind: 'flag',
              name: '--skip-provider-setup',
              desc: 'Skip provider setup',
            },
            {
              kind: 'flag',
              name: '--agent <id>',
              desc: 'Configure for specific agent',
            },
            {
              kind: 'flag',
              name: '--allow-exec',
              desc: 'Enable exec checks',
            },
            {
              kind: 'flag',
              name: '--plan-out <path>',
              desc: 'Save plan to file',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw secrets apply --from <path>',
          desc: 'Apply secrets from plan file',
          children: [
            {
              kind: 'flag',
              name: '--dry-run',
              desc: 'Validate without applying',
            },
            {
              kind: 'flag',
              name: '--allow-exec',
              desc: 'Enable exec checks',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
      ],
    },
  ],
};
