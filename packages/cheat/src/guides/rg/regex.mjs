export const regex = {
  name: 'regex',
  description: 'Pattern syntax: classes, anchors, groups, flags',
  sections: [
    {
      title: 'Characters & Classes',
      items: [
        { kind: 'cmd', name: '.', desc: 'Any character except a line break' },
        {
          kind: 'cmd',
          name: '[abc]  [^abc]  [a-z]',
          desc: 'One of, none of, a range',
        },
        {
          kind: 'cmd',
          name: '\\d  \\w  \\s',
          desc: 'Digit, word character, whitespace',
          children: [
            {
              kind: 'flag',
              name: '\\D  \\W  \\S',
              desc: 'The negation of each',
            },
          ],
        },
        {
          kind: 'cmd',
          name: '[[:alpha:]]  [[:alnum:]]',
          desc: 'POSIX classes, only inside brackets',
          children: [
            {
              kind: 'note',
              text: '  Also digit, lower, upper, space, blank, word, punct, xdigit, cntrl, graph, print',
            },
          ],
        },
        {
          kind: 'cmd',
          name: '\\p{L}  \\pL  \\p{Greek}',
          desc: 'Unicode category or script',
          children: [
            {
              kind: 'flag',
              name: '\\P{L}',
              desc: 'Negated — anything that is not a letter',
            },
            {
              kind: 'note',
              text: '  L letter, N number, P punctuation, Lu uppercase. Scripts: Greek, Han, Cyrillic, Hiragana.',
            },
          ],
        },
        { kind: 'cmd', name: '\\x{263A}', desc: 'A codepoint by hex value' },
        {
          kind: 'cmd',
          name: '[\\w&&[^_]]',
          desc: 'Intersection — word characters bar underscore',
          children: [
            {
              kind: 'flag',
              name: '[[a-z]--[aeiou]]',
              desc: 'Difference: in the first, not the second',
            },
            {
              kind: 'flag',
              name: '[[a-d]~~[c-f]]',
              desc: 'Symmetric difference: in one but not both',
            },
          ],
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: "Rust's regex engine: Perl-ish, minus look-around and backreferences. Those need -P.",
        },
        {
          kind: 'note',
          text: 'Escape these to match them literally: . ^ $ * + ? ( ) [ ] { } | \\ — or pass -F and escape nothing.',
        },
        {
          kind: 'note',
          text: '\\d \\w \\s and \\b are Unicode-aware unless you pass --no-unicode.',
        },
      ],
    },
    {
      title: 'Repetition, Groups & Anchors',
      items: [
        {
          kind: 'cmd',
          name: '*  +  ?',
          desc: 'Zero or more, one or more, optional',
        },
        {
          kind: 'cmd',
          name: '{2}  {2,}  {2,5}',
          desc: 'Exactly, at least, between',
        },
        {
          kind: 'cmd',
          name: '*?  +?  {2,5}?',
          desc: 'Lazy — take as little as possible',
          children: [
            {
              kind: 'note',
              text: '  <.*> swallows <a><b> whole; <.*?> gives you <a> and <b> separately',
            },
          ],
        },
        { kind: 'gap' },
        { kind: 'cmd', name: '(...)', desc: 'Group, and capture it for -r' },
        { kind: 'cmd', name: '(?:...)', desc: 'Group without capturing' },
        {
          kind: 'cmd',
          name: '(?<name>...)',
          desc: 'Named capture — use as $name in -r',
          children: [
            {
              kind: 'flag',
              name: '(?P<name>...)',
              desc: 'The same thing, also accepted',
            },
          ],
        },
        {
          kind: 'cmd',
          name: 'foo|bar',
          desc: 'Either side',
          children: [
            {
              kind: 'note',
              text: '  First alternative that matches wins, not the longest: foo|foobar takes foo out of foobar',
            },
          ],
        },
        { kind: 'gap' },
        { kind: 'cmd', name: '^  $', desc: 'Start and end of a line' },
        {
          kind: 'cmd',
          name: '\\A  \\z',
          desc: 'Start and end of the whole input',
          children: [
            {
              kind: 'note',
              text: '  \\z is past the trailing newline, so you usually want \\n\\z or (?m)$',
            },
          ],
        },
        {
          kind: 'cmd',
          name: '\\b  \\B',
          desc: 'At a word boundary, and not at one',
          children: [
            {
              kind: 'flag',
              name: '\\b{start}  \\b{end}',
              desc: 'Only the opening or closing edge of a word',
            },
            {
              kind: 'flag',
              name: '\\b{start-half}  \\b{end-half}',
              desc: 'The looser pair that -w is built from',
            },
          ],
        },
      ],
    },
    {
      title: 'Inline Flags',
      items: [
        { kind: 'cmd', name: '(?i)', desc: 'Case-insensitive from here on' },
        {
          kind: 'cmd',
          name: '(?s)',
          desc: 'Dot-all: let . match line breaks',
        },
        {
          kind: 'cmd',
          name: '(?m)',
          desc: 'Make ^ and $ mean line edges, not input edges',
        },
        {
          kind: 'cmd',
          name: '(?x)',
          desc: 'Verbose: whitespace ignored, # starts a comment',
        },
        { kind: 'cmd', name: '(?u)  (?-u)', desc: 'Unicode mode on or off' },
        {
          kind: 'cmd',
          name: '(?R)',
          desc: 'CRLF-aware line anchors, as in (?R:$)',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: '(?flags) applies from there on, (?flags:...) scopes it to a group, (?-flags) turns it back off.',
        },
        {
          kind: 'note',
          text: "An inline flag beats the command line: rg -i '(?-i)Exact' searches case-sensitively.",
        },
        {
          kind: 'note',
          text: 'rg wraps your pattern in (?:...), so a trailing # comment under (?x) eats the closing bracket. Put a newline before the close.',
        },
        {
          kind: 'note',
          text: "Case folding is Unicode 'simple': -i 'straße' finds STRAßE and STRAẞE, but never STRASSE.",
        },
      ],
    },
    {
      title: 'Quoting In The Shell',
      items: [
        {
          kind: 'cmd',
          name: "rg '\\$\\d+'",
          desc: 'A literal dollar followed by digits',
        },
        {
          kind: 'cmd',
          name: "rg -F '$HOME/lib'",
          desc: 'Awkward string? Stop treating it as a regex',
        },
        {
          kind: 'cmd',
          name: "rg -e '-v'",
          desc: 'A pattern that looks like a flag',
        },
        { kind: 'gap' },
        {
          kind: 'note',
          text: 'Single-quote patterns by habit. Double quotes let the shell expand $1 and backticks before rg ever sees them.',
        },
      ],
    },
  ],
};
