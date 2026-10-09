#!/usr/bin/env node
/*
 * fetch-invoice.js で保存したHTML・PDFから js/invoice.js を生成する。
 *
 *   node scripts/build-invoice.js <保存先ディレクトリ> [出力ファイル=js/invoice.js]
 *
 * PDFのテキスト抽出には pdftotext（poppler-utils）を使う。
 * HTML・PDFは信頼できないデータとして扱い、テキストを抜き出すだけにする。
 */
"use strict";

var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");

var BASE = "https://www.nta.go.jp";
var QA_INDEX = "/taxes/shiraberu/zeimokubetsu/shohi/keigenzeiritsu/qa_invoice_mokuji.htm";
var ANSWER_LEN = 300;

var dir = process.argv[2];
var outFile = process.argv[3] || path.join(__dirname, "..", "js", "invoice.js");
if (!dir) {
  console.error("usage: node scripts/build-invoice.js <htmlDir> [outFile]");
  process.exit(2);
}

function fileFor(urlPath) {
  return path.join(dir, urlPath.replace(/^\//, "").replace(/\//g, "_"));
}

function readHtml(urlPath) {
  var file = fileFor(urlPath);
  if (!fs.existsSync(file)) return null;
  var buf = fs.readFileSync(file);
  var head = buf.slice(0, 2048).toString("latin1");
  var enc = /charset=["']?shift_jis/i.test(head) ? "shift_jis" : "utf-8";
  return new TextDecoder(enc).decode(buf);
}

var ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", hellip: "…", times: "×" };

function text(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === "#") {
        var code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(code) ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e.toLowerCase()] || m;
    })
    .replace(/[\s　]+/g, " ")
    .trim();
}

function clip(str, len) {
  str = str.trim();
  return str.length <= len ? str : str.slice(0, len) + "…";
}

function mainBody(html) {
  html = html.replace(/<!--(?! InstanceEndEditable)[\s\S]*?-->/g, "");
  var start = html.search(/<h1[\s>]/i);
  if (start < 0) return "";
  var body = html.slice(start);
  var end = body.search(/class="page-top-link"|<!-- InstanceEndEditable -->/);
  return end >= 0 ? body.slice(0, end) : body;
}

/* ---------- 概要（タックスアンサー） ---------- */

// h2/h3 見出しごとに段落をまとめる。「対象税目」「根拠法令等」以降・関連リンクは除く。
function parseTaxAnswer(urlPath) {
  var html = readHtml(urlPath);
  if (!html) return null;
  var body = mainBody(html);
  var title = text((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(body) || [])[1] || "");
  var asOf = (/\[([^\]]*現在[^\]]*)\]/.exec(body) || [])[1] || "";
  var sections = [];
  var current = null;
  var stop = false;
  var re = /<(h2|h3|p|li)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  var m;
  while ((m = re.exec(body)) && !stop) {
    var tag = m[1].toLowerCase();
    var t = text(m[3]);
    if (!t) continue;
    if (tag === "h2" || tag === "h3") {
      if (/^(根拠法令等|関連コード|関連リンク|お問い合わせ先|QAリンク|対象者または対象物)/.test(t)) {
        stop = tag === "h2" && /^(根拠法令等|関連コード|お問い合わせ先)/.test(t);
        current = null;
        continue;
      }
      if (/^対象税目$/.test(t)) {
        current = null;
        continue;
      }
      current = { heading: t === "概要" ? "" : t, level: tag === "h2" ? 2 : 3, paragraphs: [] };
      sections.push(current);
      continue;
    }
    if (!current || /^\[.*現在.*\]$/.test(t)) continue;
    current.paragraphs.push(t);
  }
  sections = sections.filter(function (s) {
    return s.paragraphs.length;
  });
  return { title: title, url: BASE + urlPath, asOf: asOf, sections: sections };
}

/* ---------- Q&A ---------- */

function parseIndex(html) {
  var out = [];
  html.split(/<tr/).slice(1).forEach(function (row) {
    var tds = [];
    var td = /<td[^>]*>([\s\S]*?)<\/td>/g;
    var t;
    while ((t = td.exec(row))) tds.push(t[1]);
    if (tds.length < 3) return;
    var a = /href="(\/taxes\/shiraberu\/zeimokubetsu\/shohi\/keigenzeiritsu\/pdf\/qa\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/.exec(tds[2]);
    if (!a) return;
    var heading = /<(b|strong)>([\s\S]*?)<\/\1>/.exec(a[2]);
    var title = text(heading ? heading[2] : "");
    var question = text(heading ? a[2].slice(heading.index + heading[0].length) : a[2]).replace(/（PDF\/[^）]*）\s*$/, "");
    out.push({
      no: text(tds[1]).replace(/^問\s*/, "").replace(/\s+/g, "").replace(/[－―ー−]/g, "-"),
      category: romanize(text(tds[0]).replace(/\s+/g, "")),
      title: title,
      question: question,
      path: a[1],
    });
  });
  return out;
}

// 分類の先頭のローマ数字（「II」「Ⅱ」が混在）を「Ⅱ 」の形にそろえる
var ROMAN = { I: "Ⅰ", II: "Ⅱ", III: "Ⅲ", IV: "Ⅳ", V: "Ⅴ", VI: "Ⅵ", VII: "Ⅶ", VIII: "Ⅷ", IX: "Ⅸ", X: "Ⅹ" };
function romanize(cat) {
  return cat.replace(/^([IVX]+|[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ])\s*/, function (m, r) {
    return (ROMAN[r] || r) + " ";
  });
}

function pdfText(file) {
  var res = childProcess.spawnSync("pdftotext", ["-enc", "UTF-8", file, "-"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (res.status !== 0) return null;
  return res.stdout;
}

function parseAnswer(raw) {
  // 日本語の改行は詰め、空行は区切りとして残す
  var t = raw.replace(/\f/g, "\n").replace(/\r/g, "");
  var i = t.indexOf("【答】");
  var revised = ((/【((?:令和|平成)[^【】]{1,20}(?:改訂|追加)[^【】]{0,10})】/.exec(t) || [])[1] || "").replace(/\s+/g, "");
  if (i < 0) return { answer: "", revised: revised };
  var ans = t
    .slice(i + 3)
    .split(/\n/)
    .map(function (l) {
      return l.trim();
    })
    .filter(function (l) {
      return !/^[-－\s\d]+$/.test(l); // ページ番号
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return { answer: clip(ans, ANSWER_LEN), revised: revised };
}

/* ---------- 生成 ---------- */

var indexHtml = readHtml(QA_INDEX);
if (!indexHtml) {
  console.error("Q&A目次のHTMLがありません。先に fetch-invoice.js を実行してください。");
  process.exit(1);
}
var meta = {};
try {
  meta = JSON.parse(fs.readFileSync(path.join(dir, "_fetch.json"), "utf8"));
} catch (e) {
  meta = {};
}

var missing = [];
var overview = (meta.overview || []).map(function (p) {
  var o = parseTaxAnswer(p);
  if (!o) missing.push(p);
  return o;
}).filter(Boolean);

var qa = [];
var noAnswer = [];
parseIndex(indexHtml).forEach(function (q) {
  var file = fileFor(q.path);
  if (!fs.existsSync(file)) {
    missing.push(q.path);
    return;
  }
  var raw = pdfText(file);
  var parsed = raw ? parseAnswer(raw) : { answer: "", revised: "" };
  if (!parsed.answer) noAnswer.push(q.path);
  qa.push({
    no: q.no,
    title: q.title,
    category: q.category,
    question: q.question,
    summary: parsed.answer,
    revised: parsed.revised,
    url: BASE + q.path,
  });
});

var fetchedAt = (meta.fetchedAt || new Date().toISOString()).slice(0, 10);

var src =
  "/*\n" +
  " * インボイス制度の概要と「インボイス制度に関するQ&A」（自動生成）\n" +
  " *\n" +
  " *   出典：国税庁ホームページ（タックスアンサー、インボイス制度特設サイト）\n" +
  " *   取得日：" + fetchedAt + "\n" +
  " *   生成：node scripts/fetch-invoice.js <dir> && node scripts/build-invoice.js <dir>\n" +
  " *\n" +
  " * OVERVIEW : 概要として掲載するタックスアンサー（title, url, asOf, sections[{heading, level, paragraphs}]）\n" +
  " * QA       : Q&A の各問（no, title, category, question, summary=【答】の冒頭" + ANSWER_LEN + "字程度, revised, url）\n" +
  " *\n" +
  " * 手で編集せず、スクリプトで再生成すること。\n" +
  " */\n" +
  "(function (root) {\n" +
  '  "use strict";\n\n' +
  "  var FETCHED_AT = " + JSON.stringify(fetchedAt) + ";\n\n" +
  '  var QA_INDEX = "' + BASE + QA_INDEX + '";\n\n' +
  "  var OVERVIEW = " + JSON.stringify(overview, null, 2).replace(/\n/g, "\n  ") + ";\n\n" +
  "  var QA = [\n" +
  qa
    .map(function (a) {
      return "    " + JSON.stringify(a);
    })
    .join(",\n") +
  "\n  ];\n\n" +
  "  var api = { FETCHED_AT: FETCHED_AT, QA_INDEX: QA_INDEX, OVERVIEW: OVERVIEW, QA: QA };\n\n" +
  '  if (typeof module !== "undefined" && module.exports) {\n' +
  "    module.exports = api;\n" +
  "  } else {\n" +
  "    root.INVOICE_DATA = api;\n" +
  "  }\n" +
  '})(typeof self !== "undefined" ? self : this);\n';

fs.writeFileSync(outFile, src);
console.log("生成: " + outFile);
console.log("概要 " + overview.length + " ページ / Q&A " + qa.length + " 問");
if (noAnswer.length) console.log("【答】を取り出せなかったPDF: " + noAnswer.join(", "));
if (missing.length) console.log("未取得: " + missing.join(", "));
