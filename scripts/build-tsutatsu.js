#!/usr/bin/env node
/*
 * fetch-tsutatsu.js で保存した国税庁ホームページの通達HTMLから js/tsutatsu.js を生成する。
 *
 *   node scripts/build-tsutatsu.js <保存先ディレクトリ> [出力ファイル=js/tsutatsu.js]
 *
 * HTMLは信頼できないデータとして扱い、正規表現でテキストを抜き出すだけにする。
 * 通達の各項目は「（見出し）」の直後にある番号付きの段落（基本通達は <strong>5－1－1</strong> 形式）として取り出す。
 */
"use strict";

var fs = require("fs");
var path = require("path");

var BASE = "https://www.nta.go.jp";
var KIHON_INDEX = "/law/tsutatsu/kihon/shohi/01.htm";
var KOBETSU_INDEX = "/law/tsutatsu/kobetsu/kansetsu/syouhi.htm";
var SUMMARY_LEN = 200;

var dir = process.argv[2];
var outFile = process.argv[3] || path.join(__dirname, "..", "js", "tsutatsu.js");
if (!dir) {
  console.error("usage: node scripts/build-tsutatsu.js <htmlDir> [outFile]");
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
  copy: "©", reg: "®", bull: "•", ensp: " ", emsp: " ", thinsp: " ",
};

function text(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, function (m, e) {
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
  str = str.trim();
  return str.length <= SUMMARY_LEN ? str : str.slice(0, SUMMARY_LEN) + "…";
}

function mainBody(html) {
  // コメントアウトされた旧版の通達を拾わないよう、先にコメントを除く
  html = html.replace(/<!--(?! InstanceEndEditable)[\s\S]*?-->/g, "");
  var start = html.search(/<h1[\s>]/i);
  if (start < 0) return "";
  var body = html.slice(start);
  var end = body.search(/class="page-top-link"|<!-- InstanceEndEditable -->/);
  return end >= 0 ? body.slice(0, end) : body;
}

// 本文を段落・見出し単位のブロックに分ける。
// 閉じタグ（</p> など）が欠けたページがあるため、開始タグから次の開始タグまでを1ブロックとする。
function blocks(body) {
  var out = [];
  var re = /<(h[1-4]|p|li)(\s[^>]*)?>/gi;
  var marks = [];
  var m;
  while ((m = re.exec(body))) marks.push({ tag: m[1].toLowerCase(), start: m.index, end: re.lastIndex });
  marks.forEach(function (mk, i) {
    var html = body.slice(mk.end, i + 1 < marks.length ? marks[i + 1].start : body.length);
    var t = text(html);
    if (!t) return;
    out.push({
      tag: mk.tag,
      // 番号が <strong>1</strong><strong>－1－1</strong> のように分割されていることがあるので結合する
      html: html.replace(/<\/strong>\s*<strong>/gi, ""),
      text: t,
      // 「１－１<span>本文」のように番号の直後がタグの場合に番号を切り出せるよう、タグを空白にした版
      spaced: text(html.replace(/<[^>]*>/g, " ")),
    });
  });
  return out;
}

var NUM = "[0-9０-９]+(?:の[0-9０-９]+)*(?:[－\\-‐−ー][0-9０-９]+(?:の[0-9０-９]+)*)*";
var STRONG_NUM = new RegExp("^\\s*<strong>\\s*(" + NUM + ")\\s*</strong>");
var LEAD_NUM = new RegExp("^(" + NUM + ")[\\s\\u3000\\u2003]+(\\S[\\s\\S]*)$");
var HEADING = /^[（(]\s*([^（）()]{1,80}?)\s*[）)]$/;
var NOT_HEADING = /^[（(]\s*[0-9０-９注イロハニ]+\s*[）)]$/;

/*
 * 1ページ分のブロックから通達の項目を取り出す。
 * 戻り値: [{ no, title, group, summary }]
 */
function parseItems(list) {
  var items = [];
  var heading = "";
  var group = "";
  var prevHeading = false;
  var current = null;
  list.forEach(function (b) {
    if (b.tag === "h1") return;
    var h = HEADING.exec(b.text);
    if (h && !NOT_HEADING.test(b.text)) {
      heading = h[1].trim();
      prevHeading = true;
      current = null;
      return;
    }
    if (/^h[2-4]$/.test(b.tag)) {
      // 「1 契約書等の記載金額」のように番号付きの見出しは、それ自体を1項目とする
      var hn = LEAD_NUM.exec(b.spaced);
      if (hn) {
        current = { no: hn[1], title: hn[2], group: group, summary: "" };
        items.push(current);
        prevHeading = false;
        return;
      }
      // 「第2条《定義》関係」のような区分見出し
      if (!/^別冊/.test(b.text)) group = b.text;
      prevHeading = false;
      current = null;
      return;
    }
    var no = null;
    var rest = null;
    var s = STRONG_NUM.exec(b.html);
    if (s) {
      no = s[1];
      rest = text(b.html.slice(s[0].length));
    } else if (prevHeading) {
      var l = LEAD_NUM.exec(b.spaced);
      if (l) {
        no = l[1];
        rest = l[2];
      }
    }
    prevHeading = false;
    if (no && /^[（(][^）)]*削除[）)]$/.test(rest.trim())) {
      // 「（令4課消2-4により削除）」のように削除済みの番号は収録しない
      current = null;
      return;
    }
    if (no) {
      current = { no: no, title: heading, group: group, summary: rest };
      items.push(current);
      return;
    }
    if (current && current.summary.length < SUMMARY_LEN) current.summary = (current.summary + " " + b.text).trim();
  });
  items.forEach(function (it) {
    it.summary = clip(it.summary);
    if (!it.title) it.title = it.summary.slice(0, 40);
  });
  return items;
}

/* ---------- 基本通達 ---------- */

function parseKihonIndex(html) {
  var pages = [];
  var chapter = "";
  var section = "";
  var re = /<p[^>]*>([\s\S]*?)<\/p>/g;
  var m;
  while ((m = re.exec(mainBody(html)))) {
    var t = text(m[1]);
    var a = /href="(\/law\/tsutatsu\/kihon\/shohi\/\d+\/[\d\/]*\d+\.htm)"/.exec(m[1]);
    if (/^第[0-9０-９]+章/.test(t)) {
      chapter = t.replace(/^(第[0-9０-９]+章)\s*/, "$1 ");
      section = "";
      // 節のない章（第18章〜第21章）は章の行にリンクがある
      if (a) pages.push({ path: a[1], chapter: chapter, section: "" });
    } else if (/^第[0-9０-９]+節/.test(t)) {
      section = t.replace(/^(第[0-9０-９]+節)\s*/, "$1 ");
      if (a) pages.push({ path: a[1], chapter: chapter, section: section });
    } else if (/^第[0-9０-９]+款/.test(t) && a) {
      pages.push({ path: a[1], chapter: chapter, section: section + " " + t.replace(/^(第[0-9０-９]+款)\s*/, "$1 ") });
    }
  }
  return pages;
}

/* ---------- 取扱通達 ---------- */

function parseKobetsuIndex(html) {
  var out = [];
  html.split(/<tr/).slice(1).forEach(function (row) {
    var tds = [];
    var td = /<td[^>]*>([\s\S]*?)<\/td>/g;
    var t;
    while ((t = td.exec(row))) tds.push(t[1]);
    if (tds.length < 2) return;
    var a = /href="(\/law\/[^"#]+\.htm)"[^>]*>([\s\S]*?)<\/a>/.exec(tds[1]);
    if (!a) return;
    var title = text(a[2]);
    var compact = title.replace(/\s/g, "");
    if (!/消費税/.test(compact) || !/取扱/.test(compact) || /様式|の廃止について/.test(compact)) return;
    var rowText = text(tds.join(" "));
    var abolished = /((?:令和|平成)[0-9０-９元]+年[0-9０-９]+月[0-9０-９]+日)\s*廃止/.exec(rowText);
    out.push({
      path: a[1],
      title: title,
      name: title.replace(/（法令解釈通達）$/, "").replace(/の(制定|全部改正)について$/, ""),
      date: text(tds[0]).replace(/【[^】]*】/g, "").trim(),
      status: abolished ? abolished[1] + "廃止" : "",
    });
  });
  return out;
}

/* ---------- 生成 ---------- */

var kihonIndex = read(KIHON_INDEX);
var kobetsuIndex = read(KOBETSU_INDEX);
if (!kihonIndex || !kobetsuIndex) {
  console.error("目次ページのHTMLがありません。先に fetch-tsutatsu.js を実行してください。");
  process.exit(1);
}

var meta = {};
try {
  meta = JSON.parse(fs.readFileSync(path.join(dir, "_fetch.json"), "utf8"));
} catch (e) {
  meta = {};
}

var missing = [];
var noItems = [];
var articles = [];

parseKihonIndex(kihonIndex).forEach(function (pg) {
  var html = read(pg.path);
  if (!html) {
    missing.push(pg.path);
    return;
  }
  var items = parseItems(blocks(mainBody(html)));
  if (!items.length) noItems.push(pg.path);
  items.forEach(function (it) {
    articles.push({
      type: "kihon",
      no: it.no,
      title: it.title,
      category: pg.chapter,
      section: pg.section,
      url: BASE + pg.path,
      summary: it.summary,
    });
  });
});

var circulars = parseKobetsuIndex(kobetsuIndex);
circulars.forEach(function (c) {
  var html = read(c.path);
  if (!html) {
    missing.push(c.path);
    return;
  }
  var body = mainBody(html);
  var items = parseItems(blocks(body));
  if (!items.length) {
    // 本文がPDFのみなど、項目に分けられないものは通達全体を1件として収録する
    var first = blocks(body).filter(function (b) {
      return b.tag === "p" && b.text.length > 20;
    })[0];
    items = [{ no: "全文", title: c.name, group: "", summary: clip(first ? first.text : c.title) }];
    noItems.push(c.path);
  }
  items.forEach(function (it) {
    var a = {
      type: "toriatsukai",
      no: it.no,
      title: it.title,
      category: c.name,
      section: it.group,
      url: BASE + c.path,
      summary: it.summary,
    };
    if (c.status) a.status = c.status;
    articles.push(a);
  });
});

var fetchedAt = (meta.fetchedAt || new Date().toISOString()).slice(0, 10);

var src =
  "/*\n" +
  " * 国税庁ホームページに掲載されている消費税関係の通達（自動生成）\n" +
  " *\n" +
  " *   出典：国税庁ホームページ（https://www.nta.go.jp/）\n" +
  " *   取得日：" + fetchedAt + "\n" +
  " *   生成：node scripts/fetch-tsutatsu.js <dir> && node scripts/build-tsutatsu.js <dir>\n" +
  " *\n" +
  " * 各項目:\n" +
  " *   type     : kihon（消費税法基本通達）/ toriatsukai（取扱通達）\n" +
  " *   no       : 通達番号（例：5－1－1）。項目に分けられない通達は「全文」\n" +
  " *   title    : 見出し\n" +
  " *   category : 基本通達は章、取扱通達は通達名\n" +
  " *   section  : 基本通達は節・款、取扱通達は条文ごとの区分（ない場合は空）\n" +
  " *   url      : 国税庁の原文URL（その項目が載っているページ）\n" +
  " *   summary  : 本文の冒頭" + SUMMARY_LEN + "字程度\n" +
  " *   status   : 廃止された通達の場合に「令和○年○月○日廃止」\n" +
  " *\n" +
  " * 手で編集せず、スクリプトで再生成すること。\n" +
  " */\n" +
  "(function (root) {\n" +
  '  "use strict";\n\n' +
  "  var FETCHED_AT = " + JSON.stringify(fetchedAt) + ";\n\n" +
  "  var TYPES = {\n" +
  '    kihon: { label: "基本通達", index: "' + BASE + KIHON_INDEX + '" },\n' +
  '    toriatsukai: { label: "取扱通達", index: "' + BASE + KOBETSU_INDEX + '" },\n' +
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
  "    root.TSUTATSU_DATA = api;\n" +
  "  }\n" +
  '})(typeof self !== "undefined" ? self : this);\n';

fs.writeFileSync(outFile, src);

var counts = {};
articles.forEach(function (a) {
  counts[a.type] = (counts[a.type] || 0) + 1;
});
console.log("生成: " + outFile);
console.log("基本通達 " + (counts.kihon || 0) + " 項目 / 取扱通達 " + (counts.toriatsukai || 0) + " 項目（" + circulars.length + " 通達）");
if (noItems.length) console.log("項目に分けられなかったページ: " + noItems.join(", "));
if (missing.length) console.log("HTML未取得: " + missing.join(", "));
