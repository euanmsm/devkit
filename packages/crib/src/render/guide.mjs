// Assembling whole screens: a guide's opening, one topic, or the lot.

import { renderHeader, renderItems, renderSectionTitle } from './items.mjs';

/** Banner plus the guide's global flags and standing notes. */
export function renderIntro(paint, layout, guide) {
  return [
    ...renderHeader(paint, layout, guide.title),
    ...renderItems(paint, layout, guide.intro),
  ];
}

export function renderSection(paint, layout, section) {
  return [
    ...renderSectionTitle(paint, layout, section.title),
    ...renderItems(paint, layout, section.items),
  ];
}

export function renderTopic(paint, layout, topic) {
  return topic.sections.flatMap((section) =>
    renderSection(paint, layout, section),
  );
}

/** Everything a guide knows — `cheat gh --all`, and all of `cheat lsof`. */
export function renderWholeGuide(paint, layout, guide) {
  return [
    ...renderIntro(paint, layout, guide),
    ...guide.topics.flatMap((topic) => renderTopic(paint, layout, topic)),
  ];
}
