'use strict';

const RE_H1 = /^#\s+(.+?)\s*$/;
const RE_H2 = /^##\s+(.+?)\s*$/;
const RE_H3 = /^###\s+(.+?)\s*$/;
const RE_STORY = /^[-*]\s+\[([ xX])\]\s+(.+?)\s*$/;
const RE_RELEASE = /^<!--.*?\{(.+?)\}.*?-->\s*$/;
const RE_FENCE = /^\s*(`{3,}|~{3,})/;

function dedent(lines) {
  const expanded = lines.map(line => line.replace(/^\t+/, tabs => '    '.repeat(tabs.length)));
  const indents = expanded.filter(line => line.trim()).map(line => line.match(/^ */)[0].length);
  const indent = indents.length ? Math.min(...indents) : 0;
  return expanded.map(line => line.slice(indent)).join('\n');
}

/** Shared boundaries for parsing, moving and importing cards. end is exclusive. */
function* documentBlocks(input) {
  const lines = Array.isArray(input) ? input : String(input).split(/\r?\n/);
  let fence = null;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const marker = line.match(RE_FENCE);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length &&
          !line.slice(marker[0].length).trim()) fence = null;
      continue;
    }
    if (marker) { fence = marker[1]; continue; }
    let match;
    if ((match = line.match(RE_STORY))) {
      let end = index + 1;
      for (let next = end; next < lines.length; next++) {
        if (!lines[next].trim()) continue;
        if (!/^(?: {2,}|\t)/.test(lines[next])) break;
        end = next + 1;
      }
      yield { type: 'story', index, end, match, bodyMarkdown: dedent(lines.slice(index + 1, end)) };
      index = end - 1;
    } else if ((match = line.match(RE_H1))) {
      yield { type: 'title', index, match };
    } else if ((match = line.match(RE_H2))) {
      yield { type: 'activity', index, match };
    } else if ((match = line.match(RE_H3))) {
      yield { type: 'step', index, match };
    } else if ((match = line.match(RE_RELEASE))) {
      yield { type: 'release', index, match };
    }
  }
}

module.exports = { documentBlocks, RE_H2, RE_H3, RE_STORY, RE_RELEASE, RE_FENCE };
