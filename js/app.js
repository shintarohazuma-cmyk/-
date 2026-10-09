(function () {
  "use strict";

  var CATEGORIES = TAX_DATA.CATEGORIES;
  var KANI_TYPES = TAX_DATA.KANI_TYPES;
  var ITEMS = TAX_DATA.ITEMS;
  var CAT_ORDER = ["k10", "k8", "hi", "fu", "men"];
  var NTA = typeof NTA_DATA !== "undefined" ? NTA_DATA : { FETCHED_AT: "", TYPES: {}, ARTICLES: [] };
  var TSUTATSU = typeof TSUTATSU_DATA !== "undefined" ? TSUTATSU_DATA : { FETCHED_AT: "", TYPES: {}, ARTICLES: [] };
  var INVOICE = typeof INVOICE_DATA !== "undefined" ? INVOICE_DATA : { FETCHED_AT: "", OVERVIEW: [], QA: [] };
  var ARTICLE_BY_URL = {};
  NTA.ARTICLES.forEach(function (a) {
    ARTICLE_BY_URL[a.url] = a;
  });

  var state = { q: "", cat: "", account: "" };

  function $(id) {
    return document.getElementById(id);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "text") node.textContent = attrs[key];
      else if (key === "class") node.className = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function badge(cat) {
    return el("span", { class: "badge badge-" + cat, text: CATEGORIES[cat].short });
  }

  /* ---------- 辞書 ---------- */

  function buildFilters() {
    var chips = $("cat-filters");
    var all = [{ code: "", label: "すべて" }].concat(
      CAT_ORDER.map(function (code) {
        return { code: code, label: CATEGORIES[code].short };
      })
    );
    all.forEach(function (c) {
      var btn = el("button", {
        class: "chip" + (c.code ? " chip-" + c.code : "") + (c.code === state.cat ? " is-active" : ""),
        type: "button",
        "data-cat": c.code,
        "aria-pressed": String(c.code === state.cat),
        text: c.label,
      });
      btn.addEventListener("click", function () {
        state.cat = c.code;
        Array.prototype.forEach.call(chips.children, function (b) {
          var active = b.getAttribute("data-cat") === state.cat;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-pressed", String(active));
        });
        render();
      });
      chips.appendChild(btn);
    });

    var accounts = {};
    ITEMS.forEach(function (item) {
      item.accounts.forEach(function (a) {
        accounts[a] = true;
      });
    });
    var select = $("account-filter");
    Object.keys(accounts)
      .sort(function (a, b) {
        return a.localeCompare(b, "ja");
      })
      .forEach(function (a) {
        select.appendChild(el("option", { value: a, text: a }));
      });
    select.addEventListener("change", function () {
      state.account = select.value;
      render();
    });
  }

  function articleLabel(a) {
    return (a.type === "taxanswer" ? "No." + a.no + " " : "") + a.title;
  }

  function externalLink(url, text, cls) {
    return el("a", { href: url, target: "_blank", rel: "noopener", class: cls || "", text: text });
  }

  function renderRefs(item) {
    if (!item.refs || !item.refs.length) return null;
    var list = el("ul", { class: "refs" });
    item.refs.forEach(function (url) {
      var a = ARTICLE_BY_URL[url];
      var label = a ? NTA.TYPES[a.type].label + "　" + articleLabel(a) : url;
      list.appendChild(el("li", {}, [externalLink(url, label)]));
    });
    return el("div", {}, [el("p", { class: "refs-title", text: "国税庁の関連記事" }), list]);
  }

  function renderExamples(item) {
    if (!item.examples || !item.examples.length) return null;
    var list = el("ul", { class: "examples" });
    item.examples.forEach(function (ex) {
      list.appendChild(el("li", { text: ex }));
    });
    return el("div", { class: "examples-block" }, [el("p", { class: "examples-title", text: "具体例" }), list]);
  }

  var KIHON_BY_NO = {};
  TSUTATSU.ARTICLES.forEach(function (a) {
    if (a.type === "kihon") KIHON_BY_NO[a.no] = a;
  });

  function renderTsutatsuRefs(item) {
    if (!item.tsutatsu || !item.tsutatsu.length) return null;
    var list = el("ul", { class: "refs" });
    item.tsutatsu.forEach(function (no) {
      var a = KIHON_BY_NO[no];
      if (!a) return;
      list.appendChild(el("li", {}, [externalLink(a.url, "基本通達　" + a.no + " " + a.title)]));
    });
    if (!list.children.length) return null;
    return el("div", {}, [el("p", { class: "refs-title", text: "関連する通達" }), list]);
  }

  // 簡易課税の事業区分（この取引を売上げとして行った場合の区分とみなし仕入率）
  function renderKani(item) {
    var children = [el("p", { class: "examples-title", text: "簡易課税の事業区分" })];
    if (item.kani && item.kani.length) {
      var list = el("ul", { class: "kani" });
      item.kani
        .map(function (row, i) {
          return { type: row[0], text: row[1], i: i };
        })
        .sort(function (a, b) {
          return a.type - b.type || a.i - b.i;
        })
        .forEach(function (row) {
          var t = KANI_TYPES[row.type];
          list.appendChild(
            el("li", { class: "kani-row" }, [
              el("span", { class: "kani-type kani-" + row.type }, [
                el("span", { text: t.label.replace("事業", "") + " " + t.rate }),
                el("span", { class: "kani-kind", text: t.kind }),
              ]),
              el("span", { class: "kani-text", text: row.text }),
            ])
          );
        });
      children.push(list);
      children.push(
        el("p", { class: "kani-note" }, [
          externalLink("https://www.nta.go.jp/taxes/shiraberu/taxanswer/shohi/6509.htm", "事業区分の考え方（タックスアンサー No.6509）"),
        ])
      );
    }
    var note = item.kaniNote;
    if (!note && (item.cat === "hi" || item.cat === "fu")) {
      note = CATEGORIES[item.cat].short + "の取引は課税売上げに当たらないため、簡易課税の事業区分の対象外です（みなし仕入率の計算に含めません）。";
    }
    if (note) children.push(el("p", { class: "kani-note", text: note }));
    if (children.length === 1) return null;
    return el("div", { class: "examples-block" }, children);
  }

  function renderItem(item) {
    var body = el("div", { class: "item-body" }, [
      el("p", { class: "item-desc", text: item.desc }),
      renderExamples(item),
      renderKani(item),
      item.note ? el("p", { class: "item-note", text: item.note }) : null,
      el("dl", { class: "item-meta" }, [
        el("dt", { text: "勘定科目" }),
        el("dd", { text: item.accounts.join("、") }),
        item.keywords.length ? el("dt", { text: "関連語" }) : null,
        item.keywords.length ? el("dd", { text: item.keywords.join("、") }) : null,
      ]),
      renderTsutatsuRefs(item),
      renderRefs(item),
    ]);
    var summary = el("summary", { class: "item-head" }, [
      badge(item.cat),
      el("span", { class: "item-name", text: item.name }),
    ]);
    return el("li", { class: "item item-" + item.cat }, [el("details", {}, [summary, body])]);
  }

  function render() {
    var results = TaxSearch.search(ITEMS, state.q, { cat: state.cat, account: state.account });
    var list = $("results");
    list.textContent = "";
    results.forEach(function (item) {
      list.appendChild(renderItem(item));
    });
    if (!results.length) {
      list.appendChild(
        el("li", { class: "empty" }, [
          el("p", { text: "該当する項目が見つかりませんでした。" }),
          el("p", { text: "別の言い方や勘定科目名で検索するか、「判定フロー」タブで判定してみてください。" }),
        ])
      );
    }
    // 1件だけヒットしたら開いておく
    if (results.length === 1) list.querySelector("details").open = true;
    $("count").textContent = results.length + " 件";
  }

  /* ---------- 判定フロー ---------- */

  var FLOW = {
    start: {
      q: "その取引は国内で行われるものですか？",
      hint: "物品は引渡し時の所在地、サービスは提供地で判定します。海外での宿泊・仕入などは国外取引です。",
      yes: "business",
      no: "r_fu_abroad",
    },
    business: {
      q: "事業者が「事業として」行うものですか？",
      hint: "雇用契約に基づく給与の支払い、個人の生活用資産の売却などは事業に当たりません。",
      yes: "consideration",
      no: "r_fu_business",
    },
    consideration: {
      q: "反対給付としての「対価」を受け取る（支払う）取引ですか？",
      hint: "寄附金・祝金・補助金・配当・保険金・損害賠償金・罰金・税金などは対価に当たりません。",
      yes: "transfer",
      no: "deemed",
    },
    deemed: {
      q: "個人事業者の家事消費、または法人が役員へ資産を贈与するものですか？",
      hint: "これらは無償でも「みなし譲渡」として課税対象になります。",
      yes: "exempt",
      no: "r_fu_consideration",
    },
    transfer: {
      q: "資産の譲渡・貸付け、または役務（サービス）の提供ですか？",
      hint: "借入れ・預金の移動・立替金・減価償却などの会計処理は該当しません。",
      yes: "exempt",
      no: "r_fu_transfer",
    },
    exempt: {
      q: "非課税取引に当たりますか？",
      hint: "土地の譲渡・貸付け／有価証券／利子・保険料／切手・印紙・商品券／行政手数料／保険診療／介護・福祉／助産／火葬・埋葬／身体障害者用物品／学校の授業料等／教科書／住宅の家賃（1か月以上）",
      yes: "r_hi",
      no: "export",
    },
    export: {
      q: "輸出や国際取引として免税になるものですか？",
      hint: "商品の輸出／国際線・国際貨物輸送／国際通信・国際郵便／非居住者への役務提供（国内で便益を受けるものを除く）など",
      yes: "r_men",
      no: "reduced",
    },
    reduced: {
      q: "軽減税率の対象（飲食料品または新聞の定期購読）ですか？",
      hint: "酒類・外食（店内飲食）・ケータリングを除く飲食料品の譲渡、週2回以上発行される新聞の定期購読が対象です。",
      yes: "r_k8",
      no: "r_k10",
    },
    r_fu_abroad: { result: "fu", reason: "国外取引のため、国内の消費税の課税対象外です。" },
    r_fu_business: { result: "fu", reason: "事業として行う取引ではないため、課税対象外です。" },
    r_fu_consideration: { result: "fu", reason: "対価を得て行う取引ではないため、課税対象外です。" },
    r_fu_transfer: { result: "fu", reason: "資産の譲渡等に当たらないため、課税対象外です。" },
    r_hi: { result: "hi", reason: "課税対象の取引ですが、非課税取引に該当します。" },
    r_men: { result: "men", reason: "課税取引ですが、輸出免税等により税率0%となります。" },
    r_k8: { result: "k8", reason: "軽減税率（8%）が適用される課税取引です。" },
    r_k10: { result: "k10", reason: "標準税率（10%）が適用される課税取引です。" },
  };

  var flowHistory = [];

  function renderFlow() {
    var root = $("flow");
    root.textContent = "";

    var trail = el("ol", { class: "flow-trail" });
    flowHistory.forEach(function (step) {
      trail.appendChild(
        el("li", {}, [
          el("span", { text: FLOW[step.node].q }),
          el("strong", { text: step.answer ? "はい" : "いいえ" }),
        ])
      );
    });
    if (flowHistory.length) root.appendChild(trail);

    var current = flowHistory.length ? FLOW[flowHistory[flowHistory.length - 1].next] : FLOW.start;
    var card;
    if (current.result) {
      var cat = CATEGORIES[current.result];
      card = el("div", { class: "flow-card flow-result result-" + current.result }, [
        el("p", { class: "flow-step", text: "判定結果" }),
        el("h2", {}, [badge(current.result), el("span", { text: " " + cat.label })]),
        el("p", { text: current.reason }),
        el("p", { class: "flow-hint", text: cat.desc }),
      ]);
      var showBtn = el("button", { class: "btn", type: "button", text: "この区分の項目を辞書で見る" });
      showBtn.addEventListener("click", function () {
        state.cat = current.result;
        state.q = "";
        $("q").value = "";
        Array.prototype.forEach.call($("cat-filters").children, function (b) {
          var active = b.getAttribute("data-cat") === state.cat;
          b.classList.toggle("is-active", active);
          b.setAttribute("aria-pressed", String(active));
        });
        render();
        showTab("dict");
      });
      card.appendChild(el("div", { class: "flow-actions" }, [showBtn]));
    } else {
      var nodeKey = flowHistory.length ? flowHistory[flowHistory.length - 1].next : "start";
      var yes = el("button", { class: "btn btn-yes", type: "button", text: "はい" });
      var no = el("button", { class: "btn btn-no", type: "button", text: "いいえ" });
      yes.addEventListener("click", function () {
        flowHistory.push({ node: nodeKey, answer: true, next: current.yes });
        renderFlow();
      });
      no.addEventListener("click", function () {
        flowHistory.push({ node: nodeKey, answer: false, next: current.no });
        renderFlow();
      });
      card = el("div", { class: "flow-card" }, [
        el("p", { class: "flow-step", text: "質問 " + (flowHistory.length + 1) }),
        el("h2", { text: current.q }),
        el("p", { class: "flow-hint", text: current.hint }),
        el("div", { class: "flow-actions" }, [yes, no]),
      ]);
    }
    root.appendChild(card);

    if (flowHistory.length) {
      var back = el("button", { class: "btn btn-ghost", type: "button", text: "1つ戻る" });
      back.addEventListener("click", function () {
        flowHistory.pop();
        renderFlow();
      });
      var reset = el("button", { class: "btn btn-ghost", type: "button", text: "最初から" });
      reset.addEventListener("click", function () {
        flowHistory = [];
        renderFlow();
      });
      root.appendChild(el("div", { class: "flow-nav" }, [back, reset]));
    }
  }

  /* ---------- 区分の解説 ---------- */

  function renderGuide() {
    var root = $("guide-cats");
    CAT_ORDER.forEach(function (code) {
      var cat = CATEGORIES[code];
      var count = ITEMS.filter(function (i) {
        return i.cat === code;
      }).length;
      root.appendChild(
        el("div", { class: "guide-cat guide-" + code }, [
          el("h2", {}, [badge(code), el("span", { text: " " + cat.label })]),
          el("p", { text: cat.desc }),
          el("p", { class: "guide-meta", text: "税率：" + cat.rate + "　／　辞書の収録数：" + count + " 件" }),
        ])
      );
    });
  }

  /* ---------- 国税庁の記事・通達（共通の一覧） ---------- */

  var PAGE_SIZE = 50;

  /*
   * 国税庁の記事・通達の一覧タブを作る。
   * prefix : 要素IDの接頭辞（例：nta → #nta-q, #nta-results …）
   * data   : { TYPES, ARTICLES }
   * opts.noLabel(a) : 見出し行に出す番号・分類の文字列
   * opts.extra(a)   : 詳細に追加する要素の配列（任意）
   * opts.before(a)  : 詳細の本文の前に置く要素の配列（任意）
   * opts.hideTypes  : 種別が1つだけのとき種別ボタンを出さない
   */
  function setupDocTab(prefix, data, opts) {
    var st = { q: "", type: "", category: "", limit: PAGE_SIZE };
    var chips = $(prefix + "-type-filters");
    var select = $(prefix + "-category-filter");

    [{ code: "", label: "すべて" }]
      .concat(
        Object.keys(data.TYPES).map(function (code) {
          return { code: code, label: data.TYPES[code].label };
        })
      )
      .forEach(function (t) {
        var btn = el("button", {
          class: "chip" + (t.code === st.type ? " is-active" : ""),
          type: "button",
          "data-type": t.code,
          "aria-pressed": String(t.code === st.type),
          text: t.label,
        });
        btn.addEventListener("click", function () {
          st.type = t.code;
          Array.prototype.forEach.call(chips.children, function (b) {
            var active = b.getAttribute("data-type") === st.type;
            b.classList.toggle("is-active", active);
            b.setAttribute("aria-pressed", String(active));
          });
          fillCategories();
          renderList(true);
        });
        chips.appendChild(btn);
      });
    if (opts.hideTypes) chips.hidden = true;
    select.addEventListener("change", function (e) {
      st.category = e.target.value;
      renderList(true);
    });
    $(prefix + "-q").addEventListener("input", function (e) {
      st.q = e.target.value;
      renderList(true);
    });

    // 種別に応じて分類の選択肢を作り直す（国税庁の目次順）
    function fillCategories() {
      var seen = {};
      var cats = [];
      data.ARTICLES.forEach(function (a) {
        if (st.type && a.type !== st.type) return;
        var key = a.type + "|" + a.category;
        if (seen[key]) return;
        seen[key] = true;
        cats.push({ key: key, type: a.type, category: a.category });
      });
      select.textContent = "";
      select.appendChild(el("option", { value: "", text: "すべての分類" }));
      var found = false;
      cats.forEach(function (c) {
        if (c.key === st.category) found = true;
        var label = st.type ? c.category : data.TYPES[c.type].label + "：" + c.category;
        select.appendChild(el("option", { value: c.key, text: label }));
      });
      if (!found) st.category = "";
      select.value = st.category;
    }

    function renderOne(a) {
      var summary = el("summary", { class: "item-head article-head" }, [
        el("span", { class: "badge article-type", text: data.TYPES[a.type].label }),
        el("span", { class: "article-title" }, [
          el("span", { class: "article-no", text: opts.noLabel(a) }),
          el("span", { class: "item-name", text: a.title }),
        ]),
      ]);
      var body = el(
        "div",
        { class: "item-body" },
        (opts.before ? opts.before(a) : []).concat([
          el("p", { class: "article-summary", text: a.summary }),
          el("p", {}, [externalLink(a.url, "国税庁の原文を開く ↗", "article-link")]),
        ]).concat(opts.extra ? opts.extra(a) : [])
      );
      return el("li", { class: "item article" + (a.status ? " is-abolished" : "") }, [el("details", {}, [summary, body])]);
    }

    function renderList(resetLimit) {
      if (resetLimit) st.limit = PAGE_SIZE;
      // 分類の値は「種別|分類」（種別をまたいで同名の分類があるため）
      var sep = st.category.indexOf("|");
      var results = TaxSearch.searchArticles(data.ARTICLES, st.q, {
        type: sep >= 0 ? st.category.slice(0, sep) : st.type,
        category: sep >= 0 ? st.category.slice(sep + 1) : "",
      });
      var list = $(prefix + "-results");
      list.textContent = "";
      results.slice(0, st.limit).forEach(function (a) {
        list.appendChild(renderOne(a));
      });
      if (!results.length) {
        list.appendChild(el("li", { class: "empty" }, [el("p", { text: "該当する項目が見つかりませんでした。" })]));
      }
      if (results.length > st.limit) {
        var more = el("button", {
          class: "btn btn-ghost more",
          type: "button",
          text: "さらに表示（残り " + (results.length - st.limit) + " 件）",
        });
        more.addEventListener("click", function () {
          st.limit += PAGE_SIZE;
          renderList(false);
        });
        list.appendChild(el("li", { class: "empty" }, [more]));
      }
      if (results.length === 1) list.querySelector("details").open = true;
      $(prefix + "-count").textContent = results.length + " 件";
    }

    $(prefix + "-fetched").textContent = data.FETCHED_AT;
    fillCategories();
    renderList(true);
  }

  /* ---------- インボイス制度 ---------- */

  function renderInvoiceOverview() {
    var root = $("inv-overview");
    INVOICE.OVERVIEW.forEach(function (o, i) {
      var body = el("div", { class: "item-body" });
      o.sections.forEach(function (sec) {
        if (sec.heading) body.appendChild(el(sec.level === 2 ? "h3" : "h4", { class: "inv-heading", text: sec.heading }));
        sec.paragraphs.forEach(function (t) {
          body.appendChild(el("p", { class: "inv-paragraph", text: t }));
        });
      });
      body.appendChild(el("p", {}, [externalLink(o.url, "国税庁の原文を開く ↗", "article-link")]));
      if (o.asOf) body.appendChild(el("p", { class: "article-asof", text: "記事の基準：" + o.asOf }));
      var details = el("details", {}, [
        el("summary", { class: "item-head" }, [el("span", { class: "item-name", text: o.title })]),
        body,
      ]);
      if (i === 0) details.open = true;
      root.appendChild(el("div", { class: "item article inv-card" }, [details]));
    });
  }

  /* ---------- タブ ---------- */

  function showTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) {
      var active = t.getAttribute("data-tab") === name;
      t.classList.toggle("is-active", active);
      t.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      p.hidden = p.id !== "tab-" + name;
    });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () {
      showTab(t.getAttribute("data-tab"));
    });
  });

  $("q").addEventListener("input", function (e) {
    state.q = e.target.value;
    render();
  });

  $("item-total").textContent = "収録 " + ITEMS.length + " 項目";

  buildFilters();
  render();
  setupDocTab("tsu", TSUTATSU, {
    noLabel: function (a) {
      return a.no + "　" + a.category + (a.section ? "　" + a.section : "");
    },
    extra: function (a) {
      return a.status ? [el("p", { class: "article-status", text: "この通達は" + a.status + "されています。" })] : [];
    },
  });
  renderInvoiceOverview();
  setupDocTab(
    "inv",
    {
      FETCHED_AT: INVOICE.FETCHED_AT,
      TYPES: { qa: { label: "インボイスQ&A" } },
      ARTICLES: INVOICE.QA.map(function (q) {
        return {
          type: "qa",
          no: q.no,
          title: q.title,
          category: q.category,
          question: q.question,
          summary: q.summary,
          revised: q.revised,
          url: q.url,
        };
      }),
    },
    {
      hideTypes: true,
      noLabel: function (a) {
        return "問" + a.no + "　" + a.category;
      },
      before: function (a) {
        return [el("p", { class: "inv-question" }, [el("strong", { text: "問　" }), document.createTextNode(a.question)])];
      },
      extra: function (a) {
        return a.revised ? [el("p", { class: "article-asof", text: a.revised })] : [];
      },
    }
  );
  setupDocTab("nta", NTA, {
    noLabel: function (a) {
      return (a.type === "taxanswer" ? "No." : "事例 ") + a.no + "　" + a.category;
    },
    extra: function (a) {
      return a.asOf ? [el("p", { class: "article-asof", text: "記事の基準：" + a.asOf })] : [];
    },
  });
  renderFlow();
  renderGuide();
})();
