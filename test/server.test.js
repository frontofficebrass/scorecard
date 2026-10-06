'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { createViewer } = require('../server');

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-api-'));
  fs.mkdirSync(path.join(root, 'features'));
  const mapFile = path.join(root, 'scorecard.md');
  fs.writeFileSync(mapFile, '# Test\n## Activity\n### Step\n- [ ] [[story]]\n');
  fs.writeFileSync(path.join(root, 'features/story.md'), 'Example');
  const server = createViewer({ root });
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
  return { root, mapFile, request, post };
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
