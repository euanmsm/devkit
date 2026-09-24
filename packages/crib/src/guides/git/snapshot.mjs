export const snapshot = {
  name: 'snapshot',
  description: 'add, commit, stash, status, clean',
  sections: [
    {
      title: 'Snapshotting',
      items: [
        {
          kind: 'cmd',
          name: 'git add <pathspec>...',
          desc: 'Stage file contents',
          children: [
            {
              kind: 'flag',
              name: '-A, --all',
              desc: 'Stage everything (add, modify, remove)',
            },
            {
              kind: 'flag',
              name: '-u, --update',
              desc: 'Update tracked files only',
            },
            {
              kind: 'flag',
              name: '-p, --patch',
              desc: 'Interactively select hunks',
            },
            {
              kind: 'flag',
              name: '-n, --dry-run',
              desc: 'Show what would be added',
            },
            {
              kind: 'flag',
              name: '-f, --force',
              desc: 'Allow adding ignored files',
            },
            {
              kind: 'flag',
              name: '-N, --intent-to-add',
              desc: 'Record path for later add',
            },
            {
              kind: 'flag',
              name: '--renormalize',
              desc: 'Re-apply clean filters',
            },
            {
              kind: 'flag',
              name: '--chmod=(+|-)x',
              desc: 'Override executable bit',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git status',
          desc: 'Show working tree status',
          children: [
            { kind: 'flag', name: '-s, --short', desc: 'Short format' },
            { kind: 'flag', name: '-b, --branch', desc: 'Show branch info' },
            {
              kind: 'flag',
              name: '--porcelain[=v1|v2]',
              desc: 'Machine-parseable output',
            },
            {
              kind: 'flag',
              name: '-u, --untracked-files[=no|normal|all]',
              desc: 'Untracked file display',
            },
            { kind: 'flag', name: '-v, --verbose', desc: 'Show staged diff' },
            { kind: 'flag', name: '--show-stash', desc: 'Show stash count' },
            { kind: 'flag', name: '--ignored', desc: 'Show ignored files' },
            {
              kind: 'flag',
              name: '--ahead-behind / --no-ahead-behind',
              desc: 'Show/hide counts',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git diff [<options>] [<path>...]',
          desc: 'Show changes',
          children: [
            {
              kind: 'note',
              text: 'Forms: working vs index | --cached (index vs HEAD) | <a> <b> | <a>...<b>',
            },
            {
              kind: 'flag',
              name: '-U<n>, --unified=<n>',
              desc: 'Context lines (default 3)',
            },
            { kind: 'flag', name: '--stat', desc: 'Diffstat summary' },
            { kind: 'flag', name: '--shortstat', desc: 'Only total line' },
            {
              kind: 'flag',
              name: '--name-only / --name-status',
              desc: 'File names / names+status',
            },
            {
              kind: 'flag',
              name: '--cached / --staged',
              desc: 'Index vs HEAD',
            },
            {
              kind: 'flag',
              name: '--no-index',
              desc: 'Compare two filesystem paths',
            },
            {
              kind: 'flag',
              name: '--diff-algorithm=<algo>',
              desc: 'patience, minimal, histogram, myers',
            },
            {
              kind: 'flag',
              name: '--word-diff[=<mode>]',
              desc: 'Word-level diff',
            },
            {
              kind: 'flag',
              name: '--color-moved[=<mode>]',
              desc: 'Highlight moved lines',
            },
            {
              kind: 'flag',
              name: '-M, --find-renames[=<n>]',
              desc: 'Detect renames',
            },
            {
              kind: 'flag',
              name: '-C, --find-copies[=<n>]',
              desc: 'Detect copies',
            },
            {
              kind: 'flag',
              name: '--diff-filter=<ACDMRT...>',
              desc: 'Filter by change type',
            },
            {
              kind: 'flag',
              name: '-S<string>',
              desc: 'Pickaxe: find string add/remove',
            },
            {
              kind: 'flag',
              name: '-G<regex>',
              desc: 'Pickaxe: find regex in diff',
            },
            {
              kind: 'flag',
              name: '-w, --ignore-all-space',
              desc: 'Ignore all whitespace',
            },
            {
              kind: 'flag',
              name: '-b, --ignore-space-change',
              desc: 'Ignore amount changes',
            },
            {
              kind: 'flag',
              name: '--check',
              desc: 'Warn on whitespace errors',
            },
            {
              kind: 'flag',
              name: '--compact-summary',
              desc: 'Condensed file info',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git commit',
          desc: 'Record changes to repository',
          children: [
            {
              kind: 'flag',
              name: '-m, --message <msg>',
              desc: 'Commit message (repeat for paragraphs)',
            },
            {
              kind: 'flag',
              name: '-a, --all',
              desc: 'Auto-stage modified/deleted files',
            },
            { kind: 'flag', name: '--amend', desc: 'Amend previous commit' },
            {
              kind: 'flag',
              name: '-F, --file <file>',
              desc: 'Read message from file',
            },
            {
              kind: 'flag',
              name: '-C, --reuse-message=<commit>',
              desc: 'Reuse message and author',
            },
            {
              kind: 'flag',
              name: '-c, --reedit-message=<commit>',
              desc: 'Reuse and edit message',
            },
            {
              kind: 'flag',
              name: '--fixup=<commit>',
              desc: 'Create fixup commit for autosquash',
            },
            {
              kind: 'flag',
              name: '--squash=<commit>',
              desc: 'Create squash commit for autosquash',
            },
            { kind: 'flag', name: '-s, --signoff', desc: 'Add Signed-off-by' },
            {
              kind: 'flag',
              name: '--trailer <token>=<value>',
              desc: 'Add trailer',
            },
            {
              kind: 'flag',
              name: '-S, --gpg-sign[=<key>]',
              desc: 'GPG-sign commit',
            },
            { kind: 'flag', name: '-n, --no-verify', desc: 'Bypass hooks' },
            { kind: 'flag', name: '--allow-empty', desc: 'Allow empty commit' },
            {
              kind: 'flag',
              name: '--allow-empty-message',
              desc: 'Allow empty message',
            },
            { kind: 'flag', name: '-e, --edit', desc: 'Force editor' },
            { kind: 'flag', name: '--no-edit', desc: 'Skip editor' },
            {
              kind: 'flag',
              name: '-v, --verbose',
              desc: 'Show diff in editor',
            },
            { kind: 'flag', name: '--dry-run', desc: 'Show what would commit' },
            {
              kind: 'flag',
              name: '-p, --patch',
              desc: 'Interactive patch selection',
            },
            {
              kind: 'flag',
              name: '--author=<author>',
              desc: 'Override author',
            },
            {
              kind: 'flag',
              name: '--date=<date>',
              desc: 'Override author date',
            },
            {
              kind: 'flag',
              name: '--cleanup=<mode>',
              desc: 'strip, whitespace, verbatim, scissors',
            },
            {
              kind: 'flag',
              name: '--reset-author',
              desc: 'Reset author to committer',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git reset [<mode>] [<commit>]',
          desc: 'Reset HEAD',
          children: [
            {
              kind: 'flag',
              name: '--soft',
              desc: 'Keep index and working tree',
            },
            {
              kind: 'flag',
              name: '--mixed',
              desc: 'Reset index, keep working tree (default)',
            },
            { kind: 'flag', name: '--hard', desc: 'Reset everything' },
            {
              kind: 'flag',
              name: '--merge',
              desc: 'Reset index, keep unstaged changes',
            },
            {
              kind: 'flag',
              name: '--keep',
              desc: 'Reset index, abort if conflicts',
            },
            {
              kind: 'flag',
              name: '-p, --patch',
              desc: 'Interactive hunk unstaging',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git restore <pathspec>...',
          desc: 'Restore working tree files',
          children: [
            {
              kind: 'flag',
              name: '-s, --source=<tree>',
              desc: 'Restore from tree',
            },
            {
              kind: 'flag',
              name: '-S, --staged',
              desc: 'Restore index (unstage)',
            },
            {
              kind: 'flag',
              name: '-W, --worktree',
              desc: 'Restore working tree (default)',
            },
            {
              kind: 'flag',
              name: '-p, --patch',
              desc: 'Interactive hunk selection',
            },
            {
              kind: 'flag',
              name: '--ours / --theirs',
              desc: 'Use specific merge stage',
            },
            {
              kind: 'flag',
              name: '--conflict=<style>',
              desc: 'merge, diff3, zdiff3',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git rm <file>...',
          desc: 'Remove files from index + working tree',
          children: [
            { kind: 'flag', name: '--cached', desc: 'Remove from index only' },
            { kind: 'flag', name: '-r', desc: 'Recursive removal' },
            {
              kind: 'flag',
              name: '-f, --force',
              desc: 'Override up-to-date check',
            },
            {
              kind: 'flag',
              name: '-n, --dry-run',
              desc: 'Show what would be removed',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'git mv <source> <dest>',
          desc: 'Move or rename',
          children: [
            {
              kind: 'flag',
              name: '-f, --force',
              desc: 'Force even if target exists',
            },
            {
              kind: 'flag',
              name: '-n, --dry-run',
              desc: 'Show what would happen',
            },
          ],
        },
      ],
    },
  ],
};
