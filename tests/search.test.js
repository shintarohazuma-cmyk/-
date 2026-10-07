const test = require("node:test");
const assert = require("node:assert/strict");
const { ITEMS } = require("../js/data.js");
const { normalize, search } = require("../js/search.js");

test("normalize はカタカナ・全角を揃える", () => {
  assert.equal(normalize("ＥＴＣ"), "etc");
  assert.equal(normalize("テイクアウト"), normalize("ていくあうと"));
});

test("ひらがな・カタカナどちらでも検索できる", () => {
  const a = search(ITEMS, "ちゅうしゃじょう").map((i) => i.name);
  const b = search(ITEMS, "チュウシャジョウ").map((i) => i.name);
  assert.ok(a.length > 0);
  assert.deepEqual(a, b);
});

test("代表的な語が期待した区分で最上位に来る", () => {
  const cases = [
    ["収入印紙", "hi"],
    ["給与", "fu"],
    ["輸出", "men"],
    ["テイクアウト", "k8"],
    ["酒類", "k10"],
  ];
  for (const [q, cat] of cases) {
    const [top] = search(ITEMS, q);
    assert.ok(top, `${q}: ヒットなし`);
    assert.equal(top.cat, cat, `${q}: ${top.name} (${top.cat})`);
  }
});

test("複数語は AND 検索", () => {
  const results = search(ITEMS, "住宅 礼金");
  assert.ok(results.length > 0);
  assert.equal(results[0].cat, "hi");
});

test("区分・勘定科目で絞り込める", () => {
  assert.ok(search(ITEMS, "", { cat: "men" }).every((i) => i.cat === "men"));
  const byAccount = search(ITEMS, "", { account: "法定福利費" });
  assert.ok(byAccount.length > 0);
  assert.ok(byAccount.every((i) => i.accounts.includes("法定福利費")));
});

test("空クエリは全件を元の順序で返す", () => {
  assert.deepEqual(search(ITEMS, ""), ITEMS);
});
