export const models = {
  name: 'models',
  description: 'Model discovery, auth & configuration',
  sections: [
    {
      title: 'Models — Discovery & Configuration',
      items: [
        {
          kind: 'cmd',
          name: 'openclaw models list',
          desc: 'List configured models',
          children: [
            { kind: 'flag', name: '--all', desc: 'Include full catalog' },
            { kind: 'flag', name: '--local', desc: 'Local models only' },
            {
              kind: 'flag',
              name: '--provider <name>',
              desc: 'Filter by provider',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            { kind: 'flag', name: '--plain', desc: 'Plain text output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw models status',
          desc: 'Show model availability + auth status',
          children: [
            { kind: 'flag', name: '--json', desc: 'JSON output' },
            { kind: 'flag', name: '--plain', desc: 'Plain text output' },
            {
              kind: 'flag',
              name: '--check',
              desc: 'Exit 1 if expired/missing; 2 if expiring',
            },
            {
              kind: 'flag',
              name: '--probe',
              desc: 'Run live requests (may consume tokens)',
            },
            {
              kind: 'flag',
              name: '--probe-provider <name>',
              desc: 'Probe specific provider',
            },
            {
              kind: 'flag',
              name: '--probe-profile <id>',
              desc: 'Probe specific auth profile (repeatable/comma-sep)',
            },
            {
              kind: 'flag',
              name: '--probe-timeout <ms>',
              desc: 'Probe timeout',
            },
            {
              kind: 'flag',
              name: '--probe-concurrency <n>',
              desc: 'Parallel probes',
            },
            {
              kind: 'flag',
              name: '--probe-max-tokens <n>',
              desc: 'Max tokens for probe',
            },
            { kind: 'flag', name: '--agent <id>', desc: 'Filter by agent' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw models set <model>',
          desc: 'Set default model (agents.defaults.model.primary)',
        },
        {
          kind: 'cmd',
          name: 'openclaw models set-image <model>',
          desc: 'Set default image model',
        },
        {
          kind: 'cmd',
          name: 'openclaw models scan',
          desc: 'Discover available models (OpenRouter, local, etc)',
          children: [
            {
              kind: 'flag',
              name: '--min-params <b>',
              desc: 'Minimum model size (billions)',
            },
            {
              kind: 'flag',
              name: '--max-age-days <days>',
              desc: 'Model age filter',
            },
            {
              kind: 'flag',
              name: '--provider <name>',
              desc: 'Specific provider',
            },
            {
              kind: 'flag',
              name: '--max-candidates <n>',
              desc: 'Limit results',
            },
            { kind: 'flag', name: '--timeout <ms>', desc: 'Scan timeout' },
            {
              kind: 'flag',
              name: '--concurrency <n>',
              desc: 'Parallel scans',
            },
            { kind: 'flag', name: '--no-probe', desc: 'Skip live probing' },
            { kind: 'flag', name: '--yes', desc: 'Accept defaults' },
            {
              kind: 'flag',
              name: '--no-input',
              desc: 'Non-interactive mode',
            },
            {
              kind: 'flag',
              name: '--set-default',
              desc: 'Set as default model',
            },
            {
              kind: 'flag',
              name: '--set-image',
              desc: 'Set as default image model',
            },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw models aliases list',
          desc: 'List model aliases',
        },
        {
          kind: 'cmd',
          name: 'openclaw models aliases add <alias> <model>',
          desc: 'Create alias',
        },
        {
          kind: 'cmd',
          name: 'openclaw models aliases remove <alias>',
          desc: 'Delete alias',
        },
        {
          kind: 'cmd',
          name: 'openclaw models fallbacks list',
          desc: 'List fallback chain',
        },
        {
          kind: 'cmd',
          name: 'openclaw models fallbacks add <model>',
          desc: 'Add fallback model',
        },
        {
          kind: 'cmd',
          name: 'openclaw models fallbacks remove <model>',
          desc: 'Remove fallback model',
        },
        {
          kind: 'cmd',
          name: 'openclaw models fallbacks clear',
          desc: 'Clear all fallbacks',
        },
        {
          kind: 'cmd',
          name: 'openclaw models image-fallbacks list|add|remove|clear',
          desc: 'Manage image model fallback chain',
        },
        {
          kind: 'cmd',
          name: 'openclaw models auth add',
          desc: 'Interactive auth helper',
        },
        {
          kind: 'cmd',
          name: 'openclaw models auth login',
          desc: 'Provider login',
          children: [
            {
              kind: 'flag',
              name: '--provider <name>',
              desc: 'Provider name',
            },
            { kind: 'flag', name: '--method <method>', desc: 'Auth method' },
            { kind: 'flag', name: '--set-default', desc: 'Set as default' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw models auth login-github-copilot',
          desc: 'GitHub Copilot OAuth login',
          children: [
            { kind: 'flag', name: '--yes', desc: 'Skip confirmation' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw models auth setup-token',
          desc: 'Setup auth token',
          children: [
            {
              kind: 'flag',
              name: '--provider <name>',
              desc: 'Provider name',
            },
            { kind: 'flag', name: '--yes', desc: 'Skip confirmation' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw models auth paste-token',
          desc: 'Paste auth token',
          children: [
            {
              kind: 'flag',
              name: '--provider <name>',
              desc: 'Provider name',
            },
            { kind: 'flag', name: '--profile-id <id>', desc: 'Profile id' },
            {
              kind: 'flag',
              name: '--expires-in <duration>',
              desc: 'Token expiry duration',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw models auth order get',
          desc: 'Get auth selection order',
          children: [
            {
              kind: 'flag',
              name: '--provider <name>',
              desc: 'Provider name',
            },
            { kind: 'flag', name: '--agent <id>', desc: 'Agent id' },
            { kind: 'flag', name: '--json', desc: 'JSON output' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw models auth order set',
          desc: 'Set auth selection order',
          children: [
            {
              kind: 'flag',
              name: '--provider <name>',
              desc: 'Provider name',
            },
            { kind: 'flag', name: '--agent <id>', desc: 'Agent id' },
          ],
        },
        {
          kind: 'cmd',
          name: 'openclaw models auth order clear',
          desc: 'Clear auth order',
        },
      ],
    },
  ],
};
