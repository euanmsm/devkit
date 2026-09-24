import { auth } from './auth.mjs';
import { secrets } from './secrets.mjs';
import { run } from './run.mjs';
import { export_ } from './export.mjs';
import { scan } from './scan.mjs';
import { tokens } from './tokens.mjs';
import { vault } from './vault.mjs';
import { dynamic } from './dynamic.mjs';
import { ssh } from './ssh.mjs';
import { infra } from './infra.mjs';
import { misc } from './misc.mjs';

export const infisical = {
  name: 'infisical',
  title: 'infisical — Secret Management CLI',
  summary: 'Infisical CLI',
  intro: [
    { kind: 'note', text: 'Global flags:' },
    {
      kind: 'flag',
      name: '--domain <url>',
      desc: 'Infisical instance URL (or INFISICAL_API_URL)',
    },
    {
      kind: 'flag',
      name: '-l, --log-level <level>',
      desc: 'trace, debug, info, warn, error, fatal',
    },
    { kind: 'flag', name: '--silent', desc: 'Disable tip/info messages' },
    {
      kind: 'flag',
      name: '--telemetry',
      desc: 'Enable telemetry (default: true)',
    },
  ],
  topics: [
    auth,
    secrets,
    run,
    export_,
    scan,
    tokens,
    vault,
    dynamic,
    ssh,
    infra,
    misc,
  ],
};
