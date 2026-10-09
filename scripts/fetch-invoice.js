#!/usr/bin/env node
/*
 * 国税庁ホームページからインボイス制度の概要（タックスアンサー）と
 * 「インボイス制度に関するQ&A」（1問ずつのPDF）を取得して保存する。
 *
 *   node scripts/fetch-invoice.js <保存先ディレクトリ>
 *
 * アクセスは1秒以上の間隔をあけて逐次行う。既に保存済みのファイルは再取得しない。
 * 保存したHTML・PDFは信頼できないデータとして扱い、build-invoice.js でテキストとしてのみ解析する。
 */
"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");

var BASE = "https://www.nta.go.jp";
var QA_INDEX = "/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/qa_invoice_mokuji.htm";
// 概要として掲載するタックスアンサー
var OVERVIEW = [
  "/taxes/shiraberu/taxanswer/shohi/6498.htm",
  "/taxes/shiraberu/taxanswer/shohi/6625.htm",
  "/taxes/shiraberu/taxanswer/shohi/6496.htm",
  "/taxes/shiraberu/taxanswer/shohi/6497.htm",
];
var INTERVAL_MS = 1100;

var outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node scripts/fetch-invoice.js <outDir>");
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
    ["-sS", "--max-time", "60", "--retry", "2", "-o", tmp, "-w", "%{http_code}", BASE + urlPath],
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

fs.mkdirSync(outDir, { recursive: true });

var index = fetchPath(QA_INDEX);
if (!index) {
  console.error("Q&A目次を取得できませんでした");
  process.exit(1);
}

var pdfs = [];
var re = /href="(\/taxes\/shiraberu\/zeimokubetsu\/shohi\/keigenzeiritsu\/pdf\/qa\/[^"]+\.pdf)"/g;
var m;
var html = decode(fs.readFileSync(index));
while ((m = re.exec(html))) {
  if (pdfs.indexOf(m[1]) < 0) pdfs.push(m[1]);
}
console.log("概要 " + OVERVIEW.length + " ページ / Q&A " + pdfs.length + " 問");
OVERVIEW.concat(pdfs).forEach(fetchPath);

fs.writeFileSync(
  path.join(outDir, "_fetch.json"),
  JSON.stringify({ fetchedAt: new Date().toISOString(), overview: OVERVIEW, qa: pdfs, failures: failures }, null, 2)
);
console.log("完了。失敗 " + failures.length + " 件");
