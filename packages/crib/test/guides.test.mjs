// Checks that hold for every guide, so a new one can't be added half-wired.

import { equal, ok } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { registry } from '../src/registry.mjs';
import { renderTopic, renderWholeGuide } from '../src/render/guide.mjs';
import { layoutFor } from '../src/render/layout.mjs';
import { makePaint } from '../src/render/theme.mjs';
import { resolveTopic } from '../src/resolve.mjs';

const plain = makePaint(false);
const WIDTH = 80;
const guides = await Promise.all(
  registry.map(async (entry) => ({ entry, guide: await entry.load() })),
);

describe('registry', () => {
  it('lists tools in alphabetical order', () => {
    const names = registry.map((e) => e.name);
    ok(
      names.every((n, i) => i === 0 || names[i - 1] < n),
      `out of order: ${names.join(', ')}`,
    );
  });

  it('agrees with each guide about its own name', () => {
    for (const { entry, guide } of guides) equal(guide.name, entry.name);
  });

  it('leaves learn and drill for the learning feature', () => {
    for (const entry of registry)
      ok(
        entry.name !== 'learn' && entry.name !== 'drill',
        `"${entry.name}" is reserved as a first word`,
      );
  });
});

for (const { guide } of guides) {
  describe(`${guide.name} guide`, () => {
    it('has topics', () => {
      ok(guide.topics.length > 0);
    });

    it('uses topic names you can type', () => {
      for (const topic of guide.topics) {
        ok(
          /^[a-z][a-z0-9-]*$/.test(topic.name),
          `${guide.name}: "${topic.name}" is not a typeable topic name`,
        );
      }
    });

    it('has no duplicate topic names', () => {
      const names = guide.topics.map((t) => t.name);
      equal(
        new Set(names).size,
        names.length,
        `${guide.name} repeats a topic name`,
      );
    });

    it('reserves `all` for the whole guide', () => {
      ok(!guide.topics.some((t) => t.name === 'all'));
    });

    it('describes every topic for the menu', () => {
      for (const topic of guide.topics) ok(topic.description.trim().length > 0);
    });

    const layout = layoutFor(guide, WIDTH);

    it('renders every topic to something', () => {
      for (const topic of guide.topics) {
        const lines = renderTopic(plain, layout, topic).filter((l) => l.trim());
        ok(
          lines.length > 1,
          `${guide.name} --${topic.name} rendered almost nothing`,
        );
      }
    });

    it('can look up every one of its own topics by name', () => {
      for (const topic of guide.topics) {
        const found = resolveTopic(guide.topics, topic.name);
        equal(
          found.status,
          'found',
          `${guide.name} cannot resolve --${topic.name}`,
        );
      }
    });

    it('renders in full without throwing', () => {
      ok(renderWholeGuide(plain, layout, guide).length > 0);
    });

    it('draws nothing past the width it was given', () => {
      for (const line of renderWholeGuide(plain, layout, guide))
        ok(
          [...line].length <= layout.width,
          `${guide.name} overflows: ${line}`,
        );
    });
  });
}
