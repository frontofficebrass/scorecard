'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseUsm } = require('../lib/parser');
const { moveStory, setStoryDone, scanSteps, EditError } = require('../lib/writer');

const SAMPLE = `# 地圖

## 探索商品

### 搜尋書籍

- [ ] [[a]]
<!-- ---- {MVP} -->
- [ ] [[b]]
<!-- ---- {Release 2} -->

### 瀏覽

- [x] [[c]]
<!-- ---- {MVP} -->
- [ ] [[d]]
<!-- ---- {Release 2} -->
`;

/** Where each story ends up, as { link: "column/release" }, for easy asserting. */
function placement(md) {
  const map = parseUsm(md);
  const out = {};
  let col = 0;
  for (const a of map.activities)
    for (const s of a.steps) {
      for (const st of s.stories) out[st.link || st.title] = col + '/' + map.releases[st.release];
      col++;
    }
  return out;
}

const lineOf = (md, link) => md.split('\n').findIndex(l => l.includes('[[' + link + ']]')) + 1;

test('moves a story into another release lane of the same column', () => {
  const out = moveStory(SAMPLE, { line: lineOf(SAMPLE, 'a'), toStep: 0, toRelease: 'Release 2' });
  assert.deepEqual(placement(out), {
    a: '0/Release 2', b: '0/Release 2', c: '1/MVP', d: '1/Release 2',
  });
  // b was already there and keeps its place; a is appended below it
  assert.match(out, /- \[ \] \[\[b\]\]\n- \[ \] \[\[a\]\]\n<!-- ---- \{Release 2\} -->/);
});

test('moves a story into another column', () => {
  const out = moveStory(SAMPLE, { line: lineOf(SAMPLE, 'a'), toStep: 1, toRelease: 'MVP' });
  assert.deepEqual(placement(out), {
    b: '0/Release 2', c: '1/MVP', a: '1/MVP', d: '1/Release 2',
  });
});

test('creates the separator when the target column has no group for that release', () => {
  const md = `## A

### S1

- [ ] [[a]]
<!-- ---- {MVP} -->
- [ ] [[b]]
<!-- ---- {Release 2} -->

### S2

- [ ] [[c]]
<!-- ---- {Release 2} -->
`;
  const out = moveStory(md, { line: lineOf(md, 'a'), toStep: 1, toRelease: 'MVP' });
  assert.deepEqual(placement(out), { b: '0/Release 2', a: '1/MVP', c: '1/Release 2' });
  // the new lane is written above Release 2, matching the global lane order
  assert.match(out, /### S2\n\n- \[ \] \[\[a\]\]\n<!-- ---- \{MVP\} -->\n- \[ \] \[\[c\]\]\n<!-- ---- \{Release 2\} -->/);
});

test('a new group is inserted in global lane order, not appended', () => {
  const md = `## A

### S1

- [ ] [[a]]
<!-- ---- {MVP} -->
- [ ] [[b]]
<!-- ---- {R2} -->
- [ ] [[c]]
<!-- ---- {R3} -->

### S2

- [ ] [[x]]
<!-- ---- {MVP} -->
- [ ] [[y]]
<!-- ---- {R3} -->
`;
  const out = moveStory(md, { line: lineOf(md, 'b'), toStep: 1, toRelease: 'R2' });
  assert.match(out, /<!-- ---- \{MVP\} -->\n- \[ \] \[\[b\]\]\n<!-- ---- \{R2\} -->\n- \[ \] \[\[y\]\]\n<!-- ---- \{R3\} -->/);
  assert.deepEqual(placement(out), { a: '0/MVP', c: '0/R3', x: '1/MVP', b: '1/R2', y: '1/R3' });
});

test('moving into Backlog puts the story after the last separator', () => {
  const out = moveStory(SAMPLE, { line: lineOf(SAMPLE, 'a'), toStep: 0, toRelease: 'Backlog' });
  assert.equal(placement(out).a, '0/Backlog');
  assert.match(out, /<!-- ---- \{Release 2\} -->\n- \[ \] \[\[a\]\]\n/);
});

test('moving out of Backlog into a lane above it', () => {
  const md = `## A

### S

- [ ] [[a]]
<!-- ---- {MVP} -->
- [ ] [[b]]
`;
  assert.equal(placement(md).b, '0/Backlog');
  const out = moveStory(md, { line: lineOf(md, 'b'), toStep: 0, toRelease: 'MVP' });
  assert.deepEqual(placement(out), { a: '0/MVP', b: '0/MVP' });
  assert.match(out, /- \[ \] \[\[a\]\]\n- \[ \] \[\[b\]\]\n<!-- ---- \{MVP\} -->/);
});

test('beforeLine reorders within a lane', () => {
  const md = `## A

### S

- [ ] [[a]]
- [ ] [[b]]
- [ ] [[c]]
<!-- ---- {MVP} -->
`;
  const out = moveStory(md, {
    line: lineOf(md, 'c'), toStep: 0, toRelease: 'MVP', beforeLine: lineOf(md, 'a'),
  });
  assert.match(out, /- \[ \] \[\[c\]\]\n- \[ \] \[\[a\]\]\n- \[ \] \[\[b\]\]\n<!-- ---- \{MVP\} -->/);
});

test('beforeLine from another lane is ignored — the card lands at the end of the target lane', () => {
  const out = moveStory(SAMPLE, {
    line: lineOf(SAMPLE, 'a'), toStep: 0, toRelease: 'Release 2', beforeLine: 999,
  });
  assert.match(out, /- \[ \] \[\[b\]\]\n- \[ \] \[\[a\]\]\n/);
});

test('the story line is moved verbatim — checkbox, alias and indentation survive', () => {
  const md = `## A

### S

- [x] [[c|完成的卡片]]
<!-- ---- {MVP} -->
<!-- ---- {R2} -->
`;
  const out = moveStory(md, { line: 5, toStep: 0, toRelease: 'R2' });
  assert.match(out, /<!-- ---- \{MVP\} -->\n- \[x\] \[\[c\|完成的卡片\]\]\n<!-- ---- \{R2\} -->/);
  const st = parseUsm(out).activities[0].steps[0].stories[0];
  assert.equal(st.done, true);
  assert.equal(st.title, '完成的卡片');
});

test('an emptied lane keeps its separator, so lane order stays put', () => {
  const out = moveStory(SAMPLE, { line: lineOf(SAMPLE, 'a'), toStep: 0, toRelease: 'Release 2' });
  assert.deepEqual(parseUsm(out).releases, ['MVP', 'Release 2']);
  assert.match(out, /### 搜尋書籍\n\n<!-- ---- \{MVP\} -->/);
});

test('a story in an implicit (title-less) step is its own column', () => {
  const md = `## A

- [ ] [[a]]
<!-- ---- {MVP} -->

### S

- [ ] [[b]]
<!-- ---- {MVP} -->
`;
  assert.deepEqual(placement(md), { a: '0/MVP', b: '1/MVP' });
  const out = moveStory(md, { line: lineOf(md, 'b'), toStep: 0, toRelease: 'MVP' });
  assert.deepEqual(placement(out), { a: '0/MVP', b: '0/MVP' });
  assert.match(out, /- \[ \] \[\[a\]\]\n- \[ \] \[\[b\]\]\n<!-- ---- \{MVP\} -->/);
});

test('story-looking lines inside a code fence are not columns and not cards', () => {
  const md = '## A\n\n### S\n\n```\n- [ ] [[fake]]\n### fake step\n```\n\n- [ ] [[real]]\n<!-- ---- {MVP} -->\n<!-- ---- {R2} -->\n';
  const out = moveStory(md, { line: lineOf(md, 'real'), toStep: 0, toRelease: 'R2' });
  assert.match(out, /```\n- \[ \] \[\[fake\]\]\n### fake step\n```/);
  assert.equal(placement(out).real, '0/R2');
});

test('moving a card onto itself is a no-op', () => {
  const line = lineOf(SAMPLE, 'a');
  assert.equal(moveStory(SAMPLE, { line, toStep: 0, toRelease: 'MVP', beforeLine: line }), SAMPLE);
  assert.equal(moveStory(SAMPLE, { line, toStep: 0, toRelease: 'MVP' }), SAMPLE);
});

test('CRLF documents stay CRLF', () => {
  const md = SAMPLE.replace(/\n/g, '\r\n');
  const out = moveStory(md, { line: lineOf(SAMPLE, 'a'), toStep: 0, toRelease: 'Release 2' });
  assert.ok(!/[^\r]\n/.test(out));
  assert.equal(placement(out).a, '0/Release 2');
});

test('scanSteps sees exactly the columns parseUsm does — `toStep` indexes both', () => {
  const docs = [
    SAMPLE,
    '',
    '# 只有標題\n',
    '- [ ] [[孤兒]]\n', // before any "##": parseUsm warns and drops it
    '### 沒有 ## 的 step\n- [ ] [[a]]\n',
    '## A\n- [ ] [[a]]\n### S1\n- [ ] [[b]]\n## B\n- [ ] [[c]]\n',
    '## A\n### S\n```\n### fenced\n- [ ] [[x]]\n```\n- [ ] [[y]]\n',
    '## A\n<!-- ---- {MVP} -->\n### S\n<!-- ---- {MVP} -->\n',
    require('fs').readFileSync(require('path').join(__dirname, '..', 'scorecard.md'), 'utf8'),
  ];
  for (const md of docs) {
    const columns = parseUsm(md).activities.flatMap(a => a.steps);
    const scanned = scanSteps(md.split(/\r?\n/));
    assert.deepEqual(
      scanned.map(s => s.title),
      columns.map(s => s.title),
      'column mismatch for:\n' + md,
    );
    // and every story sits in the group the parser assigned it to
    scanned.forEach((s, i) => {
      const fromScan = s.groups.flatMap(g => g.storyLines.map(l => l + 1));
      assert.deepEqual(fromScan, columns[i].stories.map(st => st.line));
    });
  }
});

test('setStoryDone ticks and unticks a card', () => {
  const done = setStoryDone(SAMPLE, { line: lineOf(SAMPLE, 'a'), done: true });
  assert.match(done, /- \[x\] \[\[a\]\]/);
  assert.equal(parseUsm(done).activities[0].steps[0].stories[0].done, true);

  const undone = setStoryDone(done, { line: lineOf(done, 'a'), done: false });
  assert.equal(undone, SAMPLE, 'ticking then unticking restores the file byte for byte');
});

test('setStoryDone touches nothing but the checkbox', () => {
  // "*" marker, extra spacing, an alias and trailing text all survive verbatim
  const md = '## A\n\n### S\n\n* [ ]   [[c|別名]] 尾巴文字  \n<!-- ---- {MVP} -->\n';
  const out = setStoryDone(md, { line: 5, done: true });
  assert.equal(out, '## A\n\n### S\n\n* [x]   [[c|別名]] 尾巴文字  \n<!-- ---- {MVP} -->\n');
});

test('setStoryDone is a state, not a toggle — replaying it changes nothing', () => {
  const line = lineOf(SAMPLE, 'c'); // already "[x]"
  assert.equal(setStoryDone(SAMPLE, { line, done: true }), SAMPLE);
  const off = setStoryDone(SAMPLE, { line, done: false });
  assert.equal(setStoryDone(off, { line, done: false }), off);
});

test('setStoryDone leaves lanes and columns exactly where they were', () => {
  const before = placement(SAMPLE);
  const out = setStoryDone(SAMPLE, { line: lineOf(SAMPLE, 'a'), done: true });
  assert.deepEqual(placement(out), before);
  assert.deepEqual(parseUsm(out).releases, parseUsm(SAMPLE).releases);
});

test('setStoryDone keeps CRLF line endings', () => {
  const md = SAMPLE.replace(/\n/g, '\r\n');
  const out = setStoryDone(md, { line: lineOf(SAMPLE, 'a'), done: true });
  assert.ok(!/[^\r]\n/.test(out));
  assert.match(out, /- \[x\] \[\[a\]\]/);
});

test('rejects a line that is not a story card', () => {
  assert.throws(() => moveStory(SAMPLE, { line: 3, toStep: 0, toRelease: 'MVP' }), EditError);
  assert.throws(() => moveStory(SAMPLE, { line: 9999, toStep: 0, toRelease: 'MVP' }), EditError);
  assert.throws(() => setStoryDone(SAMPLE, { line: 3, done: true }), EditError);
  assert.throws(() => setStoryDone(SAMPLE, { line: 9999, done: true }), EditError);
});

test('rejects a non-boolean done', () => {
  const line = lineOf(SAMPLE, 'a');
  for (const done of ['x', 1, null, undefined])
    assert.throws(() => setStoryDone(SAMPLE, { line, done }), EditError);
});

test('rejects an unknown column and a release name that would break the separator', () => {
  const line = lineOf(SAMPLE, 'a');
  assert.throws(() => moveStory(SAMPLE, { line, toStep: 9, toRelease: 'MVP' }), EditError);
  assert.throws(() => moveStory(SAMPLE, { line, toStep: 0, toRelease: '' }), EditError);
  assert.throws(() => moveStory(SAMPLE, { line, toStep: 0, toRelease: 'a} --> b' }), EditError);
});

test('moves complete card blocks after target children and preserves CRLF', () => {
  const body = '  - [ ] 子條目\r\n    - 第二層\r\n\r\n  ```markdown\r\n  - [ ] [[example]]\r\n  ```';
  const md = '## A\r\n### S1\r\n- [ ] [[a]]\r\n' + body + '\r\n<!-- {MVP} -->\r\n### S2\r\n- [ ] [[b]]\r\n  - 目標卡內文\r\n<!-- {MVP} -->\r\n';
  const out = moveStory(md, { line: 3, toStep: 1, toRelease: 'MVP' });
  assert.ok(out.includes('- [ ] [[b]]\r\n  - 目標卡內文\r\n- [ ] [[a]]\r\n' + body + '\r\n<!-- {MVP} -->'));
  assert.ok(!/(?<!\r)\n/.test(out));
  const stories = parseUsm(out).activities[0].steps;
  assert.equal(stories[0].stories.length, 0);
  assert.deepEqual(stories[1].stories.map(s => s.link), ['b', 'a']);
});

test('reorders a complete card before another block and can create a release for it', () => {
  const md = '## A\n- [ ] [[a]]\n  - A\n- [ ] [[b]]\n  - B\n';
  const out = moveStory(md, { line: 4, toStep: 0, toRelease: 'Backlog', beforeLine: 2 });
  assert.equal(out, '## A\n- [ ] [[b]]\n  - B\n- [ ] [[a]]\n  - A\n');
  assert.equal(moveStory(out, { line: 2, toStep: 0, toRelease: 'Backlog', beforeLine: 2 }), out);
  const released = moveStory(md, { line: 4, toStep: 0, toRelease: 'R1' });
  assert.equal(placement(released).b, '0/R1');
  assert.match(released, /- \[ \] \[\[b\]\]\n  - B\n<!-- ---- \{R1\} -->/);
});

test('toggling a parent leaves child checkboxes intact and rejects fenced examples', () => {
  const md = '## A\n- [ ] 父卡片\n  - [ ] 子條目\n```\n- [ ] 範例\n```\n';
  assert.equal(setStoryDone(md, { line: 2, done: true }), md.replace('- [ ] 父', '- [x] 父'));
  assert.throws(() => setStoryDone(md, { line: 3, done: true }), EditError);
  assert.throws(() => setStoryDone(md, { line: 5, done: true }), EditError);
});
