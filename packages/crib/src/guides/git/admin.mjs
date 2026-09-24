export const admin = {
  name: 'admin',
  description: 'gc, prune, filter-branch, maintenance',
  sections: [
    {
      title: 'Administration',
      items: [
        {
          kind: 'cmd',
          name: 'git clean',
          desc: 'Remove untracked files',
          children: [
            {
              kind: 'flag',
              name: '-f, --force',
              desc: 'Required unless clean.requireForce=false',
            },
            { kind: 'flag', name: '-d', desc: 'Include untracked directories' },
            { kind: 'flag', name: '-x', desc: 'Remove ignored files too' },
            { kind: 'flag', name: '-X', desc: 'Remove ONLY ignored files' },
            {
              kind: 'flag',
              name: '-n, --dry-run',
              desc: 'Show what would be removed',
            },
            {
              kind: 'flag',
              name: '-i, --interactive',
              desc: 'Interactive mode',
            },
            {
              kind: 'flag',
              name: '-e, --exclude=<pattern>',
              desc: 'Additional exclusion',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git gc',
          desc: 'Garbage collect and optimize',
          children: [
            {
              kind: 'flag',
              name: '--aggressive',
              desc: 'Thorough optimization (slow)',
            },
            {
              kind: 'flag',
              name: '--auto',
              desc: 'Only if housekeeping needed',
            },
            {
              kind: 'flag',
              name: '--prune=<date>',
              desc: 'Prune objects older than date',
            },
            { kind: 'flag', name: '--no-prune', desc: "Don't prune" },
            {
              kind: 'flag',
              name: '--force',
              desc: 'Force even if another gc running',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git archive <tree-ish>',
          desc: 'Create file archive',
          children: [
            {
              kind: 'flag',
              name: '--format=<tar|zip|tar.gz>',
              desc: 'Archive format',
            },
            {
              kind: 'flag',
              name: '--prefix=<prefix>/',
              desc: 'Prepend path prefix',
            },
            { kind: 'flag', name: '-o, --output=<file>', desc: 'Output file' },
            {
              kind: 'flag',
              name: '--remote=<repo>',
              desc: 'Retrieve from remote',
            },
            {
              kind: 'flag',
              name: '-l, --list',
              desc: 'List available formats',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git bundle <subcommand>',
          desc: 'Package objects + refs',
          children: [
            {
              kind: 'subcmd',
              name: 'create <file> <refspec>...',
              desc: 'Create bundle',
            },
            { kind: 'subcmd', name: 'verify <file>', desc: 'Verify bundle' },
            { kind: 'subcmd', name: 'unbundle <file>', desc: 'Unpack bundle' },
            {
              kind: 'subcmd',
              name: 'list-heads <file>',
              desc: 'List refs in bundle',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git notes <subcommand>',
          desc: 'Manage object notes',
          children: [
            {
              kind: 'subcmd',
              name: 'add / append [-m <msg>] <object>',
              desc: 'Add/append note',
            },
            { kind: 'subcmd', name: 'edit <object>', desc: 'Edit note' },
            { kind: 'subcmd', name: 'show <object>', desc: 'Show note' },
            { kind: 'subcmd', name: 'remove <object>', desc: 'Remove note' },
            { kind: 'subcmd', name: 'list [<object>]', desc: 'List notes' },
            { kind: 'subcmd', name: 'merge <ref>', desc: 'Merge notes' },
            {
              kind: 'subcmd',
              name: 'prune',
              desc: 'Remove notes for missing objects',
            },
            {
              kind: 'flag',
              name: '-f, --force',
              desc: 'Overwrite existing note',
            },
            { kind: 'flag', name: '-m, --message <msg>', desc: 'Note message' },
            { kind: 'flag', name: '-F, --file <file>', desc: 'Read from file' },
            { kind: 'flag', name: '--ref=<ref>', desc: 'Notes ref to use' },
          ],
        },
      ],
    },
  ],
};
