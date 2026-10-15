'use strict';

const MarkdownIt = require('markdown-it');
const markdown = new MarkdownIt({ html: false });
const RE_WIKI = /^\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/;
markdown.inline.ruler.before('link', 'scorecard-wiki', (state, silent) => {
  if (state.linkLevel) return false;
  const match = state.src.slice(state.pos).match(RE_WIKI);
  if (!match) return false;
  if (!silent) {
    const token = state.push('scorecard_wiki', '', 0);
    token.meta = { kind: 'feature', target: match[1].trim(), label: (match[2] || match[1]).trim() };
    token.content = token.meta.label;
  }
  state.pos += match[0].length;
  return true;
});

function localDocumentTarget(href) {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(href)) return null;
  try {
    const target = decodeURIComponent(href.split(/[?#]/)[0]);
    return /\.(?:md|feature)$/i.test(target) && !/[\0\\]/.test(target) ? target : null;
  } catch { return null; }
}

function inlineText(tokens) {
  return tokens.map(t => t.type === 'text' || t.type === 'code_inline' || t.type === 'image'
    ? t.content : t.type === 'softbreak' || t.type === 'hardbreak' ? ' ' : '').join('');
}

/** Uses Markdown tokens so examples, images and escaped links are not sources. */
function references(source) {
  const refs = [];
  for (const block of markdown.parse(source, {})) {
    if (block.type !== 'inline') continue;
    const tokens = block.children || [];
    let inLink = false;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'link_open') {
        inLink = true;
        const href = token.attrGet('href');
        const target = localDocumentTarget(href);
        let end = i + 1;
        while (end < tokens.length && tokens[end].type !== 'link_close') end++;
        if (target) refs.push({ kind: 'document', target, label: inlineText(tokens.slice(i + 1, end)) });
      } else if (token.type === 'link_close') {
        inLink = false;
      } else if (token.type === 'scorecard_wiki' && !inLink) refs.push(token.meta);
    }
  }
  return refs;
}

/** The leading inline link's exact span, used to update its label and target only. */
function primaryReference(raw) {
  const wiki = raw.match(/^\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/);
  if (wiki) return { kind: 'feature', target: wiki[1].trim(), label: (wiki[2] || wiki[1]).trim(), length: wiki[0].length };
  if (!raw.startsWith('[')) return null;
  let brackets = 0;
  let end = -1;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '\\') { i++; continue; }
    if (raw[i] === '[') brackets++;
    if (raw[i] === ']' && --brackets === 0) { end = i + 1; break; }
  }
  if (end < 0 || raw[end] !== '(') return null;
  let depth = 0;
  for (let i = end; i < raw.length; i++) {
    if (raw[i] === '\\') { i++; continue; }
    if (raw[i] === '(') depth++;
    if (raw[i] === ')' && --depth === 0) {
      const ref = references(raw.slice(0, i + 1))[0];
      return ref?.kind === 'document' ? { ...ref, length: i + 1 } : null;
    }
  }
  return null;
}

function ticketIdentity(relative) {
  const match = relative.match(/^\.scratch\/([^/]+)\/issues\/(\d+)-[^/]+\.md$/);
  return match ? `${match[1]}/${match[2].replace(/^0+(?=\d)/, '')}` : null;
}

module.exports = { references, primaryReference, localDocumentTarget, ticketIdentity };
