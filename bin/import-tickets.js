#!/usr/bin/env node
'use strict';
const { importTickets } = require('../lib/tickets');
const args = process.argv.slice(2);
const help = 'Usage: scorecard-import <.scratch/feature/issues[/NN-slug.md]> --activity <名稱> --step <名稱> [--map scorecard.md]\n新增卡片進入 Backlog；重匯保留位置，更新內容、標題與完成狀態。';
if (args.includes('--help') || args.includes('-h')) {
  console.log(help);
} else {
  try {
    const options = { source: args.shift() };
    while (args.length) {
      const key = args.shift();
      if (!['--activity', '--step', '--map'].includes(key) || !args.length || args[0].startsWith('--'))
        throw new Error(`無效參數：${key}\n${help}`);
      options[key.slice(2)] = args.shift();
    }
    const result = importTickets(options);
    console.log(`${result.map}：新增 ${result.added} 張，更新 ${result.updated} 張。`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
