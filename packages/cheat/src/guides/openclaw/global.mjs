export const global = {
  name: 'global',
  description: 'Global flags (--json, --profile, --dev, etc)',
  sections: [
    {
      title: 'Global Options',
      items: [
        {
          kind: 'flag',
          name: '--profile <name>',
          desc: 'Use a named profile (isolates state under ~/.openclaw-<name>)',
        },
        {
          kind: 'flag',
          name: '--dev',
          desc: 'Dev profile: isolated state, gateway port 19001',
        },
        {
          kind: 'flag',
          name: '--container <name>',
          desc: 'Run CLI inside a Docker/Podman container',
        },
        {
          kind: 'flag',
          name: '--log-level <level>',
          desc: 'Log level: silent|fatal|error|warn|info|debug|trace',
        },
        {
          kind: 'flag',
          name: '--no-color',
          desc: 'Disable ANSI colors (also: NO_COLOR=1 env)',
        },
        {
          kind: 'flag',
          name: '--json',
          desc: 'Machine-readable JSON output (disables styling)',
        },
        {
          kind: 'flag',
          name: '--plain',
          desc: 'Clean output without structured formatting',
        },
        {
          kind: 'flag',
          name: '--update',
          desc: "Shorthand for 'openclaw update' (source installs only)",
        },
        {
          kind: 'flag',
          name: '-V, --version, -v',
          desc: 'Print version and exit',
        },
      ],
    },
  ],
};
