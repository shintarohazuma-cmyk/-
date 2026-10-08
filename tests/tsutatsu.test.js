const test = require("node:test");
const assert = require("node:assert/strict");
const { FETCHED_AT, TYPES, ARTICLES } = require("../js/tsutatsu.js");
const { searchArticles } = require("../js/search.js");
const { ITEMS } = require("../js/data.js");

test("取得日が YYYY-MM-DD 形式", () => {
  assert.match(FETCHED_AT, /^\d{4}-\d{2}-\d{2}$/);
});

test("基本通達と取扱通達の両方を収録している", () => {
  assert.deepEqual(Object.keys(TYPES).sort(), ["kihon", "toriatsukai"]);
  assert.ok(ARTICLES.filter((a) => a.type === "kihon").length >= 600);
  assert.ok(ARTICLES.filter((a) => a.type === "toriatsukai").length >= 100);
});

test("すべての項目が必須項目を持ち、URL が国税庁の通達ページ", () => {
  for (const a of ARTICLES) {
    const id = `${a.type} ${a.no} ${a.url}`;
    assert.ok(TYPES[a.type], `${id}: 不正な種別`);
    assert.ok(a.no && a.title && a.category, `${id}: 必須項目がない`);
    assert.equal(typeof a.section, "string", `${id}: section が文字列でない`);
    assert.ok(a.summary && a.summary.length >= 10 && a.summary.length <= 201, `${id}: summary の長さ`);
    const url = new URL(a.url);
    assert.equal(url.protocol, "https:");
    assert.equal(url.hostname, "www.nta.go.jp");
    assert.ok(url.pathname.startsWith("/law/tsutatsu/"), `${id}: 通達のパスでない`);
    if (a.type === "kihon") {
      assert.match(a.no, /^\d+(の\d+)?(－\d+(の\d+)?)+$/, `${id}: 基本通達の番号の形式`);
      assert.match(a.category, /^第\d+章 /, `${id}: 章`);
    }
    if (a.status !== undefined) assert.match(a.status, /廃止$/, `${id}: status`);
    for (const key of ["title", "category", "section", "summary"]) {
      assert.doesNotMatch(a[key], /<[a-z/!][^>]*>|&[a-z]+;|&#\d+;/i, `${id}: ${key} にHTMLが残っている`);
    }
  }
});

test("同じページで番号が重複していない", () => {
  const keys = ARTICLES.map((a) => `${a.url}#${a.no}`);
  assert.equal(new Set(keys).size, keys.length);
});

test("通達番号・見出し・本文で検索できる", () => {
  const [top] = searchArticles(ARTICLES, "5-1-1");
  assert.equal(top.no, "5－1－1");
  assert.equal(top.title, "事業としての意義");
  const kihon = searchArticles(ARTICLES, "住宅の貸付け", { type: "kihon" });
  assert.ok(kihon.length > 0 && kihon.every((a) => a.type === "kihon"));
  const tori = searchArticles(ARTICLES, "一体資産", { type: "toriatsukai" });
  assert.ok(tori.length > 0 && tori.every((a) => a.type === "toriatsukai"));
});

test("辞書項目の tsutatsu はすべて収録済みの基本通達の番号", () => {
  const kihon = new Set(ARTICLES.filter((a) => a.type === "kihon").map((a) => a.no));
  let count = 0;
  for (const item of ITEMS) {
    if (item.tsutatsu === undefined) continue;
    assert.ok(Array.isArray(item.tsutatsu) && item.tsutatsu.length, `${item.name}: tsutatsu が空`);
    assert.equal(new Set(item.tsutatsu).size, item.tsutatsu.length, `${item.name}: tsutatsu が重複`);
    for (const no of item.tsutatsu) {
      assert.ok(kihon.has(no), `${item.name}: 未収録の通達番号 ${no}`);
      count++;
    }
  }
  assert.ok(count > 100, "tsutatsu の参照が少なすぎる");
});
