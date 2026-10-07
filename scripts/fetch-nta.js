#!/usr/bin/env node
/*
 * 国税庁ホームページから消費税関係の記事HTMLを取得して保存する。
 *
 *   node scripts/fetch-nta.js <保存先ディレクトリ>
 *
 * 対象:
 *   - タックスアンサー（コード順索引 /taxes/shiraberu/taxanswer/code/index.htm
 *     に掲載されている /taxanswer/shohi/ 配下の全記事）
 *   - 質疑応答事例「消費税」（目次一覧 /law/shitsugi/shohi/01.htm に掲載の全事例）
 *
 * アクセスは1秒以上の間隔をあけて逐次行う。既に保存済みのファイルは再取得しない。
 * HTTP通信はプロキシ設定を尊重させるため curl を使う。
 * 保存したHTMLは信頼できないデータとして扱い、build-nta.js でテキストとしてのみ解析する。
 */
"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");

var BASE = "https://www.nta.go.jp";
var TA_INDEX = "/taxes/shiraberu/taxanswer/code/index.htm";
var QA_INDEX = "/law/shitsugi/shohi/01.htm";
var INTERVAL_MS = 1100;

var outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/fetch-nta.js <outDir>");
  process.exit(2);
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// URLパス → 保存ファイル名（例: /law/shitsugi/shohi/02/01.htm → law_shitsugi_shohi_02_01.htm）
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

function links(html, re) {
  var seen = {};
  var out = [];
  var m;
  while ((m = re.exec(html))) {
    if (!seen[m[1]]) {
      seen[m[1]] = true;
      out.push(m[1]);
    }
  }
  return out;
}

fs.mkdirSync(outDir, { recursive: true });

var taIndex = fetchPath(TA_INDEX);
var qaIndex = fetchPath(QA_INDEX);
if (!taIndex || !qaIndex) {
  console.error("索引ページを取得できませんでした");
  process.exit(1);
}

var taLinks = links(decode(fs.readFileSync(taIndex)), /href="(\/taxes\/shiraberu\/taxanswer\/shohi\/\d+\.htm)"/g);
var qaLinks = links(decode(fs.readFileSync(qaIndex)), /href="(\/law\/shitsugi\/shohi\/\d+\/\d+\.htm)"/g);
console.log("タックスアンサー " + taLinks.length + " 件 / 質疑応答事例 " + qaLinks.length + " 件");

taLinks.concat(qaLinks).forEach(fetchPath);

fs.writeFileSync(
  path.join(outDir, "_fetch.json"),
  JSON.stringify({ fetchedAt: new Date().toISOString(), taxAnswer: taLinks.length, qa: qaLinks.length, failures: failures }, null, 2)
);
console.log("完了。失敗 " + failures.length + " 件");
