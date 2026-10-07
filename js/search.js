/*
 * 検索ロジック（ブラウザ・Node 共通）
 */
(function (root) {
  "use strict";

  // 全角英数→半角、カタカナ→ひらがな、小文字化、空白除去
  function normalize(str) {
    if (!str) return "";
    return String(str)
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[ァ-ヶ]/g, function (ch) {
        return String.fromCharCode(ch.charCodeAt(0) - 0x60);
      })
      .replace(/[\s・、。,.\-ー（）()「」]/g, "");
  }

  function splitTerms(query) {
    return String(query || "")
      .normalize("NFKC")
      .split(/\s+/)
      .map(normalize)
      .filter(Boolean);
  }

  // 1語に対する項目のスコア（0 = 一致なし）
  function scoreTerm(item, term) {
    var name = normalize(item.name);
    var kana = normalize(item.kana);
    if (name === term || kana === term) return 100;
    if (name.indexOf(term) === 0 || kana.indexOf(term) === 0) return 80;
    if (name.indexOf(term) >= 0 || kana.indexOf(term) >= 0) return 60;
    var i;
    for (i = 0; i < item.keywords.length; i++) {
      var kw = normalize(item.keywords[i]);
      if (kw === term) return 55;
      if (kw.indexOf(term) >= 0) return 45;
    }
    for (i = 0; i < item.accounts.length; i++) {
      if (normalize(item.accounts[i]).indexOf(term) >= 0) return 35;
    }
    var examples = item.examples || [];
    for (i = 0; i < examples.length; i++) {
      if (normalize(examples[i]).indexOf(term) >= 0) return 25;
    }
    if (normalize(item.desc).indexOf(term) >= 0) return 15;
    if (normalize(item.note).indexOf(term) >= 0) return 10;
    return 0;
  }

  /*
   * items を検索する。
   * options.cat     : 区分コードで絞り込み（省略時は全区分）
   * options.account : 勘定科目で絞り込み
   * 空白区切りの複数語は AND 検索。クエリが空なら絞り込みのみ。
   */
  function search(items, query, options) {
    options = options || {};
    var terms = splitTerms(query);
    var results = [];
    items.forEach(function (item, index) {
      if (options.cat && item.cat !== options.cat) return;
      if (options.account && item.accounts.indexOf(options.account) < 0) return;
      var total = 0;
      for (var i = 0; i < terms.length; i++) {
        var s = scoreTerm(item, terms[i]);
        if (!s) return;
        total += s;
      }
      results.push({ item: item, score: total, index: index });
    });
    results.sort(function (a, b) {
      return b.score - a.score || a.index - b.index;
    });
    return results.map(function (r) {
      return r.item;
    });
  }

  /* ---------- 国税庁の記事 ---------- */

  // 1語に対する記事のスコア（0 = 一致なし）。番号は「No.6201」「6201」どちらでも可
  function scoreArticle(article, term) {
    var no = normalize(article.no);
    var bare = term.replace(/^no/, "");
    if (bare && (no === bare || no === term)) return 100;
    var title = normalize(article.title);
    if (title === term) return 90;
    if (title.indexOf(term) === 0) return 70;
    if (title.indexOf(term) >= 0) return 60;
    if (bare && no.indexOf(bare) === 0) return 40;
    if (normalize(article.category).indexOf(term) >= 0) return 30;
    if (normalize(article.summary).indexOf(term) >= 0) return 15;
    return 0;
  }

  /*
   * 国税庁の記事を検索する（番号・タイトル・分類・要旨）。
   * options.type     : 種別（taxanswer / qa）で絞り込み
   * options.category : 分類で絞り込み
   */
  function searchArticles(articles, query, options) {
    options = options || {};
    var terms = splitTerms(query);
    var results = [];
    articles.forEach(function (article, index) {
      if (options.type && article.type !== options.type) return;
      if (options.category && article.category !== options.category) return;
      var total = 0;
      for (var i = 0; i < terms.length; i++) {
        var s = scoreArticle(article, terms[i]);
        if (!s) return;
        total += s;
      }
      results.push({ item: article, score: total, index: index });
    });
    results.sort(function (a, b) {
      return b.score - a.score || a.index - b.index;
    });
    return results.map(function (r) {
      return r.item;
    });
  }

  var api = { normalize: normalize, search: search, searchArticles: searchArticles };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.TaxSearch = api;
  }
})(typeof self !== "undefined" ? self : this);
