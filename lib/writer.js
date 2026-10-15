'use strict';

/**
 * Write side of the story map — what the viewer sends back when the user edits
 * a card directly:
 *
 *   moveStory()     drag a card into another cell
 *   setStoryDone()  double-click a card to tick / untick it
 *
 * Both edits are kept as small as markdown allows. `moveStory` lifts the story
 * and its indented body out verbatim and reinserts them
 * it elsewhere (list marker, `[x]`, spacing, wiki-link and any trailing text
 * ride along); `setStoryDone` rewrites the single character in its checkbox.
 *
 * A "cell" is (step column × release lane), exactly what the viewer draws, so a
 * drag maps to a single `moveStory()` call. Release membership is positional
 * (`<!-- ---- {name} -->` claims the stories above it, up to the previous
 * separator or the start of the step), so moving a story between lanes means
 * moving its line across separator lines — and, when the target step has no
 * group for that release yet, writing a new separator.
 *
 * Emptied separators are deliberately left in place: they still declare their
 * lane, which keeps the global lane order (first appearance wins) stable across
 * drags and lets the card be dragged back.
 */

const {
  parseUsm,
  DEFAULT_RELEASE,
} = require('./parser');
const { documentBlocks } = require('./blocks');

class EditError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'EditError';
    this.status = status;
  }
}

/** Split into lines, remembering how to put them back exactly as they came. */
function split(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  lines.eol = /\r\n/.test(markdown) ? '\r\n' : '\n';
  return lines;
}

/** The story line at `line` (1-based, as reported by parseUsm), or throw. */
function storyIndex(lines, line) {
  const i = Number(line) - 1;
  if (!Number.isInteger(i) || !Array.from(documentBlocks(lines)).some(b => b.type === 'story' && b.index === i))
    throw new EditError(`line ${line} is not a story card`);
  return i;
}

function separatorLine(release) {
  return `<!-- ---- {${release}} -->`;
}

/**
 * Scan the document into the same flat column list `parseUsm` produces, but
 * carrying line numbers. Columns and their order must match parseUsm exactly —
 * the viewer identifies a column by its index in that list.
 *
 * Each column holds its release groups in document order. The last group is
 * always the open one (no separator): the trailing Backlog region.
 */
function scanSteps(lines) {
  const steps = [];
  let step = null;
  let hasActivity = false;

  const openGroup = () => ({ release: null, sepLine: null, storyLines: [] });
  const lastGroup = () => step.groups[step.groups.length - 1];
  const open = (title, start) => {
    step = { title, start, end: lines.length, groups: [openGroup()] };
    steps.push(step);
  };
  const close = (i) => {
    if (step) step.end = i;
    step = null;
  };

  for (const { type, index: i, match: m } of documentBlocks(lines)) {
    if (type === 'activity') {
      close(i);
      hasActivity = true;
      continue;
    }
    if (type === 'step') {
      close(i);
      if (!hasActivity) hasActivity = true; // parseUsm synthesises an activity too
      open(m[1], i + 1);
      continue;
    }
    if (type === 'release') {
      if (!step) continue; // a separator outside any step claims nothing
      const g = lastGroup();
      g.release = m[1].trim() || DEFAULT_RELEASE;
      g.sepLine = i;
      step.groups.push(openGroup());
      continue;
    }
    if (type === 'story') {
      if (!hasActivity) continue; // parseUsm ignores (and warns about) these
      if (!step) open(null, i); // story hanging directly off an activity
      lastGroup().storyLines.push(i);
    }
  }
  close(lines.length);

  // Where new content goes when a group has no story to anchor it to: after the
  // step's last non-blank line, so it lands inside the step and not in the gap
  // before the next heading.
  for (const s of steps) {
    let e = s.end;
    while (e > s.start && !lines[e - 1].trim()) e--;
    s.contentEnd = e;
  }
  return steps;
}

const releaseOf = (group) => group.release || DEFAULT_RELEASE;

/** First line of a group, i.e. where content inserted "before" it goes. */
function groupStart(group, step) {
  if (group.storyLines.length) return group.storyLines[0];
  if (group.sepLine !== null) return group.sepLine;
  return step.contentEnd;
}

/**
 * Move the story on line `line` (1-based, as reported by parseUsm) into the
 * column `toStep` (index into the flat column list) and release lane
 * `toRelease`, placing it above the story on line `beforeLine` when given and
 * at the end of the lane otherwise.
 *
 * Returns the rewritten markdown.
 */
function moveStory(markdown, { line, toStep, toRelease, beforeLine = null }) {
  const lines = split(markdown);
  const src = storyIndex(lines, line);

  const release = String(toRelease == null ? '' : toRelease).trim();
  if (!release) throw new EditError('toRelease is required');
  if (/[{}\r\n]|-->/.test(release))
    throw new EditError(`release name cannot contain "{", "}" or "-->": ${release}`);

  const steps = scanSteps(lines);
  const step = steps[Number(toStep)];
  if (!step) throw new EditError(`no such column: ${toStep}`);

  const blocks = Array.from(documentBlocks(lines)).filter(b => b.type === 'story');
  const source = blocks.find(b => b.index === src);
  const inserted = lines.slice(src, source.end);

  // Prefer an explicitly separated group; the trailing (open) group is where
  // Backlog stories live, so it only matches the default lane.
  let target =
    step.groups.find((g) => g.sepLine !== null && g.release === release) ||
    (release === DEFAULT_RELEASE ? step.groups[step.groups.length - 1] : null);

  let pos;
  if (target) {
    const before = Number(beforeLine) - 1;
    pos =
      Number.isInteger(before) && target.storyLines.includes(before)
        ? before
        : target.storyLines.length
          ? blocks.find(b => b.index === target.storyLines[target.storyLines.length - 1]).end
          : groupStart(target, step);
  } else {
    // The lane has no group in this column yet: create one, positioned so the
    // column's groups stay in the map's global lane order.
    const order = parseUsm(markdown).releases;
    const rank = (name) => {
      const i = order.indexOf(name);
      return i === -1 ? order.length : i;
    };
    const after = step.groups.find((g) => rank(releaseOf(g)) > rank(release));
    pos = after ? groupStart(after, step) : step.contentEnd;
    inserted.push(separatorLine(release));
  }

  // Dropping back onto this card, or immediately after it, is a no-op.
  if (target?.storyLines.includes(src) && pos >= src && pos <= source.end) return markdown;

  const out = [];
  for (let i = 0; i <= lines.length; i++) {
    if (i === pos) out.push(...inserted);
    if (i < lines.length && (i < src || i >= source.end)) out.push(lines[i]);
  }
  return out.join(lines.eol);
}

/**
 * Tick or untick the story on line `line` (1-based, as reported by parseUsm) —
 * the write behind a double-click on a card.
 *
 * `done` is the state the viewer wants, not a toggle, so replaying the same
 * request twice cannot flip the card back. Only the character inside the
 * checkbox changes; the marker, spacing and everything after `]` are untouched,
 * and an already-correct checkbox is returned unchanged.
 */
function setStoryDone(markdown, { line, done }) {
  if (typeof done !== 'boolean') throw new EditError('done must be true or false');
  const lines = split(markdown);
  const i = storyIndex(lines, line);
  lines[i] = lines[i].replace(/^([-*]\s+\[)[ xX](\])/, '$1' + (done ? 'x' : ' ') + '$2');
  return lines.join(lines.eol);
}

module.exports = { moveStory, setStoryDone, scanSteps, EditError };
