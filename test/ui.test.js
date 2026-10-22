'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const MarkdownIt = require('markdown-it');

function ui() {
  const elements = new Map();
  const events = new Map();
  const element = (tag = 'div') => {
    const node = { tagName: tag.toUpperCase(), textContent: '', scrollTop: 0, className: '',
      children: [], dataset: {}, style: {}, attributes: {}, listeners: new Map(),
      appendChild(child) { this.children.push(child); },
      setAttribute(name, value) { this.attributes[name] = value; if (name === 'class') this.className = value; },
      addEventListener(name, fn) { this.listeners.set(name, fn); },
      getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
      closest() { return null; },
      querySelectorAll(selector) {
        return this.children.flatMap(child => [
          ...((selector.startsWith('.') ? child.className.split(' ').includes(selector.slice(1)) : child.tagName.toLowerCase() === selector) ? [child] : []),
          ...child.querySelectorAll(selector),
        ]);
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    };
    node.classList = {
      add(name) { if (!node.className.split(' ').includes(name)) node.className += ' ' + name; },
      remove(name) { node.className = node.className.split(' ').filter(c => c !== name).join(' '); },
      contains(name) { return node.className.split(' ').includes(name); },
    };
    let html = '';
    Object.defineProperty(node, 'innerHTML', {
      get() { return html; }, set(value) { html = value; node.children = []; },
    });
    return node;
  };
  const context = vm.createContext({ window: { markdownit: MarkdownIt }, document: {
    body: element('body'), createElement: element, createElementNS: (_, tag) => element(tag),
    addEventListener(name, fn) { if (!events.has(name)) events.set(name, []); events.get(name).push(fn); },
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
  }, fetch: async () => { throw new Error('no polling in unit tests'); }, setTimeout() {}, clearTimeout() {} });
  const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, context);
  return { context, elements, evaluate: code => vm.runInContext(code, context),
    keydown(options = {}) {
      const event = { key: 'Tab', target: context.document.body, preventDefault() { this.defaultPrevented = true; }, ...options };
      for (const listener of events.get('keydown')) listener(event);
      return event;
    } };
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

function routeMap() {
  const story = (title, line, release, done = false) => ({ title, line, release, done, preview: { available: false, missing: 0 } });
  return { version: 'v1', viewVersion: 'view1', title: 'Routes', file: 'scorecard.md', warnings: [],
    releases: ['R1', 'Empty release', 'R2', 'Backlog'], activities: [
      { title: 'First activity', steps: [
        { title: 'First step', stories: [story('A', 4, 0), story('B', 5, 0, true), story('Later', 7, 2), story('Spot A', 8, 3)] },
        { title: 'Second step', stories: [story('C', 10, 0), story('Spot B', 12, 3, true)] },
      ] },
      { title: 'Second activity', steps: [{ title: null, stories: [story('D', 15, 0)] }] },
    ] };
}

test('spots-route preserves column and card order, separates releases and places all backlog cards on the left', () => {
  const { context, elements, keydown } = ui();
  context.render(routeMap());
  assert.equal(keydown().defaultPrevented, true);
  const board = elements.get('board');
  const layout = board.children[0];
  assert.deepEqual(layout.children.map(c => c.className), ['spots-area', 'route-area']);
  const titles = node => node.querySelectorAll('.feature-label').map(label => label.textContent);
  assert.deepEqual(titles(layout.children[0]), ['Spot A', 'Spot B']);
  const releases = board.querySelectorAll('.route-release');
  assert.deepEqual(releases.map(release => release.children[0].textContent), ['R1', 'R2']);
  assert.deepEqual(releases.map(titles), [['A', 'B', 'C', 'D'], ['Later']]);
  assert.equal(board.querySelectorAll('.feature-node').length, 7);
  assert.equal(board.querySelectorAll('.activity').length, 0);
  assert.equal(board.querySelectorAll('.step').length, 0);
  const completed = board.querySelectorAll('.feature-node').filter(n => n.classList.contains('done'));
  assert.deepEqual(completed.map(n => n.attributes['aria-label']), ['Spot B，已完成', 'B，已完成']);
  assert.equal(elements.get('view-label').textContent, 'spots-route');
  keydown();
  assert.equal(board.children[0].className, 'grid');
  assert.equal(board.querySelectorAll('.card').length, 7);
});

test('Tab leaves editing, drawer navigation, modified keys and active drags alone', () => {
  const { context, elements, evaluate, keydown } = ui();
  context.render(routeMap());
  for (const options of [{ shiftKey: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { repeat: true },
    { target: { closest: () => ({}) } }, { key: 'Enter' }]) {
    assert.equal(keydown(options).defaultPrevented, undefined);
    assert.equal(elements.get('view-label').textContent, 'USM');
  }
  evaluate('dragging = { line: 4 }');
  assert.equal(keydown().defaultPrevented, undefined);
  evaluate('dragging = null');
  assert.equal(keydown().defaultPrevented, true);
});

test('refreshes and versioned completion edits keep spots-route selected and update the matching node', async () => {
  const { context, elements, keydown } = ui();
  context.render(routeMap());
  keydown();
  const refreshed = routeMap();
  refreshed.viewVersion = 'view2';
  context.render(refreshed);
  const updated = routeMap();
  updated.version = 'v2';
  updated.viewVersion = 'view3';
  updated.activities[0].steps[0].stories[0].done = true;
  let edit;
  context.fetch = async (url, options) => {
    edit = { url, ...JSON.parse(options.body) };
    return { ok: true, json: async () => updated };
  };
  const node = elements.get('board').querySelectorAll('.feature-node').find(n => n.dataset.line === 4);
  node.listeners.get('dblclick')();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(edit, { url: '/api/done', version: 'v1', line: 4, done: true });
  assert.equal(elements.get('view-label').textContent, 'spots-route');
  const changed = elements.get('board').querySelectorAll('.feature-node').find(n => n.dataset.line === 4);
  assert.equal(changed.classList.contains('done'), true);
  keydown();
  assert.equal(elements.get('board').querySelectorAll('.card').filter(n => n.classList.contains('done')).length, 3);
});

test('spots-route handles empty maps, backlog-only maps and release-only maps', () => {
  const { context, elements, keydown } = ui();
  const map = routeMap();
  keydown();
  context.render({ ...map, activities: [] });
  assert.equal(elements.get('board').querySelectorAll('.feature-node').length, 0);
  assert.equal(elements.get('board').querySelectorAll('.route-release').length, 0);
  for (const backlogOnly of [true, false]) {
    const filtered = routeMap();
    for (const activity of filtered.activities) for (const step of activity.steps)
      step.stories = step.stories.filter(story => (story.release === 3) === backlogOnly);
    context.render(filtered);
    const board = elements.get('board');
    assert.equal(board.querySelectorAll('.feature-node').length, backlogOnly ? 2 : 5);
    assert.equal(board.querySelectorAll('.route-release').length, backlogOnly ? 0 : 2);
  }
});

test('step groups retain empty positions and keep distinct steps separate even when their titles match', () => {
  const { context, elements, keydown } = ui();
  const map = routeMap();
  map.activities[0].steps.push({ title: 'Always empty', stories: [] });
  map.activities[1].steps[0].title = 'First step';
  context.render(map);
  keydown();
  const groups = () => elements.get('board').querySelectorAll('.route-track').map(track => track.querySelectorAll('.route-step'));
  assert.deepEqual(groups().map(row => row.map(group => group.dataset.step)), [[0, 1, 2, 3], [0, 1, 2, 3]]);
  assert.deepEqual(groups().map(row => row.map(group => group.children.length)), [[2, 1, 0, 1], [1, 0, 0, 0]]);
  const moved = map.activities[0].steps[0].stories.shift();
  moved.release = 2;
  map.activities[0].steps[1].stories.push(moved);
  context.render({ ...map, version: 'v2' });
  assert.deepEqual(groups().map(row => row.map(group => group.children.length)), [[1, 1, 0, 1], [1, 1, 0, 0]]);
  assert.equal(elements.get('board').querySelectorAll('.feature-node').length, 7);
});

test('route arrows connect cards in one row per release and return to the next nonempty release', () => {
  const { context, elements, keydown } = ui();
  const observers = [];
  context.ResizeObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  context.render(routeMap());
  keydown();
  assert.equal(observers[0].target.className, 'route-area');
  const canvas = elements.get('board').querySelector('.route-map');
  const tracks = canvas.querySelectorAll('.route-track');
  let left = 100;
  canvas.getBoundingClientRect = () => ({ left, top: 20, width: 472, height: 208 });
  tracks.forEach((track, row) => {
    let offset = 24;
    track.querySelectorAll('.route-step').forEach(group => {
      const dots = group.querySelectorAll('.feature-dot');
      const start = offset, width = dots.length ? dots.length * 112 - 8 : 6;
      group.getBoundingClientRect = () => ({ left: left + start, right: left + start + width,
        top: 20 + row * 120 + 10, bottom: 20 + row * 120 + 58 });
      dots.forEach((dot, i) => {
        dot.getBoundingClientRect = () => ({ left: left + start + i * 112 + 45,
          top: 20 + row * 120 + 10, width: 14, height: 14 });
      });
      offset += width;
    });
    track.getBoundingClientRect = () => ({ right: left + offset + 24, bottom: 20 + row * 120 + 68 });
  });
  const paths = () => [...canvas.querySelector('.route-arrows').innerHTML.matchAll(/class="route-link" d="([^"]+)"/g)].map(m => m[1]);
  observers[0].callback();
  const initial = paths();
  assert.deepEqual(initial.slice(0, 3), ['M 86 17 H 177', 'M 198 17 H 281', 'M 302 17 H 385']);
  assert.equal(initial.length, 4, 'four R1 cards connect to the single R2 card, skipping the empty release and backlog');
  assert.match(initial[3], /^M 406 17 .*Q 3 137 13 137 H 65$/);
  const bands = canvas.querySelector('.route-bands').innerHTML;
  assert.deepEqual([...bands.matchAll(/class="([^"]+)"/g)].map(m => m[1]), ['step-band', 'step-band alt', 'step-band']);
  assert.match(bands, /H 134 V 124 V 184 H 128 V 124/, 'the second step narrows from a card width to a 6px line in R2');
  assert.doesNotMatch(bands, /NaN|undefined/);
  left = 250;
  observers[0].callback();
  assert.deepEqual(paths(), initial, 'moving the route area keeps every release on one row and arrows aligned');
  assert.equal(canvas.querySelector('.route-bands').innerHTML, bands, 'step ribbons stay aligned after moving the route area');
  keydown();
  assert.equal(observers[0].disconnected, true);
});

test('release connectors preserve at least 6px thickness across large shifts and changing band widths', () => {
  const { context } = ui();
  const segments = (widths, left = 24) => widths.map(width => {
    const segment = { left, right: left + width };
    left += width;
    return segment;
  });
  const scenarios = [
    [[6, 6, 6, 104], [104, 6, 6, 6]],
    [[104, 6, 6, 6], [6, 6, 6, 104]],
    [[6, 600, 6, 6, 300], [300, 6, 600, 6, 6]],
    [[6, 6, 6], [6, 6, 6]],
    [[104], [6]],
    [[6], [104]],
  ];
  for (const [fromWidths, toWidths] of scenarios) {
    const from = segments(fromWidths), to = segments(toWidths);
    const transition = context.bandTransition(from, to);
    const height = Math.max(60, transition.minGap);
    const current = [...transition.source];
    for (const boundary of transition.order) {
      current[boundary] = transition.target[boundary];
      assert.ok(current.slice(1).every((x, i) => x - current[i] >= 6), 'neighboring bands remain ordered with 6px between edges');
    }
    const edge = boundary => {
      const x = transition.source[boundary], target = transition.target[boundary];
      const rank = transition.order.indexOf(boundary);
      if (rank < 0) return [[x, 0], [x, height]];
      const y = height * (rank + 1) / (transition.order.length + 1);
      return [[x, 0], [x, y], [target, y], [target, height]];
    };
    for (let step = 0; step < from.length; step++) {
      const left = edge(step), right = edge(step + 1);
      for (let i = 1; i < left.length; i++) for (let j = 1; j < right.length; j++) {
        const distance = axis => Math.max(0,
          Math.min(left[i - 1][axis], left[i][axis]) - Math.max(right[j - 1][axis], right[j][axis]),
          Math.min(right[j - 1][axis], right[j][axis]) - Math.max(left[i - 1][axis], left[i][axis]));
        assert.ok(Math.hypot(distance(0), distance(1)) >= 6 - .001, 'the perpendicular distance between connector edges is at least 6px');
      }
    }
  }
});
