/** Where to resolve ports from. */
export interface PortOptions {
  /** Root of the checkout, found by walking up from the cwd when omitted. */
  root?: string;
  /** An already loaded config. */
  config?: unknown;
}

/** How far this checkout's ports shift from the base ones. */
export function offset(options?: PortOptions): number;

/** Every configured service's port for this checkout. */
export function ports(options?: PortOptions): Record<string, number>;

/** One service's port for this checkout. Throws for an unknown service. */
export function port(service: string, options?: PortOptions): number;
