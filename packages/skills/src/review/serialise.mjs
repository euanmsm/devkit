// ============================================================================
// Serialise
// ============================================================================
//
// Writes a resolved config back out as JavaScript source, so it can be inlined
// into the generated workflow script with its regexes intact.

/**
 * Renders a value as JavaScript source.
 *
 * @param value - A string, number, boolean, null, RegExp, array or plain object
 * @param indent - The indentation of the line the value starts on
 * @returns The source text
 * @throws When the value holds anything else, such as a function
 */
export function toSource(value, indent = '') {
  if (value === null) return 'null';
  if (value instanceof RegExp) return value.toString();

  const type = typeof value;

  if (type === 'string' || type === 'number' || type === 'boolean') {
    return JSON.stringify(value);
  }

  const inner = `${indent}  `;

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((item) => `${inner}${toSource(item, inner)},`);
    return `[\n${items.join('\n')}\n${indent}]`;
  }

  if (type === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const lines = entries.map(
      ([key, v]) => `${inner}${JSON.stringify(key)}: ${toSource(v, inner)},`,
    );
    return `{\n${lines.join('\n')}\n${indent}}`;
  }

  throw new Error(`Cannot write a ${type} into the workflow script`);
}
