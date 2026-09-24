export const channels = {
  name: 'channels',
  description: 'Manage chat connections (WhatsApp, Telegram, etc)',
  sections: [
    {
      title: 'Channels — Manage Chat Connections',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw channels list',
          desc: 'List configured channels + auth profiles',
          children: [
            {
              kind: 'flag',
              name: '--no-usage',
              desc: 'Skip model provider usage snapshots',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw channels status',
          desc: 'Check gateway reachability + channel health',
          children: [
            {
              kind: 'flag',
              name: '--probe',
              desc: 'Run live per-account probe checks',
            },
            { kind: 'flag', name: '--timeout <ms>', desc: 'Probe timeout' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw channels add',
          desc: 'Add/update a channel account (wizard or flags)',
          children: [
            {
              kind: 'flag',
              name: '--channel <name>',
              desc: 'whatsapp | telegram | discord | slack | googlechat | signal | imessage | msteams | mattermost',
            },
            {
              kind: 'flag',
              name: '--account <id>',
              desc: "Account id (default: 'default')",
            },
            {
              kind: 'flag',
              name: '--name <label>',
              desc: 'Display name for account',
            },
            {
              kind: 'flag',
              name: '--token <token>',
              desc: 'Channel token (non-interactive)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw channels login',
          desc: 'Interactive channel login (e.g. WhatsApp QR)',
          children: [
            {
              kind: 'flag',
              name: '--channel <ch>',
              desc: 'Channel type (default: whatsapp)',
            },
            { kind: 'flag', name: '--account <id>', desc: 'Target account' },
            { kind: 'flag', name: '--verbose', desc: 'Detailed output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw channels logout',
          desc: 'Log out of a channel session',
          children: [
            {
              kind: 'flag',
              name: '--channel <ch>',
              desc: 'Channel type (default: whatsapp)',
            },
            { kind: 'flag', name: '--account <id>', desc: 'Target account' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw channels remove',
          desc: 'Disable or delete a channel config',
          children: [
            {
              kind: 'flag',
              name: '--channel <name>',
              desc: 'Target channel',
            },
            { kind: 'flag', name: '--account <id>', desc: 'Target account' },
            {
              kind: 'flag',
              name: '--delete',
              desc: 'Remove config entries without prompts',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw channels resolve <entries...>',
          desc: 'Resolve channel/user names to IDs',
          children: [
            {
              kind: 'flag',
              name: '--channel <name>',
              desc: 'Target channel',
            },
            { kind: 'flag', name: '--account <id>', desc: 'Target account' },
            {
              kind: 'flag',
              name: '--kind <type>',
              desc: 'auto | user | group',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw channels capabilities',
          desc: 'Show provider capabilities + features',
          children: [
            {
              kind: 'flag',
              name: '--channel <name>',
              desc: 'Specific channel',
            },
            {
              kind: 'flag',
              name: '--account <id>',
              desc: 'Specific account',
            },
            {
              kind: 'flag',
              name: '--target <dest>',
              desc: 'Target destination',
            },
            { kind: 'flag', name: '--timeout <ms>', desc: 'Command timeout' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw channels logs',
          desc: 'Show recent channel logs',
          children: [
            {
              kind: 'flag',
              name: '--channel <name|all>',
              desc: 'Filter by channel (default: all)',
            },
            {
              kind: 'flag',
              name: '--lines <n>',
              desc: 'Number of lines (default: 200)',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            {
              kind: 'note',
              text: 'Supported channels: WhatsApp (Baileys), Telegram (grammY), Slack (Bolt), Discord (discord.js), Google Chat, Signal (signal-cli), iMessage/BlueBubbles, IRC, Microsoft Teams, Matrix, Mattermost, LINE, Feishu, Nostr, Nextcloud Talk, Synology Chat, Tlon, Twitch, Zalo, WeChat, WebChat',
            },
          ],
        },
      ],
    },
  ],
};
