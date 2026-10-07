const test = require("node:test");
const assert = require("node:assert/strict");
const { CATEGORIES, ITEMS } = require("../js/data.js");

test("すべての項目が必須項目と有効な区分を持つ", () => {
  for (const item of ITEMS) {
    assert.ok(item.name, "name がない項目がある");
    assert.ok(item.kana, `${item.name}: kana がない`);
    assert.ok(CATEGORIES[item.cat], `${item.name}: 不正な区分 ${item.cat}`);
    assert.ok(Array.isArray(item.accounts) && item.accounts.length, `${item.name}: accounts がない`);
    assert.ok(Array.isArray(item.keywords), `${item.name}: keywords が配列でない`);
    assert.ok(item.desc, `${item.name}: desc がない`);
  }
});

test("項目名が重複していない", () => {
  const names = ITEMS.map((i) => i.name);
  assert.equal(new Set(names).size, names.length);
});

test("すべての区分に項目がある", () => {
  for (const code of Object.keys(CATEGORIES)) {
    assert.ok(ITEMS.some((i) => i.cat === code), `${code} の項目がない`);
  }
});

test("すべての項目が具体例を持つ", () => {
  for (const item of ITEMS) {
    assert.ok(Array.isArray(item.examples) && item.examples.length, `${item.name}: examples がない`);
    for (const ex of item.examples) assert.ok(typeof ex === "string" && ex.trim(), `${item.name}: 空の具体例`);
    assert.equal(new Set(item.examples).size, item.examples.length, `${item.name}: 具体例が重複`);
  }
});
