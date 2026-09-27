// ============================================================================
// Render
// ============================================================================
//
// Fills a template's `{{name}}` placeholders and keeps or drops its
// `{{#name}}…{{/name}}` and `{{^name}}…{{/name}}` blocks.

const BLOCK = /\{\{([#^])([\w-]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g;
const PLACEHOLDER = /\{\{([\w-]+)\}\}/g;
const LEFTOVER_TAG = /\{\{[#^/][\w-]*\}\}/;

/**
 * Renders a template against a set of values.
 *
 * @param template - The template text
 * @param values - Values by placeholder name; an empty string or list counts as absent
 * @returns The rendered text
 * @throws When the template names a placeholder or block with no value, or leaves a block tag unrendered, as a nested block does
 */
export function render(template, values) {
  const present = (kind, name) => {
    if (!(name in values)) throw new Error(`No value for {{${kind}${name}}}`);
    const value = values[name];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  };

  const withBlocks = template.replace(BLOCK, (_, kind, name, body) =>
    (kind === '#') === present(kind, name) ? body : '',
  );

  const leftover = LEFTOVER_TAG.exec(withBlocks);
  if (leftover) {
    throw new Error(
      `Unrendered ${leftover[0]}: blocks cannot nest, and every block needs its {{/name}}`,
    );
  }

  return withBlocks.replace(PLACEHOLDER, (_, name) => {
    if (!(name in values)) throw new Error(`No value for {{${name}}}`);
    return String(values[name]);
  });
}
