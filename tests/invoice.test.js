const test = require("node:test");
const assert = require("node:assert/strict");
const { FETCHED_AT, OVERVIEW, QA } = require("../js/invoice.js");
const { searchArticles } = require("../js/search.js");

test("取得日が YYYY-MM-DD 形式", () => {
  assert.match(FETCHED_AT, /^\d{4}-\d{2}-\d{2}$/);
});

test("概要はタックスアンサーの本文を持つ", () => {
  assert.ok(OVERVIEW.length >= 4);
  for (const o of OVERVIEW) {
    assert.ok(o.title.startsWith("No."), o.title);
    assert.ok(o.url.startsWith("https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/"), o.url);
    assert.ok(o.sections.length > 0 && o.sections.every((s) => s.paragraphs.length > 0), `${o.title}: 本文がない`);
    for (const s of o.sections) {
      for (const t of s.paragraphs) assert.doesNotMatch(t, /<[a-z/!][^>]*>|&[a-z]+;/i, `${o.title}: HTMLが残っている`);
    }
  }
});

test("Q&Aの全問が必須項目と国税庁のPDFへのURLを持つ", () => {
  assert.ok(QA.length >= 150);
  for (const q of QA) {
    const id = `問${q.no}`;
    assert.match(q.no, /^\d+(-\d+)?$/, `${id}: 番号の形式`);
    assert.ok(q.title && q.category && q.question, `${id}: 必須項目がない`);
    assert.match(q.category, /^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ] /, `${id}: 分類の形式`);
    assert.ok(q.summary && q.summary.length >= 20 && q.summary.length <= 301, `${id}: 答えの長さ`);
    const url = new URL(q.url);
    assert.equal(url.hostname, "www.nta.go.jp");
    assert.ok(url.pathname.endsWith(".pdf"), `${id}: PDFでない`);
  }
  const nos = QA.map((q) => q.no);
  assert.equal(new Set(nos).size, nos.length, "問番号が重複している");
});

test("Q&Aは問番号・問い・答えで検索できる", () => {
  const qa = QA.map((q) => Object.assign({ type: "qa" }, q));
  assert.equal(searchArticles(qa, "問2")[0].no, "2");
  assert.ok(searchArticles(qa, "登録番号").length > 0);
  assert.ok(searchArticles(qa, "", { category: QA[0].category }).every((q) => q.category === QA[0].category));
});
