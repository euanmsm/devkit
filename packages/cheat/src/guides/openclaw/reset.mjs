export const reset = {
  name: 'reset',
  description: 'Reset & uninstall',
  sections: [
    {
      title: 'Reset & Uninstall',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw reset',
          desc: 'Reset local config/state (keeps CLI installed)',
          children: [
            {
              kind: 'flag',
              name: '--scope <scope>',
              desc: 'config | config+creds+sessions | full',
            },
            { kind: 'flag', name: '--yes', desc: 'Skip confirmation' },
            { kind: 'flag', name: '--non-interactive', desc: 'Skip prompts' },
            { kind: 'flag', name: '--dry-run', desc: 'Preview only' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw uninstall',
          desc: 'Uninstall gateway service + data',
          children: [
            { kind: 'flag', name: '--service', desc: 'Remove service only' },
            { kind: 'flag', name: '--state', desc: 'Remove state only' },
            {
              kind: 'flag',
              name: '--workspace',
              desc: 'Remove workspace only',
            },
            { kind: 'flag', name: '--app', desc: 'Remove app only' },
            { kind: 'flag', name: '--all', desc: 'Remove everything' },
            { kind: 'flag', name: '--yes', desc: 'Skip confirmation' },
            { kind: 'flag', name: '--non-interactive', desc: 'Skip prompts' },
            { kind: 'flag', name: '--dry-run', desc: 'Preview only' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw docs [query...]',
          desc: 'Search the live OpenClaw docs index',
        },
        {
          kind: 'cmd',
          name: 'openclaw qa',
          desc: 'Run QA scenarios and launch QA debugger UI',
        },
        {
          kind: 'cmd',
          name: 'openclaw voicecall call --to <phone> --message <text>',
          desc: 'Place voice call (plugin)',
        },
        {
          kind: 'cmd',
          name: 'openclaw voicecall start --to <phone>',
          desc: 'Start voice call',
        },
        {
          kind: 'cmd',
          name: 'openclaw voicecall continue --call-id <id> --message <text>',
          desc: 'Continue call',
        },
        {
          kind: 'cmd',
          name: 'openclaw voicecall speak --call-id <id> --message <text>',
          desc: 'Speak on call',
        },
        {
          kind: 'cmd',
          name: 'openclaw voicecall end --call-id <id>',
          desc: 'End voice call',
        },
        {
          kind: 'cmd',
          name: 'openclaw voicecall status --call-id <id>',
          desc: 'Check call status',
        },
        {
          kind: 'cmd',
          name: 'openclaw voicecall tail|latency|expose',
          desc: 'Voice call diagnostics',
        },
      ],
    },
  ],
};
