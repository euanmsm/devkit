export const paths = {
  name: 'paths',
  description: 'Key paths & defaults',
  sections: [
    {
      title: 'Key Paths & Defaults',
      items: [
        {
          kind: 'cmd',
          name: '~/.openclaw/openclaw.json',
          desc: 'Main configuration file',
        },
        {
          kind: 'cmd',
          name: '~/.openclaw/workspace/',
          desc: 'Agent workspace directory',
        },
        {
          kind: 'cmd',
          name: '~/.openclaw/.env',
          desc: 'Global environment fallback',
        },
        {
          kind: 'cmd',
          name: 'Port 18789',
          desc: 'Default gateway WebSocket port',
        },
        {
          kind: 'cmd',
          name: 'Port 19001',
          desc: 'Default dev gateway port (--dev)',
          children: [
            {
              kind: 'note',
              text: 'Hot-reload: model/agent/channel/cron/session/tool changes apply live',
            },
            {
              kind: 'note',
              text: 'Restart needed: gateway.port, gateway.bind, sandbox docker config, plugins',
            },
          ],
        },
      ],
    },
  ],
};
