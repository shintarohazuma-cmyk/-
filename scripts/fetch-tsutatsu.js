#!/usr/bin/env node
/*
 * 国税庁ホームページから消費税関係の通達のHTMLを取得して保存する。
 *
 *   node scripts/fetch-tsutatsu.js <保存先ディレクトリ>
 *
 * 対象:
 *   - 消費税法基本通達（目次 /law/tsutatsu/kihon/shohi/01.htm から辿れる全ての節・款のページ）
 *   - 取扱通達（間接税関係 個別通達目次 /law/tsutatsu/kobetsu/kansetsu/syouhi.htm のうち、
 *     件名に「消費税」と「取扱」を含むもの。様式の制定・廃止の通知は除く）
 *
 * アクセスは1秒以上の間隔をあけて逐次行う。既に保存済みのファイルは再取得しない。
 * 保存したHTMLは信頼できないデータとして扱い、build-tsutatsu.js でテキストとしてのみ解析する。
 */
"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");

var BASE = "https://www.nta.go.jp";
var KIHON_INDEX = "/law/tsutatsu/kihon/shohi/01.htm";
var KOBETSU_INDEX = "/law/tsutatsu/kobetsu/kansetsu/syouhi.htm";
var INTERVAL_MS = 1100;

var outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/fetch-tsutatsu.js <outDir>");
  process.exit(2);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function fileFor(urlPath) {
  return path.join(outDir, urlPath.replace(/^\//, "").replace(/\//g, "_"));
}

var lastAccess = 0;
var failures = [];

function fetchPath(urlPath) {
  var file = fileFor(urlPath);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  var wait = lastAccess + INTERVAL_MS - Date.now();
  if (wait > 0) sleep(wait);
  lastAccess = Date.now();
  var tmp = file + ".part";
  var res = childProcess.spawnSync(
    "curl",
    ["-sS", "--max-time", "60", "-o", tmp, "-w", "%{http_code}", BASE + urlPath],
    { encoding: "utf8" }
  );
  var code = (res.stdout || "").trim();
  if (res.status !== 0 || code !== "200") {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    failures.push({ path: urlPath, status: code || "curl exit " + res.status, error: (res.stderr || "").trim() });
    console.error("NG " + code + " " + urlPath);
    return null;
  }
  fs.renameSync(tmp, file);
  console.log("OK " + urlPath);
  return file;
}

function decode(buf) {
  var head = buf.slice(0, 2048).toString("latin1");
  var enc = /charset=["']?shift_jis/i.test(head) ? "shift_jis" : "utf-8";
  return new TextDecoder(enc).decode(buf);
}

function plain(html) {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, "");
}

fs.mkdirSync(outDir, { recursive: true });

var kihonIndex = fetchPath(KIHON_INDEX);
var kobetsuIndex = fetchPath(KOBETSU_INDEX);
if (!kihonIndex || !kobetsuIndex) {
  console.error("目次ページを取得できませんでした");
  process.exit(1);
}

// 基本通達: 目次から各節・款のページ
var kihonPages = [];
var re = /href="(\/law\/tsutatsu\/kihon\/shohi\/\d+\/[\d\/]*\d+\.htm)"/g;
var m;
var html = decode(fs.readFileSync(kihonIndex));
while ((m = re.exec(html))) {
  if (kihonPages.indexOf(m[1]) < 0) kihonPages.push(m[1]);
}

// 取扱通達: 個別通達目次の行のうち消費税の取扱いに関するもの
var toriPages = [];
html = decode(fs.readFileSync(kobetsuIndex));
html.split(/<tr/).slice(1).forEach(function (row) {
  var tds = [];
  var td = /<td[^>]*>([\s\S]*?)<\/td>/g;
  var t;
  while ((t = td.exec(row))) tds.push(t[1]);
  if (tds.length < 2) return;
  var a = /href="(\/law\/[^"#]+\.htm)"[^>]*>([\s\S]*?)<\/a>/.exec(tds[1]);
  if (!a) return;
  var title = plain(a[2]);
  if (!/消費税/.test(title) || !/取扱/.test(title) || /様式|の廃止について/.test(title)) return;
  if (toriPages.indexOf(a[1]) < 0) toriPages.push(a[1]);
});

console.log("基本通達 " + kihonPages.length + " ページ / 取扱通達 " + toriPages.length + " 件");
kihonPages.concat(toriPages).forEach(fetchPath);

fs.writeFileSync(
  path.join(outDir, "_fetch.json"),
  JSON.stringify(
    { fetchedAt: new Date().toISOString(), kihon: kihonPages, toriatsukai: toriPages, failures: failures },
    null,
    2
  )
);
console.log("完了。失敗 " + failures.length + " 件");
