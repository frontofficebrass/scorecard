'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createViewer } = require('../server');

async function fixture(t, { map = 'scorecard.md' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-api-'));
  fs.mkdirSync(path.join(root, 'features'));
  const mapFile = path.join(root, map);
  fs.mkdirSync(path.dirname(mapFile), { recursive: true });
  fs.writeFileSync(mapFile, '# Test\n## Activity\n### Step\n- [ ] [[story]]\n');
  fs.writeFileSync(path.join(root, 'features/story.md'), 'Example');
  const server = createViewer({ root, mapFile: map });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  function request(route, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: server.address().port, path: route, method, headers }, res => {
        let text = '';
        res.on('data', data => { text += data; });
        res.on('end', () => resolve({ status: res.statusCode, text, json: () => JSON.parse(text) }));
      });
      req.on('error', reject);
      req.end(body);
    });
  }
  const post = (body, headers = {}) => request('/api/done', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  const write = (name, content) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const preview = async line => {
    const map = (await request('/api/map')).json();
    return (await request('/api/card?line=' + line + '&version=' + map.version)).json();
  };
  return { root, mapFile, request, post, write, preview };
}

test('API edits require current version, including changes invisible to parser', async t => {
  const f = await fixture(t);
  const map = (await f.request('/api/map')).json();
  assert.equal((await f.post({ line: 4, done: true })).status, 400);
  assert.equal((await f.post(null)).status, 400);
  assert.equal((await f.post({ line: 4, done: true, version: 'stale' })).status, 409);
  assert.equal((await f.post({ line: 4, done: true, version: map.version })).status, 200);
  assert.match(fs.readFileSync(f.mapFile, 'utf8'), /\[x\]/);
  const current = (await f.request('/api/map')).json();
  fs.appendFileSync(f.mapFile, '<!-- external edit -->\n');
  assert.equal((await f.post({ line: 4, done: false, version: current.version })).status, 409);
});

test('API rejects cross-origin, rebound Host, simple POST and oversized JSON', async t => {
  const f = await fixture(t);
  const before = fs.readFileSync(f.mapFile, 'utf8');
  const map = (await f.request('/api/map')).json();
  const edit = { line: 4, done: true, version: map.version };
  assert.equal((await f.post(edit, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await f.request('/api/map', { headers: { Host: 'untrusted.example' } })).status, 403);
  assert.equal((await f.post(edit, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await f.post(edit, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await f.post({ padding: 'x'.repeat(1000001) })).status, 413);
  assert.equal(fs.readFileSync(f.mapFile, 'utf8'), before);
  assert.equal((await f.request('/api/map')).status, 200);
});

test('feature API rejects traversal, external symlinks and directories', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.root, 'private.md'), 'private');
  fs.symlinkSync('../private.md', path.join(f.root, 'features/leak.md'));
  fs.mkdirSync(path.join(f.root, 'features/directory.md'));
  assert.equal((await f.request('/api/feature?name=story')).json().content, 'Example');
  for (const name of ['../private', 'leak', 'directory', '\0'])
    assert.equal((await f.request('/api/feature?name=' + encodeURIComponent(name))).status, 404);
});

test('move API preserves documents and returns updated release placement', async t => {
  const f = await fixture(t);
  const map = (await f.request('/api/map')).json();
  const result = await f.request('/api/move', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: map.version, line: 4, toStep: 0, toRelease: 'MVP' }),
  });
  assert.equal(result.status, 200);
  const updated = result.json();
  assert.equal(updated.releases[updated.activities[0].steps[0].stories[0].release], 'MVP');
  assert.equal(fs.readFileSync(path.join(f.root, 'features/story.md'), 'utf8'), 'Example');
});

test('all seven combinations of notes, tickets and features are previewable together', async t => {
  const f = await fixture(t);
  const ticket = '.scratch/catalog/issues/01-search.md';
  f.write(ticket, '# 01: 搜尋\n\n**Status:** ready-for-agent\n\n- [ ] 驗收條件\n');
  for (let flags = 1; flags < 8; flags++) {
    const root = (flags & 4 ? '[[story|規格]]' : '') + (flags & 2 ? ` [工作單](${ticket})` : '');
    fs.writeFileSync(f.mapFile, '## A\n- [ ] ' + (root.trim() || '筆記卡片') + '\n' + (flags & 1 ? '  - [ ] 子條目\n' : ''));
    const card = await f.preview(2);
    const expected = [...(flags & 1 ? ['notes'] : []), ...(flags & 2 ? ['ticket'] : []), ...(flags & 4 ? ['feature'] : [])];
    assert.deepEqual(card.sections.map(s => s.kind), expected, 'combination ' + flags);
    assert.ok(card.sections.every(s => !s.error));
  }
});

test('previews all same-name formats and deduplicates repeated source paths', async t => {
  const f = await fixture(t);
  f.write('features/story.feature', 'Feature: 搜尋');
  f.write('features/story.feature.md', '# 規格補充');
  fs.writeFileSync(f.mapFile, '## A\n- [ ] [[story]] [同一份](features/./story.md)\n  - [[story]]\n');
  const card = await f.preview(2);
  assert.deepEqual(card.sections.map(s => s.path), ['scorecard.md', 'features/story.feature', 'features/story.md', 'features/story.feature.md']);
});

test('a missing source does not hide available notes or tickets, and later creation refreshes the view', async t => {
  const f = await fixture(t);
  f.write('.scratch/catalog/issues/01-search.md', '# Ticket');
  fs.writeFileSync(f.mapFile, '## A\n- [ ] [[missing]]\n  - 補充\n  - [Ticket](.scratch/catalog/issues/01-search.md)\n');
  const before = (await f.request('/api/map')).json();
  const story = before.activities[0].steps[0].stories[0];
  assert.equal(story.preview.available, true);
  assert.equal(story.preview.missing, 1);
  const card = await f.preview(2);
  assert.deepEqual(card.sections.map(s => s.kind), ['notes', 'ticket', 'feature']);
  assert.match(card.sections[2].error, /尚未找到/);
  f.write('features/missing.feature', 'Feature: 新增');
  const after = (await f.request('/api/map')).json();
  assert.equal(after.version, before.version);
  assert.notEqual(after.viewVersion, before.viewVersion);
  assert.equal(after.activities[0].steps[0].stories[0].preview.missing, 0);
});

test('source content changes refresh previews without invalidating map edits', async t => {
  const f = await fixture(t);
  const before = (await f.request('/api/map')).json();
  f.write('features/story.md', '# Updated');
  const after = (await f.request('/api/map')).json();
  assert.equal(after.version, before.version);
  assert.notEqual(after.viewVersion, before.viewVersion);
  const card = await f.preview(4);
  assert.equal(card.sections[0].content, '# Updated');
  assert.equal((await f.post({ line: 4, done: true, version: before.version })).status, 200);
});

test('custom maps resolve document links relative to the map and feature links from the project', async t => {
  const f = await fixture(t, { map: 'maps/product.md' });
  f.write('tickets/issue with spaces.md', '# Issue');
  fs.writeFileSync(f.mapFile, '## A\n- [ ] [[story]] [Issue](../tickets/issue%20with%20spaces.md)\n');
  const card = await f.preview(2);
  assert.deepEqual(card.sections.map(s => s.path), ['tickets/issue with spaces.md', 'features/story.md']);
  assert.equal(card.sections[0].content, '# Issue');
});

test('legacy ticket copies read the original and fall back to an explicitly marked snapshot', async t => {
  const f = await fixture(t);
  const source = '.scratch/catalog/issues/01-search.md';
  f.write('features/story.md', `<!-- scorecard-ticket: catalog%2F1 -->\n\nSource: ${source}\nTicket-ID: catalog/1\n\n# Snapshot\n`);
  const initial = await f.preview(4);
  assert.equal(initial.sections[0].kind, 'ticket');
  assert.equal(initial.sections[0].content, '# Snapshot\n');
  assert.match(initial.sections[0].note, /匯入快照/);
  f.write(source, '# Original\n');
  const live = await f.preview(4);
  assert.equal(live.sections[0].path, source);
  assert.equal(live.sections[0].content, '# Original\n');
  assert.equal(live.sections[0].note, undefined);
  assert.notEqual(live.previewVersion, initial.previewVersion);
  fs.unlinkSync(path.join(f.root, source));
  assert.equal((await f.preview(4)).sections[0].content, '# Snapshot\n');
});

test('ambiguous feature basenames require an explicit path', async t => {
  const f = await fixture(t);
  fs.unlinkSync(path.join(f.root, 'features/story.md'));
  f.write('features/a/story.md', '# A');
  f.write('features/b/story.md', '# B');
  const card = await f.preview(4);
  assert.match(card.sections[0].error, /同名規格/);
  fs.writeFileSync(f.mapFile, '## A\n- [ ] [指定](features/b/story.md)\n');
  assert.equal((await f.preview(2)).sections[0].content, '# B');
});

test('card requests check versions, and document requests reject escapes, external symlinks and directories', async t => {
  const f = await fixture(t);
  const map = (await f.request('/api/map')).json();
  assert.equal((await f.request('/api/card?line=4')).status, 400);
  assert.equal((await f.request('/api/card?line=4&version=stale')).status, 409);
  assert.equal((await f.request('/api/card?line=999&version=' + map.version)).status, 404);
  fs.symlinkSync(os.tmpdir(), path.join(f.root, 'outside'));
  fs.mkdirSync(path.join(f.root, 'directory.md'));
  for (const name of ['../private.md', '/etc/passwd', 'outside/private.md', 'directory.md', '\0.md', '.env']) {
    assert.equal((await f.request('/api/document?path=' + encodeURIComponent(name))).status, 404, name);
  }
  assert.equal((await f.request('/api/document?path=features/story.md')).text, 'Example');
  assert.equal((await f.request('/vendor/markdown-it.js')).status, 200);
});
