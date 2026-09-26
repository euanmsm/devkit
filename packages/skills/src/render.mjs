// ============================================================================
// Render
// ============================================================================
//
// Fills a template's `{{name}}` placeholders and keeps or drops its
// `{{#name}}…{{/name}}` and `{{^name}}…{{/name}}` blocks.

const BLOCK = /\{\{([#^])([\w-]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g;
const PLACEHOLDER = /\{\{([\w-]+)\}\}/g;

/**
 * Renders a template against a set of values.
 *
 * @param template - The template text
 * @param values - Values by placeholder name; an empty string or list counts as absent
 * @returns The rendered text
 * @throws When the template names a placeholder with no value
 */
export function render(template, values) {
  const present = (name) => {
    const value = values[name];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  };

  const withBlocks = template.replace(BLOCK, (_, kind, name, body) =>
    (kind === '#') === present(name) ? body : '',
  );

  return withBlocks.replace(PLACEHOLDER, (_, name) => {
    if (!(name in values)) throw new Error(`No value for {{${name}}}`);
    return String(values[name]);
  });
}
