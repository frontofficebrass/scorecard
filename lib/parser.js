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

const RE_H1 = /^#\s+(.+?)\s*$/;
const RE_H2 = /^##\s+(.+?)\s*$/;
const RE_H3 = /^###\s+(.+?)\s*$/;
const RE_STORY = /^[-*]\s+\[([ xX])\]\s+(.+?)\s*$/;
const RE_RELEASE = /^<!--.*?\{(.+?)\}.*?-->\s*$/;
const RE_WIKILINK = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/;
const RE_FENCE = /^\s*(```|~~~)/;

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
  let inFence = false;

  // Stories seen since the last separator — a separator claims them; a step
  // boundary (or the end of the file) sends them to the trailing default lane.
  let pending = [];
  const orphans = [];
  const endGroup = () => {
    orphans.push(...pending);
    pending = [];
  };

  lines.forEach((line, i) => {
    if (RE_FENCE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    let m;
    if ((m = line.match(RE_H1))) {
      if (!map.title) map.title = m[1];
      return;
    }
    if ((m = line.match(RE_H2))) {
      endGroup(); // separators are scoped to a step
      activity = { title: m[1], steps: [] };
      map.activities.push(activity);
      step = null;
      return;
    }
    if ((m = line.match(RE_H3))) {
      endGroup();
      if (!activity) {
        activity = { title: '', steps: [] };
        map.activities.push(activity);
        map.warnings.push(`line ${i + 1}: "### ${m[1]}" appears before any "##" activity`);
      }
      step = { title: m[1], stories: [] };
      activity.steps.push(step);
      return;
    }
    if ((m = line.match(RE_RELEASE))) {
      const lane = laneOf(m[1].trim() || DEFAULT_RELEASE);
      for (const st of pending) st.release = lane;
      pending = [];
      return;
    }
    if ((m = line.match(RE_STORY))) {
      if (!step) {
        if (!activity) {
          map.warnings.push(`line ${i + 1}: story "${m[2]}" appears outside any "##" activity — ignored`);
          return;
        }
        // Stories may hang directly off an activity: they get an implicit,
        // untitled step so they still occupy a column (with no step card).
        step = { title: null, stories: [] };
        activity.steps.push(step);
      }
      const done = m[1].toLowerCase() === 'x';
      const raw = m[2];
      const wiki = raw.match(RE_WIKILINK);
      const story = {
        title: wiki ? (wiki[2] || wiki[1]).trim() : raw,
        link: wiki ? wiki[1].trim() : null,
        done,
        release: null, // resolved by the separator that closes this group
        line: i + 1,
      };
      step.stories.push(story);
      pending.push(story);
      return;
    }
  });
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
