export const agents = {
  name: 'agents',
  description: 'Manage isolated agents & run turns',
  sections: [
    {
      title: 'Agents — Manage Isolated Agents',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw agents list',
          desc: 'List configured agents',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            {
              kind: 'flag',
              name: '--bindings',
              desc: 'Include routing bindings',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw agents add [name]',
          desc: 'Add a new isolated agent (wizard or flags)',
          children: [
            {
              kind: 'flag',
              name: '--workspace <dir>',
              desc: 'Agent workspace (required in non-interactive)',
            },
            { kind: 'flag', name: '--model <id>', desc: 'Primary model' },
            {
              kind: 'flag',
              name: '--agent-dir <dir>',
              desc: 'Agent directory',
            },
            {
              kind: 'flag',
              name: '--bind <channel[:accountId]>',
              desc: 'Binding spec (repeatable)',
            },
            { kind: 'flag', name: '--non-interactive', desc: 'Skip prompts' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw agents delete <id>',
          desc: 'Delete agent + prune workspace/state',
          children: [
            { kind: 'flag', name: '--force', desc: 'Skip confirmation' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw agents bind',
          desc: 'Add routing bindings',
          children: [
            {
              kind: 'flag',
              name: '--agent <id>',
              desc: 'Agent (defaults to current default)',
            },
            {
              kind: 'flag',
              name: '--bind <channel[:accountId]>',
              desc: 'Binding spec (repeatable)',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw agents unbind',
          desc: 'Remove routing bindings',
          children: [
            { kind: 'flag', name: '--agent <id>', desc: 'Agent' },
            {
              kind: 'flag',
              name: '--bind <channel[:accountId]>',
              desc: 'Binding spec (repeatable)',
            },
            { kind: 'flag', name: '--all', desc: 'Remove all bindings' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw agents bindings',
          desc: 'List routing bindings',
          children: [
            { kind: 'flag', name: '--agent <id>', desc: 'Specific agent' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw agents set-identity',
          desc: 'Update agent name/theme/emoji/avatar',
          children: [
            { kind: 'flag', name: '--agent <id>', desc: 'Target agent' },
            {
              kind: 'flag',
              name: '--workspace <dir>',
              desc: 'Target workspace',
            },
            {
              kind: 'flag',
              name: '--identity-file <path>',
              desc: 'Identity file path',
            },
            {
              kind: 'flag',
              name: '--from-identity',
              desc: 'Read from IDENTITY.md',
            },
            { kind: 'flag', name: '--name <name>', desc: 'Agent name' },
            { kind: 'flag', name: '--theme <theme>', desc: 'Color theme' },
            { kind: 'flag', name: '--emoji <emoji>', desc: 'Avatar emoji' },
            { kind: 'flag', name: '--avatar <value>', desc: 'Avatar value' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw agent',
          desc: 'Run one agent turn via gateway or embedded',
          children: [
            {
              kind: 'flag',
              name: '-m, --message <text>',
              desc: 'Message content (required)',
            },
            {
              kind: 'flag',
              name: '-t, --to <dest>',
              desc: 'Session key + optional delivery target',
            },
            {
              kind: 'flag',
              name: '--session-id <id>',
              desc: 'Session identifier',
            },
            {
              kind: 'flag',
              name: '--agent <id>',
              desc: 'Agent id (overrides routing bindings)',
            },
            {
              kind: 'flag',
              name: '--thinking <level>',
              desc: 'off | minimal | low | medium | high | xhigh',
            },
            {
              kind: 'flag',
              name: '--verbose <on|off>',
              desc: 'Verbose output',
            },
            {
              kind: 'flag',
              name: '--channel <channel>',
              desc: 'Delivery channel',
            },
            {
              kind: 'flag',
              name: '--reply-to <target>',
              desc: 'Delivery target override',
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
            {
              kind: 'flag',
              name: '--local',
              desc: 'Embedded run (plugin registry preloads first)',
            },
            {
              kind: 'flag',
              name: '--deliver',
              desc: 'Also send the reply to the chat target',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            {
              kind: 'flag',
              name: '--timeout <seconds>',
              desc: 'Command timeout',
            },
          ],
        },
      ],
    },
  ],
};
