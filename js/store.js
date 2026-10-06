(function (global) {
  'use strict';

  var KEYS = { items: 'wd_items', settings: 'wd_settings' };

  // 同毫秒内连续创建（例如双击「保存」）也必须得到不同的 id
  var idSeq = 0;
  function nextId() {
    idSeq++;
    return String(Date.now()) + '-' + idSeq;
  }


  var CATEGORIES = [
    { key: 'long_pants', label: '长裤' },
    { key: 'shorts', label: '短裤' },
    { key: 'long_sleeve', label: '长袖' },
    { key: 'short_sleeve', label: '短袖' },
    { key: 'outerwear', label: '外套' },
    { key: 'hoodie', label: '卫衣' },
    { key: 'other', label: '其他' }
  ];

  var SEASONS = [
    { key: 'spring', label: '春' },
    { key: 'summer', label: '夏' },
    { key: 'autumn', label: '秋' },
    { key: 'winter', label: '冬' },
    { key: 'all', label: '四季' }
  ];

  var SORTS = [
    { key: 'added', label: '录入顺序' },
    { key: 'name', label: '名称' },
    { key: 'price', label: '价格从高到低' }
  ];

  var DEFAULT_SETTINGS = { sort: 'added' };

  function keysOf(list) { return list.map(function (x) { return x.key; }); }

  function labelOf(list, key) {
    for (var i = 0; i < list.length; i++) { if (list[i].key === key) return list[i].label; }
    return '';
  }

  function categoryLabel(key) { return labelOf(CATEGORIES, key); }
  function seasonLabel(key) { return labelOf(SEASONS, key); }

  function pad(n) { return String(n).padStart(2, '0'); }

  function toDateStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function todayStr() { return toDateStr(new Date()); }

  function isDateStr(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  function isText(v) { return typeof v === 'string'; }

  function cleanText(v) { return isText(v) ? v.trim() : ''; }

  // 返回 null（留空合法）/ NaN（非法）/ 数字
  function toNonNegNumberOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v !== 'number' && typeof v !== 'string') return NaN;
    var n = typeof v === 'number' ? v : Number(v.trim());
    if (!isFinite(n) || n < 0) return NaN;
    return n;
  }

  function validateItem(input) {
    var errors = [];
    var src = input || {};

    if (!cleanText(src.name)) errors.push('名称不能为空');
    if (keysOf(CATEGORIES).indexOf(src.category) === -1) errors.push('分类无效');

    var price = toNonNegNumberOrNull(src.price);
    if (price !== null && isNaN(price)) errors.push('价格必须是不小于 0 的数字');

    var date = cleanText(src.purchaseDate);
    if (date && !isDateStr(date)) errors.push('购买日期格式应为 YYYY-MM-DD');

    var season = cleanText(src.season);
    if (season && keysOf(SEASONS).indexOf(season) === -1) errors.push('季节无效');

    return { ok: errors.length === 0, errors: errors };
  }

  function toItem(input, opts) {
    var src = input || {};
    var o = opts || {};
    var now = o.now || new Date().toISOString();
    var price = toNonNegNumberOrNull(src.price);

    return {
      id: o.id !== undefined ? o.id : nextId(),
      name: cleanText(src.name),
      category: src.category,
      color: cleanText(src.color),
      brand: cleanText(src.brand),
      size: cleanText(src.size),
      price: isNaN(price) ? null : price,
      purchaseDate: cleanText(src.purchaseDate),
      season: cleanText(src.season),
      note: isText(src.note) ? src.note.trim() : '',
      photo: isText(src.photo) ? src.photo : '',
      favorite: src.favorite === true || src.favorite === 'true' || src.favorite === 'on',
      createdAt: o.createdAt || now,
      updatedAt: now
    };
  }

  function createItem(input, opts) {
    return toItem(input, opts);
  }

  function updateItem(existing, input, opts) {
    var o = opts || {};
    var merged = {};
    var k;
    for (k in existing) { if (Object.prototype.hasOwnProperty.call(existing, k)) merged[k] = existing[k]; }
    for (k in input) { if (Object.prototype.hasOwnProperty.call(input, k)) merged[k] = input[k]; }
    // 表单未改动图片时 input.photo 为 undefined，此时保留原图
    if (input && input.photo === undefined) merged.photo = existing.photo;

    return toItem(merged, {
      id: existing.id,
      createdAt: existing.createdAt,
      now: o.now
    });
  }

  function filterItems(items, opts) {
    var o = opts || {};
    var cat = o.category && o.category !== 'all' ? o.category : '';
    var q = cleanText(o.query).toLowerCase();

    return (items || []).filter(function (it) {
      if (!it) return false;
      if (cat && it.category !== cat) return false;
      if (o.favoritesOnly && it.favorite !== true) return false;
      if (!q) return true;

      var hay = [it.name, it.brand, it.color, it.note].map(function (v) {
        return isText(v) ? v.toLowerCase() : '';
      }).join('\n');

      return hay.indexOf(q) !== -1;
    });
  }

  function sortedItems(items, sort) {
    var arr = (items || []).slice();

    if (sort === 'name') {
      arr.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'zh'); });
    } else if (sort === 'price') {
      arr.sort(function (a, b) {
        var pa = typeof a.price === 'number' && isFinite(a.price) ? a.price : -1;
        var pb = typeof b.price === 'number' && isFinite(b.price) ? b.price : -1;
        if (pa !== pb) return pb - pa;
        return String(a.name).localeCompare(String(b.name), 'zh');
      });
    }

    return arr;
  }

  function stats(items) {
    var list = items || [];
    var out = { total: list.length, favorites: 0, totalValue: 0, pricedCount: 0, byCategory: {} };
    CATEGORIES.forEach(function (c) { out.byCategory[c.key] = 0; });

    list.forEach(function (it) {
      if (!it) return;
      if (it.favorite === true) out.favorites++;
      if (typeof it.price === 'number' && isFinite(it.price)) {
        out.totalValue += it.price;
        out.pricedCount++;
      }
      if (out.byCategory[it.category] === undefined) out.byCategory[it.category] = 0;
      out.byCategory[it.category]++;
    });

    return out;
  }

  function exportJSON(items) {
    return JSON.stringify({
      app: 'wardrobe',
      version: 1,
      exportedAt: new Date().toISOString(),
      items: items || []
    }, null, 2);
  }

  function parseImport(text) {
    var data;
    try { data = JSON.parse(text); }
    catch (e) { return { ok: false, errors: ['JSON 解析失败，文件可能已损坏'], items: [] }; }

    var raw;
    if (Array.isArray(data)) raw = data;
    else if (data && Array.isArray(data.items)) raw = data.items;
    else return { ok: false, errors: ['文件结构不正确：未找到衣物列表'], items: [] };

    var errors = [];
    var items = [];
    var seen = Object.create(null);

    raw.forEach(function (rec, i) {
      var idx = i + 1;
      if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
        errors.push('第 ' + idx + ' 条不是有效记录');
        return;
      }
      var v = validateItem(rec);
      if (!v.ok) {
        errors.push('第 ' + idx + ' 条：' + v.errors.join('、'));
        return;
      }
      var id = cleanText(rec.id);
      if (!id || seen[id]) {
        id = 'imported-' + i + '-' + Math.floor(Math.random() * 1000000);
        var n = 0;
        while (seen[id]) {
          n++;
          id = 'imported-' + i + '-' + Math.floor(Math.random() * 1000000) + '-' + n;
        }
      }
      seen[id] = true;

      items.push(toItem(rec, {
        id: id,
        createdAt: cleanText(rec.createdAt) || undefined,
        now: cleanText(rec.updatedAt) || undefined
      }));
    });

    if (errors.length) return { ok: false, errors: errors, items: [] };
    return { ok: true, errors: [], items: items };
  }

  function mergeItems(existing, incoming) {
    var byId = Object.create(null);
    var order = [];

    (existing || []).forEach(function (it) {
      if (it && it.id && !Object.prototype.hasOwnProperty.call(byId, it.id)) order.push(it.id);
      if (it && it.id) byId[it.id] = it;
    });
    (incoming || []).forEach(function (it) {
      if (it && it.id && !Object.prototype.hasOwnProperty.call(byId, it.id)) order.push(it.id);
      if (it && it.id) byId[it.id] = it;
    });

    return order.map(function (id) { return byId[id]; });
  }

  function createStore(storage) {
    function read(key, fallback) {
      try {
        var raw = storage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (e) {
        return fallback;
      }
    }
    function write(key, value) { storage.setItem(key, JSON.stringify(value)); }

    return {
      getItems: function () {
        var v = read(KEYS.items, []);
        return Array.isArray(v) ? v : [];
      },
      setItems: function (v) { write(KEYS.items, v); },
      getSettings: function () {
        var s = read(KEYS.settings, null);
        var fallback = { sort: DEFAULT_SETTINGS.sort };
        if (!s || typeof s !== 'object' || Array.isArray(s)) return fallback;
        var known = SORTS.some(function (x) { return x.key === s.sort; });
        return { sort: known ? s.sort : DEFAULT_SETTINGS.sort };
      },
      setSettings: function (v) { write(KEYS.settings, v); }
    };
  }

  var api = {
    KEYS: KEYS,
    CATEGORIES: CATEGORIES,
    SEASONS: SEASONS,
    SORTS: SORTS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    categoryLabel: categoryLabel,
    seasonLabel: seasonLabel,
    todayStr: todayStr,
    toDateStr: toDateStr,
    isDateStr: isDateStr,
    cleanText: cleanText,
    toNonNegNumberOrNull: toNonNegNumberOrNull,
    validateItem: validateItem,
    createItem: createItem,
    updateItem: updateItem,
    filterItems: filterItems,
    sortedItems: sortedItems,
    stats: stats,
    exportJSON: exportJSON,
    parseImport: parseImport,
    mergeItems: mergeItems,
    createStore: createStore
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  else { global.Store = api; }
})(typeof window !== 'undefined' ? window : globalThis);
