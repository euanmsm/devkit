export const repo = {
  name: 'repo',
  description: 'Create, clone, fork and manage repos',
  sections: [
    {
      title: 'repo — Manage repositories',
      items: [
        {
          kind: 'cmd',
          name: 'gh repo create [<name>]',
          desc: 'Create a new repository',
          children: [
            {
              kind: 'flag',
              name: '--public / --private / --internal',
              desc: 'Visibility',
            },
            { kind: 'flag', name: '-c, --clone', desc: 'Clone after creating' },
            { kind: 'flag', name: '--push', desc: 'Push local commits' },
            {
              kind: 'flag',
              name: '-s, --source <path>',
              desc: 'Local source directory',
            },
            {
              kind: 'flag',
              name: '-t, --template <repo>',
              desc: 'Template repository',
            },
            {
              kind: 'flag',
              name: '-d, --description <text>',
              desc: 'Description',
            },
            {
              kind: 'flag',
              name: '-l, --license <key>',
              desc: 'License template',
            },
            {
              kind: 'flag',
              name: '-g, --gitignore <template>',
              desc: 'Gitignore template',
            },
            { kind: 'flag', name: '--add-readme', desc: 'Add README' },
            {
              kind: 'flag',
              name: '--include-all-branches',
              desc: 'Include all template branches',
            },
            {
              kind: 'flag',
              name: '--disable-issues / --disable-wiki',
              desc: 'Disable features',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh repo clone <repo> [<dir>]',
          desc: 'Clone a repository',
          children: [
            {
              kind: 'flag',
              name: '-u, --upstream-remote-name <name>',
              desc: 'Upstream remote name',
            },
            {
              kind: 'flag',
              name: '--no-upstream',
              desc: "Don't add upstream remote for forks",
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh repo fork [<repo>]',
          desc: 'Fork a repository',
          children: [
            { kind: 'flag', name: '--clone', desc: 'Clone the fork' },
            { kind: 'flag', name: '--remote', desc: 'Add git remote' },
            {
              kind: 'flag',
              name: '--remote-name <name>',
              desc: 'Remote name (default: origin)',
            },
            {
              kind: 'flag',
              name: '--fork-name <name>',
              desc: 'Rename forked repo',
            },
            {
              kind: 'flag',
              name: '--org <org>',
              desc: 'Create fork in organization',
            },
            {
              kind: 'flag',
              name: '--default-branch-only',
              desc: 'Only default branch',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh repo view [<repo>]',
          desc: 'View repo details',
          children: [
            { kind: 'flag', name: '-w, --web', desc: 'Open in browser' },
            {
              kind: 'flag',
              name: '-b, --branch <branch>',
              desc: 'View specific branch',
            },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh repo list [<owner>]',
          desc: 'List repositories',
          children: [
            {
              kind: 'flag',
              name: '-L, --limit <n>',
              desc: 'Max repos (default 30)',
            },
            {
              kind: 'flag',
              name: '-l, --language <lang>',
              desc: 'Filter by language',
            },
            {
              kind: 'flag',
              name: '--topic <strings>',
              desc: 'Filter by topic',
            },
            {
              kind: 'flag',
              name: '--visibility <public|private|internal>',
              desc: 'Filter visibility',
            },
            {
              kind: 'flag',
              name: '--archived / --no-archived',
              desc: 'Filter archived state',
            },
            {
              kind: 'flag',
              name: '--fork / --source',
              desc: 'Filter fork state',
            },
            { kind: 'flag', name: '--json <fields>', desc: 'Output JSON' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh repo edit [<repo>]',
          desc: 'Edit repository settings',
          children: [
            {
              kind: 'flag',
              name: '-d, --description <text>',
              desc: 'Description',
            },
            {
              kind: 'flag',
              name: '-h, --homepage <url>',
              desc: 'Homepage URL',
            },
            {
              kind: 'flag',
              name: '--default-branch <name>',
              desc: 'Set default branch',
            },
            {
              kind: 'flag',
              name: '--visibility <public|private|internal>',
              desc: 'Visibility',
            },
            {
              kind: 'flag',
              name: '--enable-* / --disable-*',
              desc: 'Toggle features (issues, wiki, etc)',
            },
            {
              kind: 'flag',
              name: '--add-topic / --remove-topic <strings>',
              desc: 'Manage topics',
            },
            { kind: 'flag', name: '--template', desc: 'Make template repo' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh repo delete [<repo>]',
          desc: 'Delete repository',
          children: [
            { kind: 'flag', name: '--yes', desc: 'Skip confirmation' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh repo rename <new-name>',
          desc: 'Rename repository',
        },
        {
          kind: 'cmd',
          name: 'gh repo archive [<repo>]',
          desc: 'Archive repository',
        },
        {
          kind: 'cmd',
          name: 'gh repo unarchive [<repo>]',
          desc: 'Unarchive repository',
        },
        {
          kind: 'cmd',
          name: 'gh repo sync',
          desc: 'Sync a fork with upstream',
          children: [
            {
              kind: 'flag',
              name: '-b, --branch <branch>',
              desc: 'Branch to sync',
            },
            {
              kind: 'flag',
              name: '-s, --source <repo>',
              desc: 'Source repository',
            },
            { kind: 'flag', name: '--force', desc: 'Hard reset' },
          ],
        },
        {
          kind: 'cmd',
          name: 'gh repo set-default [<repo>]',
          desc: 'Set default repository',
        },
      ],
    },
  ],
};
