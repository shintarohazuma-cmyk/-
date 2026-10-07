const test = require("node:test");
const assert = require("node:assert/strict");
const { FETCHED_AT, TYPES, ARTICLES } = require("../js/nta.js");
const { ITEMS } = require("../js/data.js");
const { searchArticles } = require("../js/search.js");

test("取得日が YYYY-MM-DD 形式", () => {
  assert.match(FETCHED_AT, /^\d{4}-\d{2}-\d{2}$/);
});

test("両方の種別の記事がある", () => {
  for (const type of Object.keys(TYPES)) {
    assert.ok(ARTICLES.some((a) => a.type === type), `${type} の記事がない`);
  }
  assert.ok(ARTICLES.filter((a) => a.type === "taxanswer").length >= 100);
  assert.ok(ARTICLES.filter((a) => a.type === "qa").length >= 200);
});

test("すべての記事が必須項目を持ち、URL が国税庁のもの", () => {
  for (const a of ARTICLES) {
    const id = `${a.type} ${a.no}`;
    assert.ok(TYPES[a.type], `${id}: 不正な種別`);
    assert.ok(a.no, `${id}: no がない`);
    assert.ok(a.title, `${id}: title がない`);
    assert.ok(a.category, `${id}: category がない`);
    assert.ok(a.summary && a.summary.length >= 20, `${id}: summary が短い`);
    assert.ok(a.summary.length <= 201, `${id}: summary が長すぎる`);
    const url = new URL(a.url);
    assert.equal(url.protocol, "https:", `${id}: https でない`);
    assert.equal(url.hostname, "www.nta.go.jp", `${id}: 国税庁のURLでない`);
    if (a.type === "taxanswer") {
      assert.match(a.no, /^\d{4}$/, `${id}: 番号の形式`);
      assert.ok(url.pathname.startsWith("/taxes/shiraberu/taxanswer/shohi/"), `${id}: パス`);
    } else {
      assert.match(a.no, /^\d{2}-\d{2}$/, `${id}: 番号の形式`);
      assert.ok(url.pathname.startsWith("/law/shitsugi/shohi/"), `${id}: パス`);
    }
    // HTML の断片が残っていない
    for (const key of ["title", "category", "summary"]) {
      assert.doesNotMatch(a[key], /<[a-z/!][^>]*>|&[a-z]+;|&#\d+;/i, `${id}: ${key} にHTMLが残っている`);
    }
  }
});

test("記事の URL・番号が重複していない", () => {
  const urls = ARTICLES.map((a) => a.url);
  assert.equal(new Set(urls).size, urls.length);
  const ids = ARTICLES.map((a) => `${a.type}:${a.no}`);
  assert.equal(new Set(ids).size, ids.length);
});

test("辞書項目の refs はすべて nta.js に存在する記事", () => {
  const known = new Set(ARTICLES.map((a) => a.url));
  let count = 0;
  for (const item of ITEMS) {
    if (item.refs === undefined) continue;
    assert.ok(Array.isArray(item.refs) && item.refs.length, `${item.name}: refs が空`);
    assert.equal(new Set(item.refs).size, item.refs.length, `${item.name}: refs が重複`);
    for (const url of item.refs) {
      assert.ok(known.has(url), `${item.name}: 未収録のURL ${url}`);
      count++;
    }
  }
  assert.ok(count > 0, "refs が1件もない");
});

test("記事は番号・タイトル・要旨で検索できる", () => {
  const [byNo] = searchArticles(ARTICLES, "No.6201");
  assert.equal(byNo.no, "6201");
  assert.equal(searchArticles(ARTICLES, "６２０１")[0].no, "6201");
  const byTitle = searchArticles(ARTICLES, "簡易課税");
  assert.ok(byTitle.length > 0);
  assert.ok(byTitle[0].title.includes("簡易課税"));
  const qa = searchArticles(ARTICLES, "", { type: "qa" });
  assert.ok(qa.length > 0 && qa.every((a) => a.type === "qa"));
  const cat = ARTICLES[0].category;
  assert.ok(searchArticles(ARTICLES, "", { category: cat }).every((a) => a.category === cat));
  assert.deepEqual(searchArticles(ARTICLES, ""), ARTICLES);
});
