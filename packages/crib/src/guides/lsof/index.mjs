import { ports } from './ports.mjs';
import { kill } from './kill.mjs';
import { system } from './system.mjs';
import { flags } from './flags.mjs';

export const lsof = {
  name: 'lsof',
  title: 'lsof — List Open Files & Network Sockets',
  summary: 'List open files & network sockets',
  menu: false,
  intro: [
    {
      kind: 'note',
      text: "On Unix, network sockets are files — lsof doubles as a network diagnostic tool. Essential for finding what's using a port.",
    },
  ],
  topics: [ports, kill, system, flags],
};
