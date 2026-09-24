export const devices = {
  name: 'devices',
  description: 'Device pairing, QR codes & directory',
  sections: [
    {
      title: 'Devices & Pairing',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw devices list',
          desc: 'List paired devices',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw devices approve [requestId]',
          desc: 'Approve pairing request',
          children: [
            {
              kind: 'flag',
              name: '--latest',
              desc: 'Auto-select newest request',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw devices reject <requestId>',
          desc: 'Reject pairing request',
        },
        {
          kind: 'cmd',
          name: 'openclaw devices remove <deviceId>',
          desc: 'Remove paired device',
        },
        {
          kind: 'cmd',
          name: 'openclaw devices clear',
          desc: 'Clear all devices',
          children: [
            { kind: 'flag', name: '--yes', desc: 'Skip confirmation' },
            {
              kind: 'flag',
              name: '--pending',
              desc: 'Clear pending requests only',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw devices rotate --device <id> --role <role>',
          desc: 'Rotate device role token',
          children: [
            {
              kind: 'flag',
              name: '--scope <scope...>',
              desc: 'Update scope set',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw devices revoke --device <id> --role <role>',
          desc: 'Revoke device role token',
        },
        {
          kind: 'cmd',
          name: 'openclaw qr',
          desc: 'Generate mobile pairing QR and setup code',
          children: [
            { kind: 'flag', name: '--remote', desc: 'Use remote config' },
            {
              kind: 'flag',
              name: '--url <url>',
              desc: 'Explicit gateway URL',
            },
            {
              kind: 'flag',
              name: '--public-url <url>',
              desc: 'Public URL for QR',
            },
            { kind: 'flag', name: '--token <token>', desc: 'Gateway token' },
            {
              kind: 'flag',
              name: '--password <password>',
              desc: 'Gateway password',
            },
            {
              kind: 'flag',
              name: '--setup-code-only',
              desc: 'Print setup code only',
            },
            {
              kind: 'flag',
              name: '--no-ascii',
              desc: 'Skip ASCII QR display',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw pairing list',
          desc: 'List DM pairing requests',
          children: [
            {
              kind: 'flag',
              name: '--channel <channel>',
              desc: 'Specific channel',
            },
            {
              kind: 'flag',
              name: '--account <id>',
              desc: 'Specific account',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw pairing approve <code>',
          desc: 'Approve pairing request',
          children: [
            {
              kind: 'flag',
              name: '--channel <channel>',
              desc: 'Target channel',
            },
            { kind: 'flag', name: '--account <id>', desc: 'Target account' },
            { kind: 'flag', name: '--notify', desc: 'Send notification' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw directory self',
          desc: 'Get own directory entry',
        },
        {
          kind: 'cmd',
          name: 'openclaw directory peers list',
          desc: 'List directory peers',
          children: [
            { kind: 'flag', name: '--query <text>', desc: 'Search query' },
            { kind: 'flag', name: '--limit <n>', desc: 'Result limit' },
            {
              kind: 'flag',
              name: '--channel <name>',
              desc: 'Target channel',
            },
            { kind: 'flag', name: '--account <id>', desc: 'Target account' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw directory groups list',
          desc: 'List directory groups',
          children: [
            { kind: 'flag', name: '--query <text>', desc: 'Search query' },
            { kind: 'flag', name: '--limit <n>', desc: 'Result limit' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw directory groups members --group-id <id>',
          desc: 'List group members',
        },
      ],
    },
  ],
};
