'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ticketIdentity } = require('./markdown');

const FEATURE_EXTS = ['.feature', '.md', '.feature.md'];
const digest = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
const within = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
};

function createDocuments(root) {
  const features = path.join(root, 'features');
  const relative = file => path.relative(root, file).split(path.sep).join('/');

  function safeFile(file, boundary = root) {
    try {
      const resolved = fs.realpathSync(file);
      return within(boundary, resolved) && within(root, resolved) && fs.statSync(resolved).isFile() ? resolved : null;
    } catch { return null; }
  }

  function findFeatures(name) {
    if (!name || name.includes('..') || /[\0\\]/.test(name) || path.isAbsolute(name)) return { files: [] };
    const candidates = dir => FEATURE_EXTS.map(ext => safeFile(path.join(dir, name + ext), features)).filter(Boolean);
    const direct = candidates(features);
    if (direct.length) return { files: [...new Set(direct)] };
    let entries;
    try { entries = fs.readdirSync(features, { withFileTypes: true }); } catch { return { files: [] }; }
    const groups = entries.filter(e => e.isDirectory()).map(e => candidates(path.join(features, e.name))).filter(g => g.length);
    if (groups.length > 1) return { files: [], error: '不同子目錄有同名規格，請改用明確的 Markdown 檔案連結。' };
    return { files: [...new Set(groups[0] || [])] };
  }

  function readDocument(target) {
    if (!target || !/\.(?:md|feature)$/i.test(target) || /[\0\\]/.test(target) || path.isAbsolute(target)) return null;
    const file = safeFile(path.resolve(root, target));
    if (!file) return null;
    try { return { path: relative(file), content: fs.readFileSync(file, 'utf8') }; } catch { return null; }
  }

  function storySections(story, mapFile, cache = new Map()) {
    const sections = [];
    if (story.bodyMarkdown.trim()) sections.push({ kind: 'notes', title: '卡片筆記', path: relative(mapFile), format: 'markdown', content: story.bodyMarkdown });
    const seen = new Set();
    function add(section) {
      const key = section.path || section.kind + ':' + section.target;
      if (!seen.has(key)) { seen.add(key); sections.push(section); }
    }
    function read(file) {
      if (!cache.has(file)) {
        try { cache.set(file, fs.readFileSync(file, 'utf8')); } catch { cache.set(file, null); }
      }
      return cache.get(file);
    }
    function document(file, kind, label) {
      let content = read(file);
      if (content === null) return { kind, title: label, path: relative(file), error: '無法讀取文件。' };
      let note;
      // Only our marked legacy copies may redirect to an original ticket.
      const legacy = content.match(/^<!-- scorecard-ticket: ([^\r\n]+) -->\r?\n\r?\nSource: ([^\r\n]+)\r?\nTicket-ID: ([^\r\n]+)\r?\n\r?\n([\s\S]*)$/);
      if (legacy) {
        let identity;
        try { identity = decodeURIComponent(legacy[1]); } catch { /* invalid marker */ }
        if (identity && identity === legacy[3] && ticketIdentity(legacy[2]) === identity) {
          const source = safeFile(path.resolve(root, legacy[2]));
          const original = source && read(source);
          kind = 'ticket';
          if (typeof original === 'string') { file = source; content = original; }
          else { content = legacy[4]; note = `匯入快照：原始 ticket 不存在或無法讀取（${legacy[2]}）。`; }
        }
      }
      const name = relative(file);
      if (ticketIdentity(name) || /(?:^|\/)(?:tickets|issues)\/[^/]+\.md$/i.test(name)) kind = 'ticket';
      return { kind, title: label, path: name, format: /\.feature$/i.test(file) ? 'gherkin' : 'markdown', content, ...(note ? { note } : {}) };
    }
    for (const ref of story.sources) {
      if (ref.kind === 'feature') {
        const result = findFeatures(ref.target);
        if (!result.files.length) add({ kind: 'feature', title: ref.label, target: ref.target, error: result.error || '尚未找到對應的 feature 規格。' });
        for (const file of result.files) add(document(file, 'feature', ref.label));
      } else {
        const target = path.resolve(path.dirname(mapFile), ref.target);
        const file = safeFile(target);
        const kind = ticketIdentity(relative(target)) ? 'ticket' : /\.feature$/i.test(target) ? 'feature' : 'document';
        if (file) add(document(file, kind, ref.label));
        else add({ kind, title: ref.label, target: ref.target, error: '文件不存在，或路徑不在專案內。' });
      }
    }
    const order = { notes: 0, ticket: 1, document: 1, feature: 2 };
    sections.sort((a, b) => order[a.kind] - order[b.kind]);
    return sections;
  }

  return { findFeatures, readDocument, storySections };
}

module.exports = { createDocuments, digest };
