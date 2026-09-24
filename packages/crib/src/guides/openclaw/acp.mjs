export const acp = {
  name: 'acp',
  description: 'ACP & MCP protocol bridges',
  sections: [
    {
      title: 'ACP & MCP — Protocol Bridges',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw acp',
          desc: 'Run ACP bridge connecting IDEs to gateway',
          children: [
            { kind: 'flag', name: '--url <url>', desc: 'Gateway URL' },
            { kind: 'flag', name: '--token <token>', desc: 'Gateway token' },
            {
              kind: 'flag',
              name: '--token-file <path>',
              desc: 'Read token from file',
            },
            {
              kind: 'flag',
              name: '--password <password>',
              desc: 'Gateway password',
            },
            {
              kind: 'flag',
              name: '--password-file <path>',
              desc: 'Read password from file',
            },
            { kind: 'flag', name: '--session <key>', desc: 'Session key' },
            {
              kind: 'flag',
              name: '--session-label <label>',
              desc: 'Session label',
            },
            {
              kind: 'flag',
              name: '--require-existing',
              desc: 'Require existing session',
            },
            { kind: 'flag', name: '--reset-session', desc: 'Reset session' },
            {
              kind: 'flag',
              name: '--no-prefix-cwd',
              desc: "Don't prefix with current directory",
            },
            {
              kind: 'flag',
              name: '--provenance <mode>',
              desc: 'off | meta | meta+receipt',
            },
            { kind: 'flag', name: '--verbose', desc: 'Verbose output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw acp client',
          desc: 'Interactive ACP debugging client',
          children: [
            { kind: 'flag', name: '--cwd <dir>', desc: 'Working directory' },
            {
              kind: 'flag',
              name: '--server <command>',
              desc: 'Server command',
            },
            {
              kind: 'flag',
              name: '--server-args <args...>',
              desc: 'Server arguments',
            },
            {
              kind: 'flag',
              name: '--server-verbose',
              desc: 'Server verbose logging',
            },
            { kind: 'flag', name: '--verbose', desc: 'Verbose output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw mcp serve',
          desc: 'Expose OpenClaw channels over MCP stdio',
          children: [
            { kind: 'flag', name: '--url <url>', desc: 'Gateway URL' },
            { kind: 'flag', name: '--token <token>', desc: 'Gateway token' },
            {
              kind: 'flag',
              name: '--token-file <path>',
              desc: 'Read token from file',
            },
            {
              kind: 'flag',
              name: '--password <password>',
              desc: 'Gateway password',
            },
            {
              kind: 'flag',
              name: '--password-file <path>',
              desc: 'Read password from file',
            },
            {
              kind: 'flag',
              name: '--claude-channel-mode <mode>',
              desc: 'auto | on | off',
            },
            { kind: 'flag', name: '--verbose', desc: 'Verbose output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw mcp list',
          desc: 'List saved MCP server definitions',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw mcp show [name]',
          desc: 'Show MCP server definition',
          children: [{ kind: 'flag', name: '--json', desc: 'JSON output' }],
        },
        {
          kind: 'cmd',
          name: 'openclaw mcp set <name> <value>',
          desc: 'Save MCP server definition',
        },
        {
          kind: 'cmd',
          name: 'openclaw mcp unset <name>',
          desc: 'Remove MCP server definition',
        },
      ],
    },
  ],
};
