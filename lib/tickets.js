'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseUsm, RE_H2, RE_H3, RE_FENCE } = require('./parser');
const { scanSteps } = require('./writer');
const { projectPath } = require('./project-path');

function headings(lines) {
  let fenced = false;
  const result = [];
  lines.forEach((line, index) => {
    if (RE_FENCE.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const match = line.match(RE_H2) || line.match(RE_H3);
    if (match) result.push({ index, level: RE_H2.test(line) ? 2 : 3, title: match[1] });
  });
  return result;
}

function addCards(markdown, cards, activity, step) {
  if (!cards.length) return markdown;
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const hs = headings(lines);
  const activities = hs.filter(h => h.level === 2 && h.title === activity);
  if (activities.length > 1) throw new Error(`Activity 名稱重複：${activity}`);
  const a = activities[0];
  if (!a) return markdown + (markdown.endsWith(eol) ? eol : eol + eol) +
    [`## ${activity}`, `### ${step}`, '', ...cards, ''].join(eol);
  const end = hs.find(h => h.level === 2 && h.index > a.index)?.index ?? lines.length;
  const matches = hs.filter(h => h.level === 3 && h.index > a.index && h.index < end && h.title === step);
  if (matches.length > 1) throw new Error(`Step 名稱重複：${activity}/${step}`);
  if (matches.length) {
    const column = scanSteps(lines).find(s => s.start === matches[0].index + 1);
    // After every separator, so new tickets always enter Backlog.
    lines.splice(column.contentEnd, 0, ...cards);
  } else {
    lines.splice(end, 0, '', `### ${step}`, '', ...cards, '');
  }
  return lines.join(eol);
}

function readTicket(root, file) {
  const relative = path.relative(root, file).split(path.sep).join('/');
  if (!/^\.scratch\/[^/]+\/issues\/\d+-[^/]+\.md$/.test(relative))
    throw new Error(`來源必須是 .scratch/<feature>/issues/<NN>-<slug>.md：${relative}`);
  projectPath(root, file);
  const body = fs.readFileSync(file, 'utf8');
  const title = body.match(/^#\s+(\d+):\s*(.+?)\s*$/m);
  const number = path.basename(file).match(/^(\d+)-/)[1].replace(/^0+(?=\d)/, '');
  if (!title || title[1].replace(/^0+(?=\d)/, '') !== number)
    throw new Error(`Ticket 標題必須是 # <NN>: <title> 且與檔名編號相同：${relative}`);
  if (/[\[\]|]/.test(title[2])) throw new Error(`Ticket 標題不能包含 [、] 或 |：${relative}`);
  const status = body.match(/^\*\*Status:\*\*\s*(\S.*?)\s*$/m)?.[1].toLowerCase();
  if (!status) throw new Error(`Ticket 缺少 **Status:**：${relative}`);
  const identity = `${relative.split('/')[1]}/${number}`;
  const link = 'ticket-' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24);
  const marker = `<!-- scorecard-ticket: ${encodeURIComponent(identity)} -->`;
  return {
    identity, link, title: title[2], done: ['done', 'completed', 'closed', 'resolved'].includes(status),
    document: `${marker}\n\nSource: ${relative}\nTicket-ID: ${identity}\n\n${body}`,
    marker,
  };
}

/** Import local to-tickets artifacts. No viewer or tracker service is needed. */
function importTickets({ root = process.cwd(), source, activity, step, map: mapName } = {}) {
  root = fs.realpathSync(root);
  for (const [name, value] of Object.entries({ source, activity, step })) {
    if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value))
      throw new Error(`${name} 必須是非空單行文字`);
  }
  activity = activity.trim(); step = step.trim();
  const input = projectPath(root, path.resolve(root, source));
  const files = fs.statSync(input).isDirectory()
    ? fs.readdirSync(input).filter(n => /^\d+-.+\.md$/.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).map(n => path.join(input, n))
    : [input];
  if (!files.length) throw new Error('來源目錄沒有 <NN>-<slug>.md tickets');
  const tickets = files.map(file => readTicket(root, file));
  if (new Set(tickets.map(t => t.identity)).size !== tickets.length)
    throw new Error('來源有重複 ticket 編號');
  const mapFile = path.resolve(root, mapName || (fs.existsSync(path.join(root, 'scorecard.md')) ? 'scorecard.md' : fs.existsSync(path.join(root, 'usm.md')) ? 'usm.md' : 'scorecard.md'));
  projectPath(root, mapFile);
  if (path.extname(mapFile) !== '.md' || files.includes(mapFile)) throw new Error('map 必須是獨立的 .md 檔案');
  const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const original = read(mapFile);
  let markdown = original ?? '# Scorecard\n';
  const eol = markdown.includes('\r\n') ? '\r\n' : '\n';
  const lines = markdown.split(/\r?\n/);
  const stories = parseUsm(markdown).activities.flatMap(a => a.steps.flatMap(s => s.stories));
  const cards = [];
  const writes = [];
  let updated = 0;
  for (const ticket of tickets) {
    const target = path.join(root, 'features', ticket.link + '.md');
    projectPath(root, target);
    if (target === mapFile) throw new Error('map 不能覆蓋 ticket 副本');
    const before = read(target);
    if (before !== null && before.split(/\r?\n/)[0] !== ticket.marker)
      throw new Error(`拒絕覆蓋非匯入文件：${target}`);
    // A .feature file would shadow the imported .md in the viewer.
    if (fs.existsSync(path.join(root, 'features', ticket.link + '.feature')))
      throw new Error(`同名 .feature 會遮蔽匯入文件：${ticket.link}`);
    const existing = stories.filter(s => s.link === ticket.link);
    if (existing.length > 1) throw new Error(`看板有重複 ticket 卡片：${ticket.identity}`);
    if (existing.length) {
      const i = existing[0].line - 1;
      lines[i] = lines[i].replace(/^(?:[-*]\s+\[)[ xX](?=\])/, m => m.slice(0, -1) + (ticket.done ? 'x' : ' '))
        .replace(/\[\[[^\[\]]+\]\]/, () => `[[${ticket.link}|${ticket.title}]]`);
      updated++;
    } else {
      cards.push(`- [${ticket.done ? 'x' : ' '}] [[${ticket.link}|${ticket.title}]]`);
    }
    writes.push({ file: target, before, after: ticket.document });
  }
  markdown = addCards(lines.join(eol), cards, activity, step);
  writes.push({ file: mapFile, before: original, after: markdown });
  // Validate every destination before writing any output. Re-read to catch edits
  // made while preparing this import (including edits from the viewer).
  for (const w of writes) {
    if (read(w.file) !== w.before) throw new Error(`檔案已變動，請重試：${w.file}`);
  }
  // Stage all files first. Publish the map last, so new cards never point to
  // documents that have not been written. Roll back normal I/O failures.
  const staged = [];
  const applied = [];
  try {
    for (const w of writes) {
      if (w.before === w.after) continue;
      projectPath(root, w.file);
      fs.mkdirSync(path.dirname(w.file), { recursive: true });
      const temp = w.file + '.' + crypto.randomUUID() + '.tmp';
      staged.push({ ...w, temp });
      fs.writeFileSync(temp, w.after, { flag: 'wx', mode: w.before === null ? 0o644 : fs.statSync(w.file).mode });
    }
    for (const w of staged) {
      projectPath(root, w.file);
      if (read(w.file) !== w.before) throw new Error(`檔案已變動，請重試：${w.file}`);
      fs.renameSync(w.temp, w.file);
      applied.push(w);
    }
  } catch (error) {
    const failures = [];
    for (const w of applied.reverse()) {
      try {
        projectPath(root, w.file);
        if (read(w.file) !== w.after) throw new Error('檔案已由其他程序修改');
        if (w.before === null) fs.unlinkSync(w.file);
        else fs.writeFileSync(w.file, w.before);
      } catch (rollback) { failures.push(`${w.file}: ${rollback.message}`); }
    }
    if (failures.length) error.message += `; 回復失敗：${failures.join('; ')}`;
    throw error;
  } finally {
    for (const w of staged) if (fs.existsSync(w.temp)) fs.unlinkSync(w.temp);
  }
  return { added: cards.length, updated, map: path.relative(root, mapFile) };
}

module.exports = { importTickets };
