export const messages = {
  name: 'messages',
  description: 'Send, read & manage messages',
  sections: [
    {
      title: 'Messages — Send, Read & Manage',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw message send',
          desc: 'Send a text message',
          children: [
            {
              kind: 'flag',
              name: '--target <dest>',
              desc: 'Message recipient',
            },
            {
              kind: 'flag',
              name: '--message <text>',
              desc: 'Message content',
            },
            {
              kind: 'flag',
              name: '--channel <channel>',
              desc: 'Target channel',
            },
            {
              kind: 'flag',
              name: '--media <path>',
              desc: 'Attach media file',
            },
            {
              kind: 'flag',
              name: '--reply-to <target>',
              desc: 'Reply target override',
            },
            {
              kind: 'flag',
              name: '--reply-channel <channel>',
              desc: 'Delivery channel override',
            },
            {
              kind: 'flag',
              name: '--reply-account <id>',
              desc: 'Delivery account override',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            {
              kind: 'flag',
              name: '--timeout <seconds>',
              desc: 'Command timeout',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw message broadcast --targets <list>',
          desc: 'Broadcast to multiple targets',
        },
        {
          kind: 'cmd',
          name: 'openclaw message read',
          desc: 'Read recent messages',
        },
        {
          kind: 'cmd',
          name: 'openclaw message search',
          desc: 'Search messages',
        },
        {
          kind: 'cmd',
          name: 'openclaw message edit',
          desc: 'Edit a sent message',
        },
        {
          kind: 'cmd',
          name: 'openclaw message delete',
          desc: 'Delete a message',
        },
        {
          kind: 'cmd',
          name: 'openclaw message pin / unpin',
          desc: 'Pin or unpin a message',
        },
        {
          kind: 'cmd',
          name: 'openclaw message pins',
          desc: 'List pinned messages',
        },
        {
          kind: 'cmd',
          name: 'openclaw message react',
          desc: 'Add or remove a reaction',
        },
        {
          kind: 'cmd',
          name: 'openclaw message reactions',
          desc: 'List reactions on a message',
        },
        {
          kind: 'cmd',
          name: 'openclaw message permissions',
          desc: 'Manage message permissions',
        },
        {
          kind: 'cmd',
          name: 'openclaw message poll',
          desc: 'Send a channel poll',
          children: [
            {
              kind: 'flag',
              name: '--channel <channel>',
              desc: 'Target channel',
            },
            {
              kind: 'flag',
              name: '--target <dest>',
              desc: 'Channel or thread target',
            },
            {
              kind: 'flag',
              name: '--poll-question <text>',
              desc: 'Poll question',
            },
            {
              kind: 'flag',
              name: '--poll-option <option>',
              desc: 'Poll option (repeatable)',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw message thread create|list|reply',
          desc: 'Manage message threads',
        },
        {
          kind: 'cmd',
          name: 'openclaw message emoji list|upload',
          desc: 'Manage custom emoji',
        },
        {
          kind: 'cmd',
          name: 'openclaw message sticker send|upload',
          desc: 'Manage stickers',
        },
        {
          kind: 'cmd',
          name: 'openclaw message role info|add|remove',
          desc: 'Manage channel roles',
        },
        {
          kind: 'cmd',
          name: 'openclaw message channel info|list',
          desc: 'Get channel information',
        },
        {
          kind: 'cmd',
          name: 'openclaw message member info',
          desc: 'Get member information',
        },
        {
          kind: 'cmd',
          name: 'openclaw message voice status',
          desc: 'Check voice channel status',
        },
        {
          kind: 'cmd',
          name: 'openclaw message event list|create',
          desc: 'Manage channel events',
        },
        {
          kind: 'cmd',
          name: 'openclaw message ban / kick / timeout',
          desc: 'Moderation actions on a member',
        },
      ],
    },
  ],
};
