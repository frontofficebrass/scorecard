#!/usr/bin/env node
'use strict';

/**
 * scorecard viewer server
 *
 * 把 markdown 速記渲染成 User Story Map：
 *   ## Activity（backbone 層級一）· ### Step（backbone 層級二）
 *   - [ ] story 卡片 · <!-- ---- {名稱} --> release 泳道分隔線（收走它上方的 story）
 *   [[wiki-link]] 連到 features/ 的 Gherkin feature 檔
 *
 * Usage: node server.js [map-file] [port]
 *   map-file  markdown story map（預設 scorecard.md，找不到時退回 usm.md）
 *   port      listen port（預設 4173）
 *
 * Endpoints:
 *   GET  /                viewer UI
 *   GET  /api/map         parsed story map as JSON (+ version for live reload)
 *   GET  /api/card?line=<line>&version=<map version>   all card preview sections
 *   GET  /api/document?path=<project-relative path>   original document as text
 *   GET  /api/feature?name=<wiki-link target>   feature file (Gherkin/md) content
 *   POST /api/move        drag & drop: move a story card to another cell
 *   POST /api/done        double-click: tick / untick a story card
 *                         (both write the change back into the markdown)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseUsm } = require('./lib/parser');
const { moveStory, setStoryDone, EditError } = require('./lib/writer');
const { createDocuments, digest } = require('./lib/documents');

function createViewer({ root = process.cwd(), mapFile } = {}) {
  const ROOT = fs.realpathSync(root);

  function defaultMapFile() {
    if (fs.existsSync(path.resolve(ROOT, 'scorecard.md'))) return 'scorecard.md';
    if (fs.existsSync(path.resolve(ROOT, 'usm.md'))) return 'usm.md'; // 舊檔名相容
    return 'scorecard.md';
  }

  const MAP_FILE = path.resolve(ROOT, mapFile || defaultMapFile());
  const documents = createDocuments(ROOT);

  function buildMap(includeSections = false) {
    let md = '';
    try {
      md = fs.readFileSync(MAP_FILE, 'utf8');
    } catch {
      return { error: `找不到 ${path.relative(ROOT, MAP_FILE)}`, title: '', releases: [], activities: [], warnings: [] };
    }
    const map = parseUsm(md);
    map.file = path.relative(ROOT, MAP_FILE);
    const cache = new Map();
    const previews = [];
    for (const a of map.activities)
      for (const s of a.steps)
        for (const st of s.stories) {
          const sections = documents.storySections(st, MAP_FILE, cache);
          st.preview = { notes: false, tickets: 0, documents: 0, features: 0, missing: 0, available: false };
          for (const section of sections) {
            if (section.error) st.preview.missing++;
            else {
              st.preview.available = true;
              if (section.kind === 'notes') st.preview.notes = true;
              else st.preview[{ ticket: 'tickets', document: 'documents', feature: 'features' }[section.kind]]++;
            }
          }
          st.fileExists = st.sources.length ? sections.some(section => section.kind !== 'notes' && !section.error) : null;
          st.previewVersion = digest(JSON.stringify(sections));
          previews.push(st.previewVersion);
          if (includeSections) st.sections = sections;
        }
    // Source-only changes refresh previews without invalidating map edits.
    map.version = crypto.createHash('sha256').update(md).digest('hex').slice(0, 16);
    map.viewVersion = digest(map.version + JSON.stringify(previews));
    return map;
  }

  function readBody(req, limit = 1e6) {
    return new Promise((resolve, reject) => {
      let size = 0;
      let chunks = [];
      req.on('data', (chunk) => {
        if (size > limit) return;
        size += chunk.length;
        if (size > limit) {
          chunks = [];
          reject(new EditError('request too large', 413));
        } else chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
      req.on('aborted', () => reject(new EditError('request aborted', 400)));
    });
  }

  /**
   * Apply one edit made in the viewer (a drag, a checkbox toggle) to the markdown
   * file and answer with the resulting map.
   *
   * The client sends the `version` it was looking at when it made the edit; a
   * mismatch means the file changed underneath it (an agent editing it, another
   * browser tab, …) and the request is rejected rather than applied to a map the
   * user never saw — line numbers would point at the wrong cards.
   */
  async function handleEdit(req, res, edit) {
    let body;
    try {
      body = JSON.parse(await readBody(req) || '{}');
    } catch (error) {
      return send(res, error.status || 400, JSON.stringify({ error: error.status ? error.message : 'invalid JSON body' }), 'application/json');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.version !== 'string' || !body.version)
      return send(res, 400, JSON.stringify({ error: 'version is required' }), 'application/json');
    const before = buildMap();
    if (before.error) return send(res, 404, JSON.stringify({ error: before.error }), 'application/json');
    if (body.version !== before.version)
      return send(res, 409, JSON.stringify({ error: 'stale version', version: before.version }), 'application/json');

    try {
      const md = fs.readFileSync(MAP_FILE, 'utf8');
      const next = edit(md, body);
      if (next !== md) fs.writeFileSync(MAP_FILE, next);
    } catch (e) {
      const status = e instanceof EditError ? e.status : 500;
      return send(res, status, JSON.stringify({ error: String(e.message || e) }), 'application/json');
    }
    return send(res, 200, JSON.stringify(buildMap()), 'application/json');
  }

  function send(res, code, body, type) {
    res.writeHead(code, {
      'Content-Type': type + '; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    res.end(body);
  }

  const server = http.createServer((req, res) => {
    try {
      const port = server.address().port;
      const hosts = [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`];
      if (!hosts.includes(req.headers.host)) return send(res, 403, 'invalid host', 'text/plain');
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)
        return send(res, 403, 'cross-origin request denied', 'text/plain');
      if (req.headers['sec-fetch-site'] === 'cross-site')
        return send(res, 403, 'cross-site request denied', 'text/plain');
      if (req.method === 'POST' && (req.headers['content-type'] || '').split(';')[0].trim() !== 'application/json')
        return send(res, 415, 'application/json required', 'text/plain');
      if (!['GET', 'POST'].includes(req.method)) return send(res, 405, 'method not allowed', 'text/plain');
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/') {
        return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html')), 'text/html');
      }
      if (url.pathname === '/vendor/markdown-it.js') {
        const vendor = path.join(path.dirname(require.resolve('markdown-it/package.json')), 'dist/markdown-it.min.js');
        return send(res, 200, fs.readFileSync(vendor), 'text/javascript');
      }
      if (url.pathname === '/api/map') {
        return send(res, 200, JSON.stringify(buildMap()), 'application/json');
      }
      if (url.pathname === '/api/move' && req.method === 'POST') {
        return void handleEdit(req, res, moveStory).catch(() => send(res, 500, 'edit failed', 'text/plain'));
      }
      if (url.pathname === '/api/done' && req.method === 'POST') {
        return void handleEdit(req, res, setStoryDone).catch(() => send(res, 500, 'edit failed', 'text/plain'));
      }
      if (url.pathname === '/api/feature') {
        const name = url.searchParams.get('name') || '';
        const file = documents.findFeatures(name).files[0];
        if (!file) return send(res, 404, JSON.stringify({ error: 'not found', name }), 'application/json');
        return send(res, 200, JSON.stringify({
          name,
          path: path.relative(ROOT, file),
          content: fs.readFileSync(file, 'utf8'),
        }), 'application/json');
      }
      if (url.pathname === '/api/card') {
        const version = url.searchParams.get('version');
        const line = Number(url.searchParams.get('line'));
        if (!version || !Number.isInteger(line) || line < 1)
          return send(res, 400, JSON.stringify({ error: 'line and version are required' }), 'application/json');
        const map = buildMap(true);
        if (map.error) return send(res, 404, JSON.stringify({ error: map.error }), 'application/json');
        if (version !== map.version) return send(res, 409, JSON.stringify({ error: 'stale version' }), 'application/json');
        const story = map.activities.flatMap(a => a.steps.flatMap(s => s.stories)).find(st => st.line === line);
        if (!story) return send(res, 404, JSON.stringify({ error: 'card not found' }), 'application/json');
        return send(res, 200, JSON.stringify({ title: story.title, line, file: map.file, version: map.version,
          previewVersion: story.previewVersion, sections: story.sections }), 'application/json');
      }
      if (url.pathname === '/api/document') {
        const document = documents.readDocument(url.searchParams.get('path'));
        return document ? send(res, 200, document.content, 'text/plain') : send(res, 404, 'document not found', 'text/plain');
      }
      send(res, 404, 'not found', 'text/plain');
    } catch {
      send(res, 500, 'request failed', 'text/plain');
    }
  });

  return server;
}

module.exports = { createViewer };

if (require.main === module) {
  const port = Number(process.argv[3] || process.env.PORT || 4173);
  const server = createViewer({ mapFile: process.argv[2] });
  server.listen(port, '127.0.0.1', () => {
    console.log(`⚾ scorecard: http://127.0.0.1:${server.address().port}`);
  });
}
