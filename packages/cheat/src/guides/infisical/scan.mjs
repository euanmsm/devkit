export const scan = {
  name: 'scan',
  description: 'Detect leaked secrets in code',
  sections: [
    {
      title: 'scan — Detect leaked secrets',
      items: [
        {
          kind: 'cmd',
          name: 'infisical scan',
          desc: 'Scan git history for secrets',
          children: [
            {
              kind: 'flag',
              name: '-s, --source <path>',
              desc: 'Path to scan (default: .)',
            },
            {
              kind: 'flag',
              name: '-c, --config <path>',
              desc: 'Config file path',
            },
            {
              kind: 'flag',
              name: '-b, --baseline-path <path>',
              desc: 'Baseline for known issues',
            },
            {
              kind: 'flag',
              name: '-f, --report-format <json|csv|sarif>',
              desc: 'Report format',
            },
            {
              kind: 'flag',
              name: '-r, --report-path <path>',
              desc: 'Report output path',
            },
            {
              kind: 'flag',
              name: '--exit-code <n>',
              desc: 'Exit code on leaks (default: 1)',
            },
            {
              kind: 'flag',
              name: '--no-git',
              desc: 'Treat as regular directory',
            },
            {
              kind: 'flag',
              name: '--redact',
              desc: 'Redact secrets from output',
            },
            { kind: 'flag', name: '-v, --verbose', desc: 'Verbose output' },
            {
              kind: 'flag',
              name: '--follow-symlinks',
              desc: 'Follow symlinks',
            },
            {
              kind: 'flag',
              name: '--max-target-megabytes <n>',
              desc: 'Skip large files',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical scan git-changes',
          desc: 'Scan uncommitted changes only',
          children: [
            { kind: 'flag', name: '--staged', desc: 'Only staged changes' },
            { kind: 'note', text: 'Inherits all scan flags' },
          ],
        },
        {
          kind: 'cmd',
          name: 'infisical scan install',
          desc: 'Install scanning hooks',
          children: [
            {
              kind: 'flag',
              name: '--pre-commit-hook',
              desc: 'Install pre-commit hook',
            },
          ],
        },
      ],
    },
  ],
};
