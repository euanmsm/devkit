export const gateway = {
  name: 'gateway',
  description: 'Run & manage the WebSocket gateway',
  sections: [
    {
      title: 'Gateway — Run & Manage the WebSocket Gateway',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw gateway run',
          desc: 'Run the gateway in the foreground',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway start',
          desc: 'Start the gateway service (systemd/launchd)',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway stop',
          desc: 'Stop the gateway service',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway restart',
          desc: 'Restart the gateway service',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway status',
          desc: 'Show service status + probe reachability',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway install',
          desc: 'Install the gateway as a system service',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway uninstall',
          desc: 'Uninstall the gateway service',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway health',
          desc: 'Fetch health from the running gateway',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway probe',
          desc: 'Full reachability + discovery + health summary',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway discover',
          desc: 'Find gateways via Bonjour (local + wide-area)',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway call <method>',
          desc: 'Call a gateway RPC method directly',
        },
        {
          kind: 'cmd',
          name: 'openclaw gateway usage-cost',
          desc: 'Fetch usage cost summary from session logs',
          children: [
            { kind: 'note', text: 'gateway run flags:' },
            {
              kind: 'flag',
              name: '--port <port>',
              desc: 'WebSocket port (default: 18789)',
            },
            {
              kind: 'flag',
              name: '--bind <mode>',
              desc: 'loopback | lan | tailnet | auto | custom',
            },
            {
              kind: 'flag',
              name: '--auth <mode>',
              desc: 'none | token | password | trusted-proxy',
            },
            {
              kind: 'flag',
              name: '--token <token>',
              desc: 'Auth token (or OPENCLAW_GATEWAY_TOKEN env)',
            },
            {
              kind: 'flag',
              name: '--password <password>',
              desc: 'Password auth',
            },
            {
              kind: 'flag',
              name: '--password-file <path>',
              desc: 'Read password from file',
            },
            {
              kind: 'flag',
              name: '--tailscale <mode>',
              desc: 'off | serve | funnel',
            },
            {
              kind: 'flag',
              name: '--tailscale-reset-on-exit',
              desc: 'Reset Tailscale serve/funnel on shutdown',
            },
            {
              kind: 'flag',
              name: '--allow-unconfigured',
              desc: 'Allow unconfigured mode',
            },
            {
              kind: 'flag',
              name: '--force',
              desc: 'Kill existing listener on the port before starting',
            },
            {
              kind: 'flag',
              name: '--verbose',
              desc: 'Verbose stdout/stderr logging',
            },
            {
              kind: 'flag',
              name: '--cli-backend-logs',
              desc: 'Include CLI backend logs',
            },
            {
              kind: 'flag',
              name: '--ws-log <mode>',
              desc: 'auto | full | compact',
            },
            {
              kind: 'flag',
              name: '--compact',
              desc: 'Alias for --ws-log compact',
            },
            { kind: 'flag', name: '--raw-stream', desc: 'Stream raw output' },
            {
              kind: 'flag',
              name: '--raw-stream-path <path>',
              desc: 'Raw stream file path',
            },
            { kind: 'flag', name: '--dev', desc: 'Dev mode' },
            {
              kind: 'flag',
              name: '--reset',
              desc: 'Reset dev config/creds/sessions/workspace',
            },
            { kind: 'note', text: 'gateway status flags:' },
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
            { kind: 'flag', name: '--timeout <ms>', desc: 'RPC timeout' },
            { kind: 'flag', name: '--no-probe', desc: 'Skip probe check' },
            {
              kind: 'flag',
              name: '--deep',
              desc: 'System-level service scans',
            },
            {
              kind: 'flag',
              name: '--require-rpc',
              desc: 'Require RPC connectivity',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            { kind: 'note', text: 'gateway install flags:' },
            { kind: 'flag', name: '--port <port>', desc: 'Service port' },
            {
              kind: 'flag',
              name: '--runtime <node|bun>',
              desc: 'Node or Bun runtime (node recommended)',
            },
            { kind: 'flag', name: '--token <token>', desc: 'Auth token' },
            { kind: 'flag', name: '--force', desc: 'Overwrite existing' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            { kind: 'note', text: 'gateway call flags:' },
            {
              kind: 'flag',
              name: '--params <json>',
              desc: 'RPC parameters as JSON',
            },
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
            { kind: 'flag', name: '--timeout <ms>', desc: 'RPC timeout' },
            {
              kind: 'flag',
              name: '--expect-final',
              desc: 'Wait for final response',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
      ],
    },
  ],
};
