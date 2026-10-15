'use strict';

/**
 * Parse a scorecard markdown document into a User Story Map structure.
 *
 * Format:
 *   # Map Title                          -> map title
 *   ## Activity                          -> backbone level 1
 *   ### Step                             -> backbone level 2 (optional: stories may
 *                                           hang directly off an activity, in which
 *                                           case they get an implicit step whose
 *                                           title is null — no step card is drawn)
 *   - [ ] [[feature-name]]               -> story card (todo)
 *   - [x] [[feature-name|Display]]       -> story card (done, with alias)
 *   <!-- ---- {Release Name} -->         -> release separator: the stories *above*
 *                                           this line (since the previous separator
 *                                           or the start of the step) belong to
 *                                           {Release Name}
 *
 * Stories that are not closed by a separator before the step ends belong to the
 * default trailing release, "Backlog", which is always the bottom lane.
 * Release lanes are global across the whole map, ordered by first appearance.
 */

const DEFAULT_RELEASE = 'Backlog';
const { documentBlocks, RE_H2, RE_H3, RE_STORY, RE_RELEASE, RE_FENCE } = require('./blocks');
const { references, primaryReference } = require('./markdown');

function parseUsm(markdown) {
  const lines = String(markdown).split(/\r?\n/);

  const map = {
    title: '',
    releases: [],   // ordered release names, index = lane
    activities: [], // { title, steps: [{ title, stories: [...] }] }
    warnings: [],
  };

  const releaseIndexByName = new Map();
  function laneOf(name) {
    if (!releaseIndexByName.has(name)) {
      releaseIndexByName.set(name, map.releases.length);
      map.releases.push(name);
    }
    return releaseIndexByName.get(name);
  }

  let activity = null;
  let step = null;

  // Stories seen since the last separator — a separator claims them; a step
  // boundary (or the end of the file) sends them to the trailing default lane.
  let pending = [];
  const orphans = [];
  const endGroup = () => {
    orphans.push(...pending);
    pending = [];
  };

  for (const block of documentBlocks(lines)) {
    const { match: m, index: i } = block;
    if (block.type === 'title') {
      if (!map.title) map.title = m[1];
      continue;
    }
    if (block.type === 'activity') {
      endGroup(); // separators are scoped to a step
      activity = { title: m[1], steps: [] };
      map.activities.push(activity);
      step = null;
      continue;
    }
    if (block.type === 'step') {
      endGroup();
      if (!activity) {
        activity = { title: '', steps: [] };
        map.activities.push(activity);
        map.warnings.push(`line ${i + 1}: "### ${m[1]}" appears before any "##" activity`);
      }
      step = { title: m[1], stories: [] };
      activity.steps.push(step);
      continue;
    }
    if (block.type === 'release') {
      const lane = laneOf(m[1].trim() || DEFAULT_RELEASE);
      for (const st of pending) st.release = lane;
      pending = [];
      continue;
    }
    if (block.type === 'story') {
      if (!step) {
        if (!activity) {
          map.warnings.push(`line ${i + 1}: story "${m[2]}" appears outside any "##" activity — ignored`);
          continue;
        }
        // Stories may hang directly off an activity: they get an implicit,
        // untitled step so they still occupy a column (with no step card).
        step = { title: null, stories: [] };
        activity.steps.push(step);
      }
      const done = m[1].toLowerCase() === 'x';
      const raw = m[2];
      const rootReferences = references(raw);
      const wiki = rootReferences.find(ref => ref.kind === 'feature');
      const primary = primaryReference(raw);
      const story = {
        title: primary ? primary.label : wiki ? wiki.label : raw,
        link: wiki ? wiki.target : null,
        primary,
        bodyMarkdown: block.bodyMarkdown,
        sources: [...rootReferences, ...references(block.bodyMarkdown)],
        done,
        release: null, // resolved by the separator that closes this group
        line: i + 1,
        endLine: block.end,
      };
      step.stories.push(story);
      pending.push(story);
    }
  }
  endGroup();

  // Stories never closed by a separator fall into the trailing default lane,
  // which therefore lands at the bottom of the map.
  if (orphans.length) {
    const lane = laneOf(DEFAULT_RELEASE);
    for (const st of orphans) st.release = lane;
  }

  return map;
}

module.exports = {
  parseUsm,
  DEFAULT_RELEASE,
  // shared with lib/writer.js so both agree on what a story / separator looks like
  RE_H2,
  RE_H3,
  RE_STORY,
  RE_RELEASE,
  RE_FENCE,
};
