export const infra = {
  name: 'infra',
  description: 'Agent, gateway and PAM',
  sections: [
    {
      title: 'Infrastructure',
      items: [
        {
          kind: 'cmd',
          name: 'infisical agent',
          desc: 'Launch client daemon',
          children: [
            {
              kind: 'flag',
              name: '--config <path>',
              desc: 'Config YAML (default: agent-config.yaml)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical gateway start',
          desc: 'Start gateway',
          children: [
            { kind: 'flag', name: '--name <name>', desc: 'Gateway name' },
            { kind: 'flag', name: '--token <token>', desc: 'Access token' },
            {
              kind: 'flag',
              name: '--auth-method <method>',
              desc: 'Auth method',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical gateway relay',
          desc: 'Start relay',
          children: [
            {
              kind: 'flag',
              name: '--config <path>',
              desc: 'Relay config YAML',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical gateway systemd install / uninstall',
          desc: 'Systemd management',
        },
        {
          kind: 'cmd',
          name: 'infisical proxy start',
          desc: 'Start caching proxy',
          children: [
            {
              kind: 'flag',
              name: '--listen-address <addr>',
              desc: 'Listen address (default: localhost:8081)',
            },
            {
              kind: 'flag',
              name: '--tls-enabled',
              desc: 'Enable TLS (default: true)',
            },
            {
              kind: 'flag',
              name: '--tls-cert-file / --tls-key-file',
              desc: 'TLS cert and key paths',
            },
            {
              kind: 'flag',
              name: '--static-secrets-refresh-interval',
              desc: 'Cache refresh (default: 1h)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical pam db access',
          desc: 'Database PAM access',
          children: [
            { kind: 'flag', name: '--resource <name>', desc: 'PAM resource' },
            { kind: 'flag', name: '--account <name>', desc: 'Account' },
            { kind: 'flag', name: '--project-id <id>', desc: 'Project ID' },
            {
              kind: 'flag',
              name: '--duration <dur>',
              desc: 'Session duration (default: 1h)',
            },
            {
              kind: 'flag',
              name: '--port <n>',
              desc: 'Local proxy port (0 = auto)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical pam kubernetes access',
          desc: 'K8s PAM access',
        },
        {
          kind: 'cmd',
          name: 'infisical pam redis access',
          desc: 'Redis PAM access',
        },
        {
          kind: 'cmd',
          name: 'infisical pam ssh access',
          desc: 'SSH PAM access',
          children: [
            {
              kind: 'note',
              text: 'All PAM commands share: --resource, --account, --project-id, --duration',
            },
          ],
        },
      ],
    },
  ],
};
