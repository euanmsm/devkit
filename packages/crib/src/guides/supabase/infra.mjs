export const infra = {
  name: 'infra',
  description: 'Config, custom domains, network',
  sections: [
    {
      title: 'Infrastructure management',
      items: [
        {
          kind: 'cmd',
          name: 'supabase config push',
          desc: 'Push config.toml to linked project',
        },
        {
          kind: 'cmd',
          name: 'supabase domains get / create / activate',
          desc: 'Custom domains',
          children: [
            {
              kind: 'flag',
              name: '--custom-hostname <host>',
              desc: 'Hostname (for create)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase domains reverify / delete',
          desc: 'Reverify or remove',
        },
        {
          kind: 'cmd',
          name: 'supabase vanity-subdomains get',
          desc: 'Get vanity subdomain',
        },
        {
          kind: 'cmd',
          name: 'supabase vanity-subdomains check-availability',
          desc: 'Check availability',
          children: [
            {
              kind: 'flag',
              name: '--desired-subdomain <name>',
              desc: 'Desired subdomain',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase vanity-subdomains activate / delete',
          desc: 'Activate or remove',
        },
        {
          kind: 'cmd',
          name: 'supabase network-bans get',
          desc: 'Get IP bans',
        },
        {
          kind: 'cmd',
          name: 'supabase network-bans remove',
          desc: 'Remove bans',
          children: [
            { kind: 'flag', name: '--db-unban-ip <ips>', desc: 'IPs to unban' },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase network-restrictions get',
          desc: 'Get restrictions',
        },
        {
          kind: 'cmd',
          name: 'supabase network-restrictions update',
          desc: 'Update restrictions',
          children: [
            {
              kind: 'flag',
              name: '--db-allow-cidr <cidrs>',
              desc: 'Allowed CIDRs',
            },
            {
              kind: 'flag',
              name: '--append',
              desc: 'Append instead of replace',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase ssl-enforcement get / update',
          desc: 'SSL enforcement',
          children: [
            {
              kind: 'flag',
              name: '--enable-db-ssl-enforcement',
              desc: 'Enable SSL',
            },
            {
              kind: 'flag',
              name: '--disable-db-ssl-enforcement',
              desc: 'Disable SSL',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase postgres-config get',
          desc: 'Get Postgres config',
        },
        {
          kind: 'cmd',
          name: 'supabase postgres-config update',
          desc: 'Update Postgres config',
          children: [
            {
              kind: 'flag',
              name: '--config <key=value>',
              desc: 'Config overrides',
            },
            {
              kind: 'flag',
              name: '--no-restart',
              desc: "Don't restart after update",
            },
            {
              kind: 'flag',
              name: '--replace-existing-overrides',
              desc: 'Replace all overrides',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'supabase postgres-config delete',
          desc: 'Delete config overrides',
        },
      ],
    },
  ],
};
