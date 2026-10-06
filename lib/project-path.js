'use strict';
const fs = require('fs');
const path = require('path');

// Reject symlink components, including dangling links, before reading or writing.
// The caller supplies a realpath root, so a symlink to the project itself is OK.
function projectPath(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
    throw new Error(`路徑必須位於專案內：${file}`);
  let current = root;
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`不接受 symlink 路徑：${current}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return file;
}
module.exports = { projectPath };
