'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseUsm } = require('../lib/parser');

const SAMPLE = `# 我的地圖

## backbone 層級一

### backbone 層級二，例 1

- [ ] [[feature 1-1]]
<!-- （分隔線）{MVP} -->
- [ ] [[feature 1-2]]
<!-- （分隔線）{Release A} -->

### backbone 層級二，例 2

- [x] [[feature 2-1|顯示別名]]
- [ ] [[feature 2-2]]
<!-- （分隔線）{MVP} -->
- [ ] [[feature 2-3]]
<!-- （分隔線）{Release A} -->
`;

test('parses title, activities, steps', () => {
  const m = parseUsm(SAMPLE);
  assert.equal(m.title, '我的地圖');
  assert.equal(m.activities.length, 1);
  assert.equal(m.activities[0].title, 'backbone 層級一');
  assert.equal(m.activities[0].steps.length, 2);
  assert.deepEqual(m.activities[0].steps.map(s => s.stories.length), [2, 3]);
});

test('a separator claims the stories above it', () => {
  const m = parseUsm(SAMPLE);
  assert.deepEqual(m.releases, ['MVP', 'Release A']);
  const [s1, s2] = m.activities[0].steps;
  assert.deepEqual(s1.stories.map(st => st.release), [0, 1]);
  assert.deepEqual(s2.stories.map(st => st.release), [0, 0, 1]);
});

test('a separator cannot claim stories from a previous step', () => {
  const m = parseUsm(`## A
### S1
- [ ] [[a]]
### S2
- [ ] [[b]]
<!-- {R1} -->
`);
  const [s1, s2] = m.activities[0].steps;
  assert.equal(m.releases[s2.stories[0].release], 'R1');
  assert.equal(m.releases[s1.stories[0].release], 'Backlog');
});

test('stories not closed by a separator land in the bottom "Backlog" lane', () => {
  const m = parseUsm(`## A
### S
- [ ] [[a]]
<!-- {MVP} -->
- [ ] [[b]]
<!-- {R2} -->
- [ ] [[c]]
`);
  assert.deepEqual(m.releases, ['MVP', 'R2', 'Backlog']);
  assert.deepEqual(m.activities[0].steps[0].stories.map(st => st.release), [0, 1, 2]);
});

test('wiki-links, aliases and checkbox state', () => {
  const m = parseUsm(SAMPLE);
  const [s1, s2] = m.activities[0].steps;
  assert.equal(s1.stories[0].link, 'feature 1-1');
  assert.equal(s1.stories[0].title, 'feature 1-1');
  assert.equal(s1.stories[0].done, false);
  assert.equal(s2.stories[0].link, 'feature 2-1');
  assert.equal(s2.stories[0].title, '顯示別名');
  assert.equal(s2.stories[0].done, true);
});

test('same release name in different steps maps to same lane', () => {
  const m = parseUsm(`## A
### S1
- [ ] [[x]]
<!-- {R1} -->
- [ ] [[y]]
<!-- {R2} -->
### S2
- [ ] [[z]]
<!-- {R2} -->
`);
  assert.deepEqual(m.releases, ['R1', 'R2']);
  assert.equal(m.activities[0].steps[1].stories[0].release, 1);
});

test('a separator with no stories above it still declares the lane', () => {
  const m = parseUsm(`## A
### S
<!-- {R1} -->
- [ ] [[x]]
<!-- {R2} -->
`);
  assert.deepEqual(m.releases, ['R1', 'R2']);
  assert.equal(m.activities[0].steps[0].stories[0].release, 1);
});

test('stories may hang directly off an activity, in an implicit untitled step', () => {
  const m = parseUsm(`## A
- [ ] [[a]]
<!-- {MVP} -->
- [ ] [[b]]
`);
  assert.equal(m.warnings.length, 0);
  assert.equal(m.activities[0].steps.length, 1);
  assert.equal(m.activities[0].steps[0].title, null);
  assert.deepEqual(m.activities[0].steps[0].stories.map(st => m.releases[st.release]), ['MVP', 'Backlog']);
});

test('an implicit step is its own column, before the activity\'s "###" steps', () => {
  const m = parseUsm(`## A
- [ ] [[a]]
### S1
- [ ] [[b]]
## B
- [ ] [[c]]
`);
  assert.deepEqual(m.activities.map(a => a.steps.map(s => s.title)), [[null, 'S1'], [null]]);
  assert.equal(m.activities[0].steps[0].stories[0].link, 'a');
  assert.equal(m.activities[0].steps[1].stories[0].link, 'b');
});

test('a separator does not reach across an implicit step boundary', () => {
  const m = parseUsm(`## A
- [ ] [[a]]
### S1
- [ ] [[b]]
<!-- {R1} -->
`);
  assert.equal(m.releases[m.activities[0].steps[0].stories[0].release], 'Backlog');
  assert.equal(m.releases[m.activities[0].steps[1].stories[0].release], 'R1');
});

test('stories without wiki-link are kept as plain cards', () => {
  const m = parseUsm(`## A
### S
- [ ] 純文字卡片
`);
  const st = m.activities[0].steps[0].stories[0];
  assert.equal(st.title, '純文字卡片');
  assert.equal(st.link, null);
});

test('content in code fences is ignored', () => {
  const m = parseUsm('## A\n### S\n```\n- [ ] [[not-a-story]]\n### not-a-step\n```\n- [ ] [[real]]\n');
  assert.equal(m.activities[0].steps.length, 1);
  assert.equal(m.activities[0].steps[0].stories.length, 1);
  assert.equal(m.activities[0].steps[0].stories[0].link, 'real');
});

test('warns on orphan stories', () => {
  const m = parseUsm('- [ ] [[orphan]]\n');
  assert.equal(m.activities.length, 0);
  assert.equal(m.warnings.length, 1);
});
