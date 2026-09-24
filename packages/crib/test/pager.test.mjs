// Which pager runs, and when. The arguments matter more than they look: `-X`
// keeps less off the alternate screen, and off it the mouse wheel scrolls the
// terminal's scrollback instead of the document.

import { deepEqual, equal } from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pagerCommand, shouldPage } from '../src/pager.mjs';

const onScreen = { isTTY: true, rows: 24 };

describe('pagerCommand', () => {
  it('runs less on the alternate screen, in colour', () => {
    deepEqual(pagerCommand({}), ['less', '-R']);
  });

  it('never passes -X, which is what breaks scrolling', () => {
    equal(pagerCommand({}).includes('-X'), false);
  });

  it('prefers CRIB_PAGER over PAGER', () => {
    deepEqual(pagerCommand({ PAGER: 'more', CRIB_PAGER: 'bat' }), ['bat']);
  });

  it('leaves a pager someone spelled out themselves alone', () => {
    deepEqual(pagerCommand({ PAGER: 'less -F -X' }), ['less', '-F', '-X']);
  });

  it('treats cat and an empty pager as asking not to page', () => {
    equal(pagerCommand({ PAGER: 'cat' }), undefined);
    equal(pagerCommand({ PAGER: '   ' }), undefined);
  });
});

describe('shouldPage', () => {
  it('pages more lines than the screen holds', () => {
    equal(shouldPage({ ...onScreen, env: {} }, 100), true);
  });

  it('leaves a screen that already fits alone', () => {
    equal(shouldPage({ ...onScreen, env: {} }, 5), false);
  });

  it('never pages output that is not going to a terminal', () => {
    equal(shouldPage({ isTTY: false, rows: 24, env: {} }, 100), false);
  });

  it('obeys NO_PAGER', () => {
    equal(shouldPage({ ...onScreen, env: { NO_PAGER: '1' } }, 100), false);
  });

  // The menus pass always, so a short topic pages exactly like a long one.
  it('pages a screen that fits when told always', () => {
    equal(shouldPage({ ...onScreen, env: {} }, 5, true), true);
  });

  it('always still loses to NO_PAGER and to a non-terminal', () => {
    equal(shouldPage({ ...onScreen, env: { NO_PAGER: '1' } }, 5, true), false);
    equal(shouldPage({ isTTY: false, rows: 24, env: {} }, 5, true), false);
  });
});
