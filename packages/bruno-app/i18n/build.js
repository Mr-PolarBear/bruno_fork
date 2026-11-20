#!/usr/bin/env node
/* global __dirname */
/*
 * i18n build — 把 zh-CN.json 词典内联进 engine.js，
 * 输出 ../public/static/js/i18n.js，随 rsbuild public 目录一起进 dist/web。
 *
 * 词典来自开源项目 ljcyt/bruno-i18n-zh（运行时 DOM 写入拦截翻译，
 * 不改业务逻辑、不碰授权），我们补充了内部自研功能的词条。
 *
 * 用法: node packages/bruno-app/i18n/build.js
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const enginePath = path.join(root, 'engine.js');
const dictPath = path.join(root, 'zh-CN.json');
const outPath = path.join(root, '..', 'public', 'static', 'js', 'i18n.js');

const engine = fs.readFileSync(enginePath, 'utf8');
const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));

// eslint --fix 可能把 `/*__DICT__*/{}` 格式化成 `/* __DICT__ */ {}`，用正则兼容
const markerRe = /\/\*\s*__DICT__\s*\*\/\s*\{\}/;
if (!markerRe.test(engine)) {
  console.error('[i18n] marker not found in engine.js: /*__DICT__*/{}');
  process.exit(1);
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
// 内联为单行 JSON，避免体积膨胀
const out = engine.replace(markerRe, JSON.stringify(dict));
fs.writeFileSync(outPath, out, 'utf8');

console.log('[i18n] wrote ' + outPath);
console.log('  entries: ' + Object.keys(dict).length + ', size: ' + (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1) + ' KB');
