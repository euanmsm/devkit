/** A resolved Supabase connection target and where each half came from. */
export interface SupabaseTarget {
  /** Resolved Supabase API URL. */
  url: string;
  /** Where `url` came from. */
  urlSource: string;
  /** Resolved service-role key, or an empty string when unresolved. */
  serviceRoleKey: string;
  /** Where `serviceRoleKey` came from, or `"unresolved"`. */
  keySource: string;
  /** Tree the target was resolved against. */
  root: string;
  /** Project id from `config.toml`, or null. */
  projectId: string | null;
  /** URL this tree's own stack is expected to be at. */
  expectedUrl: string;
  /** Env files consulted, in order. */
  envFiles: string[];
}

/** Options for resolving a target. */
export interface ResolveOptions {
  /** Env files read before the ones in `supabase.envFiles`. */
  envFiles?: string[];
  /** Tree to resolve against, found by walking up from the cwd when omitted. */
  root?: string;
}

/** The variable that turns a cross-stack refusal into a warning. */
export const BYPASS_VAR: 'SUPABASE_ALLOW_CROSS_WORKTREE';

/** Resolves the target without enforcing it. */
export function resolveSupabaseTarget(opts?: ResolveOptions): SupabaseTarget;

/** Describes why a target is the wrong stack, or null when it is fine. */
export function findTargetMismatch(target: SupabaseTarget): string | null;

/** Resolves once per process and throws when the target is another tree's stack. */
export function requireSupabaseTarget(opts?: ResolveOptions): SupabaseTarget;

/** Returns the service-role key, throwing when none resolved. */
export function requireServiceRoleKey(opts?: ResolveOptions): string;

/** Clears the per-process cache, for tests. */
export function resetSupabaseTargetCache(): void;
