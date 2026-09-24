export const misc = {
  name: 'misc',
  description: 'init, reset, bootstrap, completion',
  sections: [
    {
      title: 'Other commands',
      items: [
        {
          kind: 'cmd',
          name: 'infisical bootstrap',
          desc: 'Bootstrap self-hosted instance',
          children: [
            {
              kind: 'flag',
              name: '--email / --password',
              desc: 'Admin credentials',
            },
            { kind: 'flag', name: '--organization <name>', desc: 'Org name' },
            {
              kind: 'flag',
              name: '--output <json|k8-secret>',
              desc: 'Output format',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical relay start',
          desc: 'Start relay node',
          children: [
            { kind: 'flag', name: '--name <name>', desc: 'Relay name' },
            { kind: 'flag', name: '--host <host>', desc: 'IP or hostname' },
            { kind: 'flag', name: '--type <org|instance>', desc: 'Relay type' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical cert-manager agent',
          desc: 'Certificate agent',
          children: [
            { kind: 'flag', name: '--config <path>', desc: 'Config YAML' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical kmip start',
          desc: 'Start KMIP server',
          children: [
            {
              kind: 'flag',
              name: '--listen-address <addr>',
              desc: 'Listen address (default: localhost:5696)',
            },
            { kind: 'flag', name: '--server-name <name>', desc: 'Server name' },
            {
              kind: 'flag',
              name: '--certificate-ttl <dur>',
              desc: 'Cert TTL (default: 1y)',
            },
          ],
        },
      ],
    },
  ],
};
