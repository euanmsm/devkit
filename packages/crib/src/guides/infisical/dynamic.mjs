export const dynamic = {
  name: 'dynamic',
  description: 'Dynamic secrets',
  sections: [
    {
      title: 'dynamic-secrets — Dynamic secret management',
      items: [
        {
          kind: 'cmd',
          name: 'infisical dynamic-secrets',
          desc: 'List dynamic secrets',
          children: [
            {
              kind: 'flag',
              name: '--env <env>',
              desc: 'Environment (default: dev)',
            },
            { kind: 'flag', name: '--path <path>', desc: 'Folder path' },
            {
              kind: 'flag',
              name: '--project-slug <slug>',
              desc: 'Project slug',
            },
            {
              kind: 'flag',
              name: '-o, --output <format>',
              desc: 'Output format',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical dynamic-secrets lease create <name>',
          desc: 'Create lease',
          children: [
            { kind: 'flag', name: '--ttl <duration>', desc: 'Lease TTL' },
            { kind: 'flag', name: '--plain', desc: 'No formatting' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical dynamic-secrets lease list <name>',
          desc: 'List leases',
        },
        {
          kind: 'cmd',
          name: 'infisical dynamic-secrets lease renew <id>',
          desc: 'Renew lease',
          children: [
            { kind: 'flag', name: '--ttl <duration>', desc: 'Renewal TTL' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical dynamic-secrets lease delete <id>',
          desc: 'Delete lease',
        },
      ],
    },
  ],
};
