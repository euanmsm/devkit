// ============================================================================
// PR CLI
// ============================================================================
//
// `skills pr prepass|publish`, run by the PR skill, and `skills qa-gate
// reset|status`, run by the generated GitHub workflow.

import { readConfig } from '../config.mjs';
import { parseFlags } from '../review/cli.mjs';
import { SKILLS } from '../skills.mjs';
import { loadPrConfig } from './config.mjs';
import { githubClient, readGateEnv, runGate } from './gate.mjs';
import { prPrepass } from './prepass.mjs';
import { publish } from './publish.mjs';

const PR_USAGE = `Usage:
  skills pr prepass --scratch <dir> [--base <branch>]
  skills pr publish --result <file> --base <branch> --head <sha> [--set-base]`;

const GATE_USAGE = 'Usage: skills qa-gate <reset|status>';

/**
 * Runs one `skills pr` command, printing its result as JSON for the skill.
 *
 * @param argv - The arguments after `pr`
 * @param root - The repository root
 * @returns The process exit code
 */
export async function prCommand(argv, root) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  const need = (name) => {
    if (!flags[name] || flags[name] === true) {
      throw new Error(`skills pr ${command}: missing --${name}`);
    }
    return flags[name];
  };

  if (command === 'prepass') {
    const { config, shared } = await prConfig(root);
    const args = await prPrepass(root, config, {
      scratch: need('scratch'),
      baseBranch: shared.baseBranch,
      base: typeof flags.base === 'string' ? flags.base : undefined,
    });
    console.log(JSON.stringify(args, null, 2));
    return 0;
  }

  if (command === 'publish') {
    const { config } = await prConfig(root);
    const outcome = publish(root, config, {
      result: need('result'),
      base: need('base'),
      head: need('head'),
      setBase: flags['set-base'] === true,
    });
    console.log(JSON.stringify(outcome, null, 2));
    return 0;
  }

  console.error(PR_USAGE);
  return 2;
}

/**
 * Runs `skills qa-gate reset|status` against the pull request in the environment.
 *
 * @param argv - The arguments after `qa-gate`
 * @param env - The process environment
 * @returns The process exit code
 */
export async function qaGate(argv, env = process.env) {
  const [command] = argv;

  if (command !== 'reset' && command !== 'status') {
    console.error(GATE_USAGE);
    return 2;
  }

  const { token, repo, prNumber, headSha, skill } = readGateEnv(env);
  const status = await runGate(command, {
    api: githubClient(token),
    repo,
    prNumber,
    headSha,
    skill,
  });

  console.log(
    `Manual QA on ${status.headSha.slice(0, 7)}: ${status.state} — ${status.description}`,
  );
  return 0;
}

/**
 * Loads the PR config the way sync does, using the defaults when the skill is not enabled.
 *
 * @param root - The repository root
 * @returns The resolved PR `config` and the `shared` settings
 */
async function prConfig(root) {
  const shared = readConfig(root);
  const options = shared.skills.pr ?? SKILLS.pr.defaults;
  return { config: await loadPrConfig(root, options, shared), shared };
}
