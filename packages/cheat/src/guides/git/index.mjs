import { setup } from './setup.mjs';
import { snapshot } from './snapshot.mjs';
import { branching } from './branching.mjs';
import { sharing } from './sharing.mjs';
import { inspect } from './inspect.mjs';
import { patching } from './patching.mjs';
import { debug } from './debug.mjs';
import { admin } from './admin.mjs';

export const git = {
  name: 'git',
  title: 'git — Version Control',
  summary: 'Git',
  intro: [
    { kind: 'note', text: 'Global flags (before subcommand):' },
    { kind: 'flag', name: '-C <path>', desc: 'Run as if started in <path>' },
    { kind: 'flag', name: '-c <key>=<value>', desc: 'Set config variable' },
    { kind: 'flag', name: '--git-dir=<path>', desc: 'Set .git directory' },
    { kind: 'flag', name: '--work-tree=<path>', desc: 'Set working tree path' },
    { kind: 'flag', name: '--no-pager / -P', desc: "Don't use pager" },
    {
      kind: 'flag',
      name: '--no-optional-locks',
      desc: "Don't take optional locks",
    },
    { kind: 'flag', name: '--bare', desc: 'Treat as bare repo' },
  ],
  topics: [
    setup,
    snapshot,
    branching,
    sharing,
    inspect,
    patching,
    debug,
    admin,
  ],
};
