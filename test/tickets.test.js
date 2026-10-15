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

test('imports direct ticket links without copies and is byte-for-byte idempotent', t => {
  const f = fixture(t); const source = f.ticket();
  assert.equal(f.run().added, 1);
  const md = f.read('scorecard.md'); const [card] = cards(md);
  assert.equal(card.title, '搜尋'); assert.equal(card.done, false);
  assert.equal(parseUsm(md).releases[card.release], 'Backlog');
  const original = f.read(source);
  assert.equal(card.primary.target, source);
  assert.equal(fs.existsSync(path.join(f.root, 'features')), false);
  assert.deepEqual(f.run(), { added: 0, updated: 1, map: 'scorecard.md' });
  assert.equal(f.read('scorecard.md'), md);
  assert.equal(f.read(source), original);
});

test('reimport after drag preserves placement, release, order and surrounding text; updates source state', t => {
  const f = fixture(t); f.ticket(); f.run();
  let md = f.read('scorecard.md').replace('01-search.md)\n', '01-search.md)\n  - [ ] 人工補充\n') + '\n## 購買\n### 結帳\n- [x] [[existing]]\n<!-- ---- {MVP} -->\n';
  const card = cards(md)[0];
  md = moveStory(md, { line: card.line, toStep: 1, toRelease: 'MVP' });
  f.write('scorecard.md', md);
  fs.renameSync(path.join(f.root, '.scratch/search/issues/01-search.md'), path.join(f.root, '.scratch/search/issues/01-renamed.md'));
  f.ticket('search', '01', '搜尋新標題', 'completed', 'renamed');
  f.run({ activity: '不應新增', step: '不應新增' });
  const expected = md.replace('- [ ] [搜尋](.scratch/search/issues/01-search.md)', '- [x] [搜尋新標題](.scratch/search/issues/01-renamed.md)');
  assert.equal(f.read('scorecard.md'), expected);
  assert.equal(cards(expected).find(s => s.primary?.kind === 'document')?.bodyMarkdown, '- [ ] 人工補充');
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
  assert.equal(new Set(stories.map(s => s.primary?.target || s.link)).size, 3);
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

test('leaves unrelated documents untouched and rejects duplicate primary ticket identities', t => {
  const f = fixture(t); f.ticket(); f.run();
  const md = f.read('scorecard.md'); const card = cards(md)[0];
  f.write('features/unrelated.md', 'hand-written');
  f.run();
  assert.equal(f.read('features/unrelated.md'), 'hand-written');
  assert.equal(f.read('scorecard.md'), md);
  f.write('scorecard.md', md + `\n- [ ] [重複](${card.primary.target})\n`);
  assert.throws(() => f.run(), /重複 ticket 卡片/);
});

test('CLI works from a project cwd with custom map and one ticket, without starting viewer', t => {
  const f = fixture(t); const source = f.ticket();
  const cli = path.resolve(__dirname, '../bin/import-tickets.js');
  const output = execFileSync(process.execPath, [cli, source, '--activity', '探索', '--step', '搜尋', '--map', 'maps/book.md'], { cwd: f.root, encoding: 'utf8' });
  assert.match(output, /新增 1 張/);
  assert.equal(cards(f.read('maps/book.md')).length, 1);
  assert.equal(cards(f.read('maps/book.md'))[0].primary.target, '../' + source);
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
  fs.symlinkSync(os.tmpdir(), path.join(f.root, 'maps'));
  assert.throws(() => f.run({ map: 'maps/scorecard.md' }), /symlink/);
  fs.unlinkSync(path.join(f.root, 'maps'));
  const source = path.join(f.root, '.scratch/search/issues/01-search.md');
  fs.renameSync(source, path.join(f.root, 'source.md'));
  fs.symlinkSync('../../../source.md', source);
  assert.throws(() => f.run(), /symlink/);
  assert.equal(fs.existsSync(path.join(f.root, 'scorecard.md')), false);
});

test('failed atomic publication preserves the map and original tickets without temporary files', t => {
  const f = fixture(t); f.ticket(); f.run();
  const md = f.read('scorecard.md'); const card = cards(md)[0];
  f.ticket('search', '01', 'New title');
  f.ticket('search', '02');
  const original = f.read('.scratch/search/issues/01-search.md');
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => {
    if (to === path.join(f.root, 'scorecard.md')) throw new Error('simulated I/O failure');
    return rename(from, to);
  });
  assert.throws(() => f.run(), /simulated I\/O failure/);
  assert.equal(f.read('scorecard.md'), md);
  assert.equal(f.read('.scratch/search/issues/01-search.md'), original);
  assert.equal(fs.existsSync(path.join(f.root, 'features')), false);
  assert.ok(!fs.readdirSync(f.root).some(name => name.endsWith('.tmp')));
});

test('migrates legacy cards in place while leaving their snapshot intact', t => {
  const f = fixture(t); const source = f.ticket();
  const identity = 'search/1';
  const link = 'ticket-' + require('crypto').createHash('sha256').update(identity).digest('hex').slice(0, 24);
  const snapshot = `<!-- scorecard-ticket: search%2F1 -->\n\nSource: ${source}\nTicket-ID: ${identity}\n\n${f.read(source)}`;
  f.write(`features/${link}.md`, snapshot);
  f.write('scorecard.md', `## 探索\n### 搜尋\n* [ ]   [[${link}|舊標題]] 尾巴\n  - 人工筆記\n<!-- {MVP} -->\n`);
  assert.deepEqual(f.run(), { added: 0, updated: 1, map: 'scorecard.md' });
  assert.match(f.read('scorecard.md'), /\* \[ \]   \[搜尋\]\(.scratch\/search\/issues\/01-search.md\) 尾巴\n  - 人工筆記/);
  assert.equal(f.read(`features/${link}.md`), snapshot);
});

test('ticket attachments do not identify or overwrite their parent card', t => {
  const f = fixture(t); const source = f.ticket();
  const link = 'ticket-' + require('crypto').createHash('sha256').update('search/1').digest('hex').slice(0, 24);
  const parent = `## 探索\n### 搜尋\n- [x] [父卡片](docs/overview.md) [[${link}|附件]]\n  - [附件](${source})\n<!-- {MVP} -->\n`;
  f.write('scorecard.md', parent);
  assert.equal(f.run().added, 1);
  assert.ok(f.read('scorecard.md').startsWith(parent));
  assert.equal(cards(f.read('scorecard.md'))[0].done, true);
});

test('direct links preserve literal titles and encode special characters in source paths', t => {
  const f = fixture(t);
  const title = '搜尋 *作者* &lt;name&gt;';
  const source = f.ticket('search # beta', '01', title, 'ready-for-agent', 'filter(one)');
  f.run({ source });
  const md = f.read('scorecard.md');
  assert.equal(cards(md)[0].title, title);
  assert.equal(cards(md)[0].primary.target, source);
  assert.match(md, /search%20%23%20beta\/issues\/01-filter%28one%29.md/);
  f.run({ source });
  assert.equal(f.read('scorecard.md'), md);
});
