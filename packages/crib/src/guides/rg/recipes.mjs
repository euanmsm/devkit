export const recipes = {
  name: 'recipes',
  description: 'Pipelines that earn their keep',
  sections: [
    {
      title: 'Finding Your Way Around Code',
      items: [
        {
          kind: 'cmd',
          name: "rg --files | rg 'schema'",
          desc: 'Find files by name, honouring gitignore',
          children: [
            {
              kind: 'note',
              text: '  The everyday replacement for find — --files lists paths, the second rg filters them',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -w 'getUser'",
          desc: 'Every use of a symbol, without the near-misses',
        },
        {
          kind: 'cmd',
          name: "rg -t ts 'function \\w+|const \\w+ ='",
          desc: 'Where things are defined rather than used',
        },
        {
          kind: 'cmd',
          name: "rg -U '(?s)function getUser.*?^\\}'",
          desc: 'A whole function body, brace to brace',
          children: [
            {
              kind: 'note',
              text: '  Lazy .*? and the anchored ^\\} are what stop it running to the end of the file',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -C 5 'throw new'",
          desc: 'Read a match in context without opening the file',
        },
        {
          kind: 'cmd',
          name: "rg --files-without-match -t ts 'license'",
          desc: 'Files missing something they should have',
        },
        {
          kind: 'cmd',
          name: "rg 'TODO' $(git ls-files)",
          desc: 'Search exactly what git tracks',
          children: [
            {
              kind: 'note',
              text: '  Catches gitignored-but-tracked files that plain rg skips. Use git ls-files -z | xargs -0 rg TODO for odd filenames.',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "git diff --name-only main | xargs rg 'console\\.log'",
          desc: 'Only the files this branch touched',
        },
      ],
    },
    {
      title: 'Counting & Summarising',
      items: [
        {
          kind: 'cmd',
          name: "rg -oIN '\\w+' | sort | uniq -c | sort -rn",
          desc: 'Most common words in the codebase',
          children: [
            {
              kind: 'note',
              text: '  -o one match per line, -I no paths, -N no line numbers — the shape sort and uniq want',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -oIN 'from \"([^\"]+)\"' -r '$1' | sort -u",
          desc: 'Every distinct module imported',
        },
        {
          kind: 'cmd',
          name: "rg -c 'TODO' | sort -t: -k2 -rn",
          desc: 'Which files carry the most TODOs',
        },
        {
          kind: 'cmd',
          name: "rg --stats 'TODO' | tail -8",
          desc: 'Totals, and how long the search took',
        },
        {
          kind: 'cmd',
          name: 'rg --json PATTERN | jq -r \'select(.type=="match") | .data.path.text\'',
          desc: 'Feed results to a program rather than an eye',
        },
      ],
    },
    {
      title: 'Changing Things',
      items: [
        {
          kind: 'cmd',
          name: "rg 'oldName' -r 'newName'",
          desc: 'Preview a rename — nothing is written',
        },
        {
          kind: 'cmd',
          name: "rg -l0 'oldName' | xargs -0 sed -i '' 's/oldName/newName/g'",
          desc: "Then apply it (macOS sed; drop the '' on GNU)",
          children: [
            {
              kind: 'note',
              text: '  Commit or stash first. There is no undo, and -l0 with xargs -0 is what protects filenames with spaces.',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -l 'PATTERN' | xargs $EDITOR",
          desc: 'Open every matching file at once',
        },
        {
          kind: 'cmd',
          name: 'rg --vimgrep PATTERN | fzf | cut -d: -f1-2',
          desc: 'Pick a match interactively, get path:line',
        },
      ],
    },
    {
      title: 'Streams, Logs & Scripts',
      items: [
        {
          kind: 'cmd',
          name: "tail -f app.log | rg --line-buffered 'ERROR'",
          desc: 'Filter a live log',
          children: [
            {
              kind: 'note',
              text: '  Without --line-buffered the output sits in a buffer and the pipeline looks frozen',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -z 'ERROR' logs/",
          desc: 'Search rotated .gz logs without unpacking them',
        },
        {
          kind: 'cmd',
          name: "rg --passthru -i 'error' app.log | less -R",
          desc: 'Read the whole log with the errors lit up',
        },
        {
          kind: 'cmd',
          name: "if rg -q 'FIXME' src/; then echo found; fi",
          desc: 'Use rg as a test in a script',
          children: [
            {
              kind: 'note',
              text: '  Exit 2 means the search itself failed, and that takes the else branch too — check for it in CI',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -uuu 'PATTERN' /etc",
          desc: 'Search everything, the way grep -r would',
        },
        {
          kind: 'cmd',
          name: "rg --debug 'PATTERN' path/to/file",
          desc: 'When a file you expected is missing from the results',
        },
      ],
    },
  ],
};
