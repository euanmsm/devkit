export const release = {
  name: 'release',
  description: 'Create and publish releases',
  sections: [
    {
      title: 'release — Manage releases',
      items: [
        {
          kind: 'cmd',
          name: 'gh release create <tag> [<files>...]',
          desc: 'Create a release',
          children: [
            { kind: 'flag', name: '-t, --title <text>', desc: 'Release title' },
            { kind: 'flag', name: '-n, --notes <text>', desc: 'Release notes' },
            {
              kind: 'flag',
              name: '-F, --notes-file <file>',
              desc: 'Read notes from file',
            },
            {
              kind: 'flag',
              name: '--generate-notes',
              desc: 'Auto-generate notes',
            },
            {
              kind: 'flag',
              name: '--notes-start-tag <tag>',
              desc: 'Starting tag for notes',
            },
            {
              kind: 'flag',
              name: '--target <branch>',
              desc: 'Target branch/commit',
            },
            { kind: 'flag', name: '-d, --draft', desc: 'Save as draft' },
            {
              kind: 'flag',
              name: '-p, --prerelease',
              desc: 'Mark as prerelease',
            },
            {
              kind: 'flag',
              name: '--latest',
              desc: 'Mark as Latest (=false to unset)',
            },
            {
              kind: 'flag',
              name: '--verify-tag',
              desc: "Abort if tag doesn't exist",
            },
            {
              kind: 'flag',
              name: '--discussion-category <cat>',
              desc: 'Start discussion',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh release list',
          desc: 'List releases',
          children: [
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max items (default 30)',
            },
            { kind: 'flag', name: '--exclude-drafts', desc: 'Exclude drafts' },
            {
              kind: 'flag',
              name: '--exclude-pre-releases',
              desc: 'Exclude prereleases',
            },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh release view <tag>',
          desc: 'View a release',
          children: [
            { kind: 'flag', name: '-w, --web', desc: 'Open in browser' },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh release edit <tag>',
          desc: 'Edit a release',
        },
        {
          kind: 'cmd',
          name: 'gh release delete <tag>',
          desc: 'Delete a release',
          children: [
            { kind: 'flag', name: '--cleanup-tag', desc: 'Also delete tag' },
            { kind: 'flag', name: '-y, --yes', desc: 'Skip confirmation' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh release download <tag>',
          desc: 'Download release assets',
          children: [
            {
              kind: 'flag',
              name: '-D, --dir <dir>',
              desc: 'Download directory',
            },
            {
              kind: 'flag',
              name: '-p, --pattern <glob>',
              desc: 'Glob pattern for assets',
            },
            {
              kind: 'flag',
              name: '-A, --archive <zip|tar.gz>',
              desc: 'Download source archive',
            },
            {
              kind: 'flag',
              name: '-O, --output <file>',
              desc: 'Single asset output file',
            },
            {
              kind: 'flag',
              name: '--clobber',
              desc: 'Overwrite existing files',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh release upload <tag> <files>...',
          desc: 'Upload assets',
          children: [
            {
              kind: 'flag',
              name: '--clobber',
              desc: 'Replace existing assets',
            },
          ],
        },
      ],
    },
  ],
};
