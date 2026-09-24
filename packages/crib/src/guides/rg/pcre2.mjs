export const pcre2 = {
  name: 'pcre2',
  description: 'What -P adds: look-around and backreferences',
  sections: [
    {
      title: 'Look-around',
      items: [
        {
          kind: 'cmd',
          name: "rg -P 'get(?=User)'",
          desc: 'Followed by — lookahead',
        },
        {
          kind: 'cmd',
          name: "rg -P 'foo(?!bar)'",
          desc: 'Not followed by — negative lookahead',
        },
        {
          kind: 'cmd',
          name: "rg -P '(?<=const )\\w+'",
          desc: 'Preceded by — lookbehind',
        },
        {
          kind: 'cmd',
          name: "rg -P '(?<!\\.)\\bmap\\b'",
          desc: 'Not preceded by — the calls, not the methods',
        },
        {
          kind: 'cmd',
          name: "rg -P 'key=\\K.*'",
          desc: '\\K drops everything matched so far',
          children: [
            {
              kind: 'note',
              text: '  A lookbehind with no width rule, and usually the shorter way to say it',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -P '^(?!.*test).*TODO'",
          desc: 'Lines with TODO but no test anywhere on them',
          children: [
            {
              kind: 'note',
              text: "  The and-not that plain regex can't express. rg TODO | rg -v test does the same without -P.",
            },
          ],
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Look-around asserts what sits beside the match without consuming it, so it never appears in -o output.',
        },
        {
          kind: 'note',
          text: 'A lookbehind has to be bounded: (?<=a{2,4}) and (?<=foo|bazz) are fine, (?<=a+) is refused.',
        },
      ],
    },
    {
      title: 'Backreferences & Control',
      items: [
        {
          kind: 'cmd',
          name: "rg -P '(\\w+) \\1'",
          desc: 'The same word twice — \\1 refers back to group 1',
        },
        {
          kind: 'cmd',
          name: "rg -P '<(?<tag>\\w+)>.*?</\\k<tag>>'",
          desc: '\\k<name> refers back to a named group',
        },
        {
          kind: 'cmd',
          name: "rg -P '\\Qa.b(c)\\E'",
          desc: '\\Q...\\E quotes a literal run',
          children: [
            {
              kind: 'note',
              text: '  PCRE2 only — the default engine rejects \\Q outright. -F is the portable answer.',
            },
          ],
        },
        {
          kind: 'cmd',
          name: "rg -P 'a++b'  /  rg -P '(?>a+)b'",
          desc: 'Possessive and atomic — never hand characters back',
        },
      ],
    },
    {
      title: 'Choosing The Engine',
      items: [
        {
          kind: 'flag',
          name: '-P, --pcre2',
          desc: 'Same as --engine=pcre2',
        },
        {
          kind: 'flag',
          name: '--engine auto',
          desc: 'Default engine, falling back per pattern',
        },
        {
          kind: 'cmd',
          name: 'rg --pcre2-version',
          desc: 'Check PCRE2 is in this build at all',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'The default engine guarantees linear-time matching and pays for it by refusing look-around and backreferences. -P lifts that, at the cost of speed and the risk of catastrophic backtracking.',
        },
        {
          kind: 'note',
          text: 'PCRE2 is an optional feature. Without it compiled in, -P prints an error and exits.',
        },
        {
          kind: 'note',
          text: 'PCRE2 also reports less: a \\n without -U silently matches nothing rather than erroring.',
        },
      ],
    },
  ],
};
