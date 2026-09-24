import { auth } from './auth.mjs';
import { browse } from './browse.mjs';
import { repo } from './repo.mjs';
import { issue } from './issue.mjs';
import { pr } from './pr.mjs';
import { stack } from './stack.mjs';
import { release } from './release.mjs';
import { gist } from './gist.mjs';
import { actions } from './actions.mjs';
import { project } from './project.mjs';
import { search } from './search.mjs';
import { api } from './api.mjs';
import { config } from './config.mjs';
import { secrets } from './secrets.mjs';
import { keys } from './keys.mjs';
import { codespace } from './codespace.mjs';
import { misc } from './misc.mjs';
import { env } from './env.mjs';

export const gh = {
  name: 'gh',
  title: 'gh — GitHub CLI',
  summary: 'GitHub CLI',
  intro: [
    { kind: 'note', text: 'Global: --help, --version' },
    {
      kind: 'note',
      text: 'Repo override on most commands: -R, --repo [HOST/]OWNER/REPO',
    },
  ],
  topics: [
    auth,
    browse,
    repo,
    issue,
    pr,
    stack,
    release,
    gist,
    actions,
    project,
    search,
    api,
    config,
    secrets,
    keys,
    codespace,
    misc,
    env,
  ],
};
