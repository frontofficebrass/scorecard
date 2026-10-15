'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseUsm } = require('./parser');
const { documentBlocks } = require('./blocks');
const { ticketIdentity } = require('./markdown');
const { scanSteps } = require('./writer');
const { projectPath } = require('./project-path');

function headings(lines) {
  return Array.from(documentBlocks(lines)).filter(b => b.type === 'activity' || b.type === 'step')
    .map(b => ({ index: b.index, level: b.type === 'activity' ? 2 : 3, title: b.match[1] }));
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
  const identity = ticketIdentity(relative);
  const link = 'ticket-' + crypto.createHash('sha256').update(identity).digest('hex').slice(0, 24);
  const marker = `<!-- scorecard-ticket: ${encodeURIComponent(identity)} -->`;
  return {
    identity, link, title: title[2], done: ['done', 'completed', 'closed', 'resolved'].includes(status),
    file, body, marker,
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
  let updated = 0;
  for (const ticket of tickets) {
    const existing = stories.filter(s => (s.primary?.kind === 'feature' && s.primary.target === ticket.link) || (s.primary?.kind === 'document' &&
      ticketIdentity(path.relative(root, path.resolve(path.dirname(mapFile), s.primary.target)).split(path.sep).join('/')) === ticket.identity));
    if (existing.length > 1) throw new Error(`看板有重複 ticket 卡片：${ticket.identity}`);
    const target = path.relative(path.dirname(mapFile), ticket.file).split(path.sep).join('/');
    const href = target.split('/').map(part => encodeURIComponent(part).replace(/[()]/g,
      c => '%' + c.charCodeAt(0).toString(16).toUpperCase())).join('/');
    const label = ticket.title.replace(/[\\[\]`*_<>&]/g, '\\$&');
    const reference = `[${label}](${href})`;
    if (existing.length) {
      const story = existing[0];
      const i = story.line - 1;
      if (story.primary.kind === 'feature') {
        const legacy = path.join(root, 'features', ticket.link + '.md');
        projectPath(root, legacy);
        const before = read(legacy);
        if (before !== null && before.split(/\r?\n/)[0] !== ticket.marker)
          throw new Error(`拒絕遷移非匯入文件的卡片：${legacy}`);
      }
      let edited = lines[i].replace(/^(?:[-*]\s+\[)[ xX](?=\])/, m => m.slice(0, -1) + (ticket.done ? 'x' : ' '));
      if (story.primary.kind === 'feature') edited = edited.replace(/\[\[[^\[\]]+\]\]/, () => reference);
      else {
        const prefix = edited.match(/^[-*]\s+\[[ xX]\]\s+/)[0].length;
        edited = edited.slice(0, prefix) + reference + edited.slice(prefix + story.primary.length);
      }
      lines[i] = edited;
      updated++;
    } else {
      cards.push(`- [${ticket.done ? 'x' : ' '}] ${reference}`);
    }
  }
  markdown = addCards(lines.join(eol), cards, activity, step);
  for (const ticket of tickets) {
    projectPath(root, ticket.file);
    if (read(ticket.file) !== ticket.body) throw new Error(`來源已變動，請重試：${ticket.file}`);
  }
  // Publish the map atomically; original tickets and legacy copies stay untouched.
  projectPath(root, mapFile);
  if (read(mapFile) !== original) throw new Error(`檔案已變動，請重試：${mapFile}`);
  if (markdown !== original) {
    fs.mkdirSync(path.dirname(mapFile), { recursive: true });
    const temp = mapFile + '.' + crypto.randomUUID() + '.tmp';
    try {
      fs.writeFileSync(temp, markdown, { flag: 'wx', mode: original === null ? 0o644 : fs.statSync(mapFile).mode });
      projectPath(root, mapFile);
      if (read(mapFile) !== original) throw new Error(`檔案已變動，請重試：${mapFile}`);
      fs.renameSync(temp, mapFile);
    } finally {
      if (fs.existsSync(temp)) fs.unlinkSync(temp);
    }
  }
  return { added: cards.length, updated, map: path.relative(root, mapFile) };
}

module.exports = { importTickets };
