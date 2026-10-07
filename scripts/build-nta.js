#!/usr/bin/env node
/*
 * fetch-nta.js で保存した国税庁ホームページのHTMLから js/nta.js を生成する。
 *
 *   node scripts/build-nta.js <保存先ディレクトリ> [出力ファイル=js/nta.js]
 *
 * HTMLは信頼できないデータとして扱い、正規表現でテキストを抜き出すだけにする
 * （スクリプトの実行やDOMへの挿入はしない）。
 */
"use strict";

var fs = require("fs");
var path = require("path");

var BASE = "https://www.nta.go.jp";
var TA_INDEX = "/taxes/shiraberu/taxanswer/code/index.htm";
var QA_INDEX = "/law/shitsugi/shohi/01.htm";
var SUMMARY_LEN = 200;

var dir = process.argv[2];
var outFile = process.argv[3] || path.join(__dirname, "..", "js", "nta.js");
if (!dir) {
  console.error("usage: node scripts/build-nta.js <htmlDir> [outFile]");
  process.exit(2);
}

function fileFor(urlPath) {
  return path.join(dir, urlPath.replace(/^\//, "").replace(/\//g, "_"));
}

function read(urlPath) {
  var file = fileFor(urlPath);
  if (!fs.existsSync(file)) return null;
  var buf = fs.readFileSync(file);
  var head = buf.slice(0, 2048).toString("latin1");
  var enc = /charset=["']?shift_jis/i.test(head) ? "shift_jis" : "utf-8";
  return new TextDecoder(enc).decode(buf);
}

var ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  minus: "−", times: "×", divide: "÷", yen: "¥", middot: "・", rarr: "→", larr: "←", uarr: "↑",
  darr: "↓", harr: "↔", rArr: "⇒", hArr: "⇔", laquo: "«", raquo: "»", lsquo: "‘", rsquo: "’",
  ldquo: "“", rdquo: "”", deg: "°", plusmn: "±", sup2: "²", sup3: "³", frac12: "½", sect: "§",
  copy: "©", reg: "®", bull: "•", circ: "ˆ", tilde: "˜", ensp: " ", emsp: " ", thinsp: " ",
};

function text(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/h\d>|<\/tr>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, e) {
      if (e[0] === "#") {
        var code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(code) ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e] || ENTITIES[e.toLowerCase()] || m;
    })
    .replace(/[\s　]+/g, " ")
    .trim();
}

function clip(str) {
  str = str.replace(/^[\s　]+/, "");
  if (str.length <= SUMMARY_LEN) return str;
  return str.slice(0, SUMMARY_LEN) + "…";
}

// 本文（h1 の後からページ先頭へのリンクまで）
function mainBody(html) {
  var start = html.search(/<h1[\s>]/i);
  if (start < 0) return "";
  var body = html.slice(start);
  var end = body.search(/class="page-top-link"|<!-- InstanceEndEditable -->/);
  return end >= 0 ? body.slice(0, end) : body;
}

function sectionAfter(body, headingRe, stopRe) {
  var m = headingRe.exec(body);
  if (!m) return null;
  var rest = body.slice(m.index + m[0].length);
  var stop = rest.search(stopRe);
  return stop >= 0 ? rest.slice(0, stop) : rest;
}

/* ---------- タックスアンサー ---------- */

function parseTaxAnswerIndex(html) {
  var re = /<h2[^>]*>([\s\S]*?)<\/h2>|<h3[^>]*>([\s\S]*?)<\/h3>|<a href="(\/taxes\/shiraberu\/taxanswer\/shohi\/(\d+)\.htm)">([\s\S]*?)<\/a>/g;
  var h2 = "";
  var h3 = "";
  var seen = {};
  var out = [];
  var m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      h2 = text(m[1]);
      h3 = "";
    } else if (m[2] !== undefined) {
      h3 = text(m[2]);
    } else {
      var no = m[4];
      if (seen[no]) continue;
      seen[no] = true;
      var title = text(m[5]).replace(new RegExp("^" + no + "\\s*"), "");
      var category = h2 === "消費税" ? h3 || h2 : [h2, h3].filter(Boolean).join("／");
      out.push({ path: m[3], no: no, title: title, category: category });
    }
  }
  return out;
}

function taxAnswerSummary(html) {
  var body = mainBody(html);
  var stop = /<h2[^>]*>\s*(根拠法令等|関連コード|お問い合わせ先)/;
  var part = sectionAfter(body, /<h2[^>]*>\s*概要\s*<\/h2>/, stop);
  if (part === null) {
    part = body.replace(/^<h1[\s\S]*?<\/h1>/i, "");
    var s = part.search(stop);
    if (s >= 0) part = part.slice(0, s);
    part = part.replace(/<h2[^>]*>\s*対象税目\s*<\/h2>\s*<p>[\s\S]*?<\/p>/, "");
  }
  return clip(text(part).replace(/^\[[^\]]*現在[^\]]*\]\s*/, ""));
}

function taxAnswerAsOf(html) {
  var m = /\[([^\]]*現在[^\]]*)\]/.exec(mainBody(html));
  return m ? text(m[1]) : "";
}

/* ---------- 質疑応答事例 ---------- */

function parseQaIndex(html) {
  var re = /<a id="(a-\d+)"[^>]*><\/a>\s*（([\s\S]*?)）\s*<\/p>|<a href="(\/law\/shitsugi\/shohi\/(\d+)\/(\d+)\.htm)">([\s\S]*?)<\/a>/g;
  var category = "";
  var seen = {};
  var out = [];
  var m;
  while ((m = re.exec(html))) {
    if (m[1] !== undefined) {
      category = text(m[2]);
    } else {
      if (seen[m[3]]) continue;
      seen[m[3]] = true;
      out.push({ path: m[3], no: m[4] + "-" + m[5], title: text(m[6]), category: category });
    }
  }
  return out;
}

function qaSummary(html) {
  var body = mainBody(html);
  var part = sectionAfter(body, /<h2[^>]*>\s*【回答要旨】\s*<\/h2>/, /<h2[^>]*>/);
  if (part === null) part = body.replace(/^<h1[\s\S]*?<\/h1>/i, "");
  return clip(text(part));
}

function qaAsOf(html) {
  var m = /(令和|平成)(\d+|元)年(\d+)月(\d+)日現在の法令・通達等/.exec(text(mainBody(html)));
  return m ? m[0].replace("の法令・通達等", "") : "";
}

/* ---------- 生成 ---------- */

var taIndexHtml = read(TA_INDEX);
var qaIndexHtml = read(QA_INDEX);
if (!taIndexHtml || !qaIndexHtml) {
  console.error("索引ページのHTMLがありません。先に fetch-nta.js を実行してください。");
  process.exit(1);
}

var meta = {};
try {
  meta = JSON.parse(fs.readFileSync(path.join(dir, "_fetch.json"), "utf8"));
} catch (e) {
  meta = {};
}

var missing = [];
var articles = [];

parseTaxAnswerIndex(taIndexHtml).forEach(function (a) {
  var html = read(a.path);
  if (!html) {
    missing.push(a.path);
    return;
  }
  articles.push({
    type: "taxanswer",
    no: a.no,
    title: a.title,
    category: a.category,
    url: BASE + a.path,
    summary: taxAnswerSummary(html),
    asOf: taxAnswerAsOf(html),
  });
});

parseQaIndex(qaIndexHtml).forEach(function (a) {
  var html = read(a.path);
  if (!html) {
    missing.push(a.path);
    return;
  }
  articles.push({
    type: "qa",
    no: a.no,
    title: a.title,
    category: a.category,
    url: BASE + a.path,
    summary: qaSummary(html),
    asOf: qaAsOf(html),
  });
});

var fetchedAt = (meta.fetchedAt || new Date().toISOString()).slice(0, 10);

var src =
  "/*\n" +
  " * 国税庁ホームページに掲載されている消費税関係の記事一覧（自動生成）\n" +
  " *\n" +
  " *   出典：国税庁ホームページ（https://www.nta.go.jp/）\n" +
  " *   取得日：" + fetchedAt + "\n" +
  " *   生成：node scripts/fetch-nta.js <dir> && node scripts/build-nta.js <dir>\n" +
  " *\n" +
  " * 各記事:\n" +
  " *   type     : taxanswer（タックスアンサー）/ qa（質疑応答事例）\n" +
  " *   no       : タックスアンサーは No.、質疑応答事例は URL の目次番号-事例番号\n" +
  " *   title    : タイトル\n" +
  " *   category : 分類（国税庁の目次の見出し）\n" +
  " *   url      : 国税庁の原文URL\n" +
  " *   summary  : 要旨（本文の概要・【回答要旨】の冒頭" + SUMMARY_LEN + "字程度）\n" +
  " *   asOf     : 記事に記載された基準日（「令和○年○月○日現在」）\n" +
  " *\n" +
  " * 手で編集せず、スクリプトで再生成すること。\n" +
  " */\n" +
  "(function (root) {\n" +
  '  "use strict";\n\n' +
  "  var FETCHED_AT = " + JSON.stringify(fetchedAt) + ";\n\n" +
  "  var TYPES = {\n" +
  '    taxanswer: { label: "タックスアンサー", index: "' + BASE + TA_INDEX + '" },\n' +
  '    qa: { label: "質疑応答事例", index: "' + BASE + QA_INDEX + '" },\n' +
  "  };\n\n" +
  "  var ARTICLES = [\n" +
  articles
    .map(function (a) {
      return "    " + JSON.stringify(a);
    })
    .join(",\n") +
  "\n  ];\n\n" +
  "  var api = { FETCHED_AT: FETCHED_AT, TYPES: TYPES, ARTICLES: ARTICLES };\n\n" +
  '  if (typeof module !== "undefined" && module.exports) {\n' +
  "    module.exports = api;\n" +
  "  } else {\n" +
  "    root.NTA_ARTICLES = ARTICLES;\n" +
  "    root.NTA_DATA = api;\n" +
  "  }\n" +
  '})(typeof self !== "undefined" ? self : this);\n';

fs.writeFileSync(outFile, src);

var counts = {};
articles.forEach(function (a) {
  counts[a.type] = (counts[a.type] || 0) + 1;
});
console.log("生成: " + outFile);
console.log("タックスアンサー " + (counts.taxanswer || 0) + " 件 / 質疑応答事例 " + (counts.qa || 0) + " 件");
var empty = articles.filter(function (a) {
  return !a.summary;
});
if (empty.length) console.log("要旨が空: " + empty.map((a) => a.url).join(", "));
if (missing.length) console.log("HTML未取得: " + missing.join(", "));
