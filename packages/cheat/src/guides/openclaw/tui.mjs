export const tui = {
  name: 'tui',
  description: 'Terminal UI',
  sections: [
    {
      title: 'TUI — Terminal UI',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw tui',
          desc: 'Open terminal UI connected to gateway',
          children: [
            {
              kind: 'flag',
              name: '--url <url>',
              desc: 'Explicit gateway URL',
            },
            { kind: 'flag', name: '--token <token>', desc: 'Gateway token' },
            {
              kind: 'flag',
              name: '--password <password>',
              desc: 'Gateway password',
            },
            { kind: 'flag', name: '--session <key>', desc: 'Session key' },
            {
              kind: 'flag',
              name: '--deliver',
              desc: 'Deliver responses to chat',
            },
            {
              kind: 'flag',
              name: '--thinking <level>',
              desc: 'off | minimal | low | medium | high | xhigh',
            },
            {
              kind: 'flag',
              name: '--message <text>',
              desc: 'Initial message',
            },
            {
              kind: 'flag',
              name: '--timeout-ms <ms>',
              desc: 'Default timeout',
            },
            {
              kind: 'flag',
              name: '--history-limit <n>',
              desc: 'Message history limit',
            },
          ],
        },
      ],
    },
  ],
};
