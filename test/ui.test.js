'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const MarkdownIt = require('markdown-it');

function ui() {
  const elements = new Map();
  const element = () => ({ textContent: '', innerHTML: '', scrollTop: 0,
    classList: { add() {}, remove() {} } });
  const context = vm.createContext({ window: { markdownit: MarkdownIt }, document: {
    createElement: element,
    addEventListener() {}, getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
  }, fetch: async () => { throw new Error('no polling in unit tests'); }, setTimeout() {}, clearTimeout() {} });
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  return { context, elements, evaluate: code => vm.runInContext(code, context) };
}

test('drawer renders Markdown, nested task lists and Gherkin together without executing HTML', () => {
  const { context } = ui();
  const html = context.renderSections([
    { kind: 'notes', path: 'scorecard.md', format: 'markdown', content: '- [ ] 父條件\n  - [x] 子條件\n\n<script>alert(1)</script>\n\n[Ticket](tickets/1.md)' },
    { kind: 'ticket', title: '工作單', path: 'tickets/1.md', format: 'markdown', content: '# What to build\n\n**Status:** ready-for-agent\n\n- [ ] 驗收\n\n[危險](javascript:alert(1))' },
    { kind: 'feature', title: '搜尋', path: 'features/search.feature', format: 'gherkin', content: 'Feature: 搜尋\n  Scenario: 成功' },
  ]);
  assert.match(html, /卡片筆記/);
  assert.match(html, /Ticket：工作單/);
  assert.match(html, /Feature 規格：搜尋/);
  assert.match(html, /<h1>What to build<\/h1>/);
  assert.equal((html.match(/type="checkbox" disabled/g) || []).length, 3);
  assert.match(html, /disabled checked/);
  assert.match(html, /class="gk-kw">Feature:/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>|href="javascript:/);
  assert.match(html, /href="#source-1"/);
});

test('drawer updates source content in place, preserving scroll and resolving each file relative to itself', async () => {
  const { context, elements, evaluate } = ui();
  evaluate('version = "map-v1"');
  let content = '第一版';
  context.fetch = async () => ({ ok: true, json: async () => ({ file: 'maps/product.md', line: 3,
    previewVersion: content, sections: [{ kind: 'ticket', title: 'Ticket', path: '.scratch/catalog/issues/01-search.md',
      format: 'markdown', content }] }) });
  const story = { title: '搜尋', line: 3, link: null, previewVersion: '第一版', primary: { kind: 'document', target: '../.scratch/catalog/issues/01-search.md' } };
  await context.openCard(story);
  elements.get('d-body').scrollTop = 75;
  content = '第二版';
  context.syncDrawer({ version: 'map-v1', activities: [{ steps: [{ stories: [{ ...story, previewVersion: '第二版' }] }] }] });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(elements.get('d-body').innerHTML, /第二版/);
  assert.equal(elements.get('d-body').scrollTop, 75);
  assert.equal(context.documentPath('../02-extra.md', '.scratch/catalog/issues/01-search.md'), '.scratch/catalog/02-extra.md');
  assert.equal(context.documentPath('../../../outside.md', 'maps/product.md'), null);
});

test('late card responses cannot replace a newer selection or reopen a closed drawer', async () => {
  const { context, elements, evaluate } = ui();
  evaluate('version = "v1"');
  let release;
  context.fetch = () => new Promise(resolve => { release = resolve; });
  const pending = context.openCard({ title: 'Old', line: 2, previewVersion: 'old' });
  context.closeDrawer();
  elements.get('d-body').innerHTML = '目前內容';
  release({ ok: true, json: async () => ({ sections: [], previewVersion: 'old' }) });
  await pending;
  assert.equal(elements.get('d-body').innerHTML, '目前內容');
});

test('a map refresh cancels delayed clicks whose old line could identify another card', () => {
  const { context, evaluate } = ui();
  evaluate('clickTimer = 123');
  const canceled = [];
  context.clearTimeout = id => canceled.push(id);
  context.render({ version: 'v2', viewVersion: 'view2', title: '', file: 'scorecard.md', activities: [], warnings: [] });
  assert.ok(canceled.includes(123));
});
