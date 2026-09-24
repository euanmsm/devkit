export const diagnostics = {
  name: 'diagnostics',
  description: 'Doctor, health, status & logs',
  sections: [
    {
      title: 'Diagnostics & Health',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw doctor',
          desc: 'Run health checks on gateway + channels',
          children: [
            {
              kind: 'flag',
              name: '--no-workspace-suggestions',
              desc: 'Disable workspace memory hints',
            },
            {
              kind: 'flag',
              name: '--yes',
              desc: 'Accept defaults without prompting',
            },
            {
              kind: 'flag',
              name: '--non-interactive',
              desc: 'Skip prompts (safe migrations only)',
            },
            {
              kind: 'flag',
              name: '--deep',
              desc: 'Scan system services for extra installs',
            },
            {
              kind: 'flag',
              name: '--repair / --fix',
              desc: 'Attempt automatic repairs',
            },
            {
              kind: 'flag',
              name: '--force',
              desc: 'Force repairs (overwrites service config)',
            },
            {
              kind: 'flag',
              name: '--generate-gateway-token',
              desc: 'Generate + configure a gateway token',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw health',
          desc: 'Quick health fetch from running gateway',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            { kind: 'flag', name: '--timeout <ms>', desc: 'RPC timeout' },
            {
              kind: 'flag',
              name: '--verbose / --debug',
              desc: 'Force live probe + expand output',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw status',
          desc: 'Channel health + recent session recipients',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            {
              kind: 'flag',
              name: '--all',
              desc: 'Full diagnosis (read-only, pasteable)',
            },
            {
              kind: 'flag',
              name: '--deep',
              desc: 'Live health probe including channel probes',
            },
            {
              kind: 'flag',
              name: '--usage',
              desc: 'Show model provider usage and quota',
            },
            { kind: 'flag', name: '--timeout <ms>', desc: 'RPC timeout' },
            {
              kind: 'flag',
              name: '--verbose / --debug',
              desc: 'Expanded output',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw logs',
          desc: 'Tail gateway file logs via RPC',
          children: [
            {
              kind: 'flag',
              name: '--follow',
              desc: 'Follow log file (tail -f style)',
            },
            {
              kind: 'flag',
              name: '--limit <n>',
              desc: 'Max log lines to return',
            },
            {
              kind: 'flag',
              name: '--max-bytes <n>',
              desc: 'Max bytes from log file',
            },
            {
              kind: 'flag',
              name: '--interval <ms>',
              desc: 'Polling interval when following',
            },
            {
              kind: 'flag',
              name: '--local-time',
              desc: 'Display timestamps in local time',
            },
            {
              kind: 'flag',
              name: '--level <level>',
              desc: 'Filter by log level (warn, error, etc)',
            },
            {
              kind: 'flag',
              name: '--json',
              desc: 'Line-delimited JSON output',
            },
            {
              kind: 'flag',
              name: '--plain',
              desc: 'Disable structured formatting',
            },
            { kind: 'flag', name: '--no-color', desc: 'Disable ANSI colors' },
            {
              kind: 'flag',
              name: '--url <url>',
              desc: 'Explicit gateway URL',
            },
            { kind: 'flag', name: '--token <token>', desc: 'Gateway token' },
            { kind: 'flag', name: '--timeout <ms>', desc: 'RPC timeout' },
            {
              kind: 'flag',
              name: '--expect-final',
              desc: 'Wait for final response',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw dashboard',
          desc: 'Open the Control UI in browser',
          children: [
            {
              kind: 'flag',
              name: '--no-open',
              desc: 'Print URL without launching browser',
            },
          ],
        },
      ],
    },
  ],
};
