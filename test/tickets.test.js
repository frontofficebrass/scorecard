'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const { importTickets } = require('../lib/tickets');
const { parseUsm } = require('../lib/parser');
const { moveStory } = require('../lib/writer');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-tickets-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, text) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  };
  const read = name => fs.readFileSync(path.join(root, name), 'utf8');
  const ticket = (feature = 'search', number = '01', title = '搜尋', status = 'ready-for-agent', slug = 'search') => {
    const file = `.scratch/${feature}/issues/${number}-${slug}.md`;
    write(file, `# ${number}: ${title}\n\n**What to build:** 找到書籍\n\n**Blocked by:** None (can start immediately)\n\n**Status:** ${status}\n\n- [ ] 找到符合的書\n`);
    return file;
  };
  const run = options => importTickets({ root, source: '.scratch/search/issues', activity: '探索', step: '搜尋', ...options });
  return { root, write, read, ticket, run };
}
const cards = md => parseUsm(md).activities.flatMap(a => a.steps.flatMap(s => s.stories));

test('imports full ticket into viewer-readable document and is byte-for-byte idempotent', t => {
  const f = fixture(t); const source = f.ticket();
  assert.equal(f.run().added, 1);
  const md = f.read('scorecard.md'); const [card] = cards(md);
  assert.equal(card.title, '搜尋'); assert.equal(card.done, false);
  assert.equal(parseUsm(md).releases[card.release], 'Backlog');
  const doc = f.read(`features/${card.link}.md`);
  assert.ok(doc.includes(`Source: ${source}`));
  assert.ok(doc.endsWith(f.read(source)));
  assert.deepEqual(f.run(), { added: 0, updated: 1, map: 'scorecard.md' });
  assert.equal(f.read('scorecard.md'), md);
  assert.equal(f.read(`features/${card.link}.md`), doc);
});

test('reimport after drag preserves placement, release, order and surrounding text; updates source state', t => {
  const f = fixture(t); f.ticket(); f.run();
  let md = f.read('scorecard.md') + '\n## 購買\n### 結帳\n- [x] [[existing]]\n<!-- ---- {MVP} -->\n';
  const card = cards(md)[0];
  md = moveStory(md, { line: card.line, toStep: 1, toRelease: 'MVP' });
  f.write('scorecard.md', md);
  fs.renameSync(path.join(f.root, '.scratch/search/issues/01-search.md'), path.join(f.root, '.scratch/search/issues/01-renamed.md'));
  f.ticket('search', '01', '搜尋新標題', 'completed', 'renamed');
  f.run({ activity: '不應新增', step: '不應新增' });
  const expected = md.replace(`- [ ] [[${card.link}|搜尋]]`, `- [x] [[${card.link}|搜尋新標題]]`);
  assert.equal(f.read('scorecard.md'), expected);
  assert.ok(f.read(`features/${card.link}.md`).includes('01-renamed.md'));
});

test('new tickets enter existing column Backlog and keep CRLF; same number in different features is unique', t => {
  const f = fixture(t);
  f.write('scorecard.md', '# Map\r\n## 探索\r\n### 搜尋\r\n- [x] [[old]]\r\n<!-- ---- {MVP} -->\r\n\r\n## Other\r\n');
  f.ticket(); f.run();
  f.ticket('checkout'); f.run({ source: '.scratch/checkout/issues' });
  const md = f.read('scorecard.md');
  assert.ok(!/(?<!\r)\n/.test(md));
  const map = parseUsm(md);
  const stories = map.activities[0].steps[0].stories;
  assert.equal(stories.length, 3);
  assert.equal(new Set(stories.map(s => s.link)).size, 3);
  assert.deepEqual(stories.map(s => map.releases[s.release]), ['MVP', 'Backlog', 'Backlog']);
});

test('adds a missing step inside the existing activity and ignores headings in fences', t => {
  const f = fixture(t); f.ticket();
  f.write('scorecard.md', '# Map\n```\n## 探索\n### 搜尋\n```\n## 探索\n- [ ] [[implicit]]\n## Other\n### Existing\n');
  f.run();
  const map = parseUsm(f.read('scorecard.md'));
  assert.equal(map.activities.length, 2);
  assert.equal(map.activities[0].steps[1].title, '搜尋');
  assert.equal(map.activities[0].steps[1].stories.length, 1);
});

test('invalid batch and duplicate IDs do not write output', t => {
  const f = fixture(t); f.ticket(); f.ticket('search', '02');
  f.write('.scratch/search/issues/02-search.md', '# 99: Wrong number\n');
  assert.throws(() => f.run(), /檔名編號/);
  assert.equal(fs.existsSync(path.join(f.root, 'features')), false);
  f.ticket('search', '02'); f.ticket('search', '01', 'Duplicate', 'ready-for-agent', 'duplicate');
  assert.throws(() => f.run(), /重複 ticket/);
  assert.equal(fs.existsSync(path.join(f.root, 'scorecard.md')), false);
});

test('protects unrelated documents and rejects duplicate card identities', t => {
  const f = fixture(t); f.ticket(); f.run();
  const md = f.read('scorecard.md'); const card = cards(md)[0];
  f.write(`features/${card.link}.md`, 'hand-written');
  assert.throws(() => f.run(), /拒絕覆蓋/);
  assert.equal(f.read('scorecard.md'), md);
  fs.unlinkSync(path.join(f.root, `features/${card.link}.md`));
  f.write('scorecard.md', md + `\n- [ ] [[${card.link}]]\n`);
  assert.throws(() => f.run(), /重複 ticket 卡片/);
});

test('CLI works from a project cwd with custom map and one ticket, without starting viewer', t => {
  const f = fixture(t); const source = f.ticket();
  const cli = path.resolve(__dirname, '../bin/import-tickets.js');
  const output = execFileSync(process.execPath, [cli, source, '--activity', '探索', '--step', '搜尋', '--map', 'maps/book.md'], { cwd: f.root, encoding: 'utf8' });
  assert.match(output, /新增 1 張/);
  assert.equal(cards(f.read('maps/book.md')).length, 1);
  assert.equal(fs.existsSync(path.join(f.root, 'scorecard.md')), false);
  const bad = spawnSync(process.execPath, [cli, source, '--typo'], { cwd: f.root, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /無效參數/);
});

test('source removal leaves map history intact and legacy usm.md is reused', t => {
  const f = fixture(t); f.ticket(); f.ticket('search', '02');
  f.write('usm.md', '# Legacy\n'); f.run();
  fs.unlinkSync(path.join(f.root, '.scratch/search/issues/01-search.md'));
  assert.equal(f.run().map, 'usm.md');
  assert.equal(cards(f.read('usm.md')).length, 2);
  assert.equal(fs.existsSync(path.join(f.root, 'scorecard.md')), false);
});

test('rejects paths outside project and source/output symlinks before writing', t => {
  const f = fixture(t); f.ticket();
  assert.throws(() => f.run({ map: '../outside.md' }), /專案內/);
  fs.symlinkSync(os.tmpdir(), path.join(f.root, 'features'));
  assert.throws(() => f.run(), /symlink/);
  fs.unlinkSync(path.join(f.root, 'features'));
  const source = path.join(f.root, '.scratch/search/issues/01-search.md');
  fs.renameSync(source, path.join(f.root, 'source.md'));
  fs.symlinkSync('../../../source.md', source);
  assert.throws(() => f.run(), /symlink/);
  assert.equal(fs.existsSync(path.join(f.root, 'scorecard.md')), false);
});

test('rolls back documents when publishing the map fails', t => {
  const f = fixture(t); f.ticket(); f.run();
  const md = f.read('scorecard.md'); const card = cards(md)[0];
  const document = f.read(`features/${card.link}.md`);
  f.ticket('search', '01', 'New title');
  f.ticket('search', '02');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === path.join(f.root, 'scorecard.md')) throw new Error('simulated I/O failure');
    return rename(from, to);
  });
  assert.throws(() => f.run(), /simulated I\/O failure/);
  assert.equal(f.read('scorecard.md'), md);
  assert.equal(f.read(`features/${card.link}.md`), document);
  assert.deepEqual(fs.readdirSync(path.join(f.root, 'features')), [card.link + '.md']);
});
