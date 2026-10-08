const test = require("node:test");
const assert = require("node:assert/strict");
const { CATEGORIES, KANI_TYPES, ITEMS } = require("../js/data.js");

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

test("簡易課税の事業区分は第1種〜第6種で、課税・免税の項目には区分か補足がある", () => {
  assert.deepEqual(Object.keys(KANI_TYPES), ["1", "2", "3", "4", "5", "6"]);
  assert.deepEqual(
    Object.values(KANI_TYPES).map((t) => t.rate),
    ["90%", "80%", "70%", "60%", "50%", "40%"]
  );
  for (const item of ITEMS) {
    if (["k10", "k8", "men"].includes(item.cat)) {
      assert.ok((item.kani && item.kani.length) || item.kaniNote, `${item.name}: 簡易課税の区分も補足もない`);
    } else {
      assert.equal(item.kani, undefined, `${item.name}: 非課税・不課税に事業区分がある`);
    }
    for (const [type, text] of item.kani || []) {
      assert.ok(KANI_TYPES[type], `${item.name}: 不正な事業区分 ${type}`);
      assert.ok(typeof text === "string" && text.trim(), `${item.name}: 場面の説明がない`);
    }
  }
  // 第1種から第6種まですべての区分が使われている
  const used = new Set(ITEMS.flatMap((i) => (i.kani || []).map((r) => r[0])));
  assert.deepEqual([...used].sort(), [1, 2, 3, 4, 5, 6]);
});
