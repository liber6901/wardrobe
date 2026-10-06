(function (global) {
  'use strict';

  var Store = global.Store;
  var MAX_EDGE = 640;
  var JPEG_QUALITY = 0.7;

  var state = {
    items: [],
    category: 'all',
    query: '',
    favoritesOnly: false,
    sort: 'added',
    editingId: null,
    pendingPhoto: ''
  };

  var el = {};
  var store = null;

  function $(id) { return document.getElementById(id); }

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function visibleItems() {
    var filtered = Store.filterItems(state.items, {
      category: state.category,
      query: state.query,
      favoritesOnly: state.favoritesOnly
    });
    return Store.sortedItems(filtered, state.sort);
  }

  function renderStats() {
    var s = Store.stats(state.items);
    var cur = state.category === 'all' ? s.total : (s.byCategory[state.category] || 0);
    el.statsBar.textContent = '总 ' + s.total + ' 件 · 收藏 ' + s.favorites + ' 件 · 总价值 ¥' +
      s.totalValue.toFixed(0) + ' · 当前分类 ' + cur + ' 件';
  }

  function renderTabs() {
    var s = Store.stats(state.items);
    var html = '<button type="button" class="tab' + (state.category === 'all' ? ' active' : '') +
      '" data-cat="all">全部 <span class="badge">' + s.total + '</span></button>';
    Store.CATEGORIES.forEach(function (c) {
      html += '<button type="button" class="tab' + (state.category === c.key ? ' active' : '') +
        '" data-cat="' + c.key + '">' + c.label +
        ' <span class="badge">' + (s.byCategory[c.key] || 0) + '</span></button>';
    });
    el.catTabs.innerHTML = html;
  }

  function renderSortOptions() {
    el.sortSelect.innerHTML = Store.SORTS.map(function (s) {
      return '<option value="' + s.key + '"' + (state.sort === s.key ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');
  }

  function cardHTML(it) {
    var photo = it.photo
      ? '<img class="thumb" src="' + escapeHTML(it.photo) + '" alt="">'
      : '<div class="thumb thumb-placeholder">' + escapeHTML(Store.categoryLabel(it.category) || '衣') + '</div>';

    var bits = [it.color, it.brand, it.size].filter(Boolean).join(' · ');
    var price = typeof it.price === 'number' ? '¥' + it.price : '';
    var season = Store.seasonLabel(it.season);
    var meta = [price, season, it.purchaseDate].filter(Boolean).join(' · ');

    return '<article class="card" data-id="' + escapeHTML(it.id) + '">' +
      photo +
      '<div class="card-body">' +
        '<h3 class="card-name">' + escapeHTML(it.name) + '</h3>' +
        '<span class="cat-badge">' + escapeHTML(Store.categoryLabel(it.category)) + '</span>' +
        (bits ? '<p class="card-meta">' + escapeHTML(bits) + '</p>' : '') +
        (meta ? '<p class="card-meta">' + escapeHTML(meta) + '</p>' : '') +
        (it.note ? '<p class="card-note">' + escapeHTML(it.note) + '</p>' : '') +
      '</div>' +
      '<div class="card-actions">' +
        '<button type="button" class="star' + (it.favorite ? ' on' : '') + '" data-act="fav" title="收藏">' +
          (it.favorite ? '★' : '☆') + '</button>' +
        '<button type="button" class="btn btn-sm" data-act="edit">编辑</button>' +
        '<button type="button" class="btn btn-sm btn-danger" data-act="del">删除</button>' +
      '</div>' +
    '</article>';
  }

  function renderList() {
    var items = visibleItems();
    el.list.innerHTML = items.map(cardHTML).join('');
    el.emptyState.hidden = state.items.length > 0;
    if (state.items.length > 0 && items.length === 0) {
      el.emptyState.hidden = false;
      el.emptyState.textContent = '没有符合条件的衣物';
    } else if (state.items.length === 0) {
      el.emptyState.textContent = '还没有记录，点右上角「＋ 添加衣物」';
    }
  }

  function render() {
    renderStats();
    renderTabs();
    renderList();
  }

  function persist() {
    try {
      store.setItems(state.items);
      return true;
    } catch (e) {
      alert('本地存储已满或不可用，请先「导出备份 JSON」。本次改动未保存。');
      return false;
    }
  }

  function toggleFavorite(id) {
    var prev = state.items;
    state.items = state.items.map(function (it) {
      if (it.id !== id) return it;
      return Store.updateItem(it, { favorite: !it.favorite });
    });
    if (!persist()) { state.items = prev; return; }
    render();
  }

  function confirmDelete(it) {
    if (!global.confirm('确定删除「' + it.name + '」？此操作不可撤销。')) return;
    var prev = state.items;
    state.items = state.items.filter(function (x) { return x.id !== it.id; });
    if (!persist()) { state.items = prev; return; }
    render();
  }

  function fillSelect(select, list, current, placeholder) {
    var html = '';
    if (placeholder) html += '<option value="">' + placeholder + '</option>';
    html += list.map(function (x) {
      return '<option value="' + x.key + '"' + (current === x.key ? ' selected' : '') + '>' + x.label + '</option>';
    }).join('');
    select.innerHTML = html;
  }

  function showErrors(errors) {
    if (!errors || !errors.length) {
      el.formErrors.hidden = true;
      el.formErrors.innerHTML = '';
      return;
    }
    el.formErrors.hidden = false;
    el.formErrors.innerHTML = errors.map(function (e) { return '<li>' + escapeHTML(e) + '</li>'; }).join('');
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('读取图片失败')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('图片解码失败')); };
        img.onload = function () {
          var w = img.naturalWidth;
          var h = img.naturalHeight;
          if (!w || !h) { reject(new Error('图片尺寸无效')); return; }

          var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
          var cw = Math.max(1, Math.round(w * scale));
          var ch = Math.max(1, Math.round(h * scale));

          var canvas = document.createElement('canvas');
          canvas.width = cw;
          canvas.height = ch;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);

          try { resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY)); }
          catch (err) { reject(new Error('图片处理失败')); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function setPhotoPreview(dataUrl) {
    state.pendingPhoto = dataUrl || '';
    if (!state.pendingPhoto) {
      el.photoPreview.innerHTML = '';
      return;
    }
    el.photoPreview.innerHTML = '<img src="' + escapeHTML(state.pendingPhoto) + '" alt="预览">' +
      '<button type="button" class="btn btn-sm" id="removePhoto">移除图片</button>';
  }

  function openForm(item) {
    state.editingId = item ? item.id : null;
    state.pendingPhoto = item ? (item.photo || '') : '';
    el.modalTitle.textContent = item ? '编辑衣物' : '添加衣物';
    showErrors([]);

    var f = el.itemForm;
    f.reset();
    f.name.value = item ? item.name : '';
    f.category.value = item ? item.category : 'other';
    f.color.value = item ? item.color : '';
    f.brand.value = item ? item.brand : '';
    f.size.value = item ? item.size : '';
    f.price.value = item && typeof item.price === 'number' ? String(item.price) : '';
    f.purchaseDate.value = item ? item.purchaseDate : '';
    f.season.value = item ? item.season : '';
    f.note.value = item ? item.note : '';
    f.favorite.checked = item ? item.favorite === true : false;

    setPhotoPreview(state.pendingPhoto);
    el.modal.hidden = false;
  }

  function closeForm() {
    el.modal.hidden = true;
    state.editingId = null;
    state.pendingPhoto = '';
    showErrors([]);
  }

  function readForm() {
    var f = el.itemForm;
    return {
      name: f.name.value,
      category: f.category.value,
      color: f.color.value,
      brand: f.brand.value,
      size: f.size.value,
      price: f.price.value,
      purchaseDate: f.purchaseDate.value,
      season: f.season.value,
      note: f.note.value,
      favorite: f.favorite.checked,
      photo: state.pendingPhoto
    };
  }

  // 保存时若本地存储已满，询问用户是否去掉图片保存（对应设计文档第 8 节）
  function saveWithFallback(input) {
    var prev = state.items;

    function build(withPhoto) {
      var data = {};
      for (var k in input) { if (Object.prototype.hasOwnProperty.call(input, k)) data[k] = input[k]; }
      if (!withPhoto) data.photo = '';

      if (state.editingId) {
        return state.items.map(function (it) {
          return it.id === state.editingId ? Store.updateItem(it, data) : it;
        });
      }
      var arr = state.items.slice();
      arr.push(Store.createItem(data));
      return arr;
    }

    var next;
    try {
      next = build(true);
      store.setItems(next);
      state.items = next;
      return true;
    } catch (err) {
      var drop = global.confirm(
        '本地存储已满，带图片无法保存。\n\n' +
        '确定 = 去掉图片保存此条（建议随后「导出备份 JSON」）\n' +
        '取消 = 什么都不做，表单保持打开'
      );
      if (!drop) return false;

      var without;
      try {
        without = build(false);
        store.setItems(without);
        state.items = without;
        state.pendingPhoto = '';
        return true;
      } catch (err2) {
        state.items = prev;
        alert('仍然无法保存，请先「导出备份 JSON」清理空间。');
        return false;
      }
    }
  }

  function submitForm(e) {
    e.preventDefault();
    var input = readForm();
    var v = Store.validateItem(input);
    if (!v.ok) { showErrors(v.errors); return; }
    if (!saveWithFallback(input)) return;

    closeForm();
    render();
  }

  function exportBackup() {
    if (!state.items.length) { alert('暂无数据可导出'); return; }
    var text = Store.exportJSON(state.items);
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'wardrobe-backup-' + Store.todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onerror = function () { alert('读取文件失败'); };
    reader.onload = function () {
      var r = Store.parseImport(String(reader.result));
      if (!r.ok) {
        alert('导入失败，原有数据未做任何修改：\n\n' + r.errors.slice(0, 10).join('\n'));
        return;
      }
      var merge = global.confirm(
        '解析成功，共 ' + r.items.length + ' 条。\n\n' +
        '确定 = 合并（按 id 去重，新的覆盖旧的）\n' +
        '取消 = 覆盖（丢弃现有全部数据）'
      );
      var next = merge ? Store.mergeItems(state.items, r.items) : r.items;
      var prev = state.items;
      state.items = next;
      if (!persist()) { state.items = prev; return; }
      render();
      alert('导入完成，当前共 ' + state.items.length + ' 条。');
    };
    reader.readAsText(file);
  }

  function bindData() {
    el.exportBtn.addEventListener('click', exportBackup);

    el.importBtn.addEventListener('click', function () { el.importFile.click(); });

    el.importFile.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) importBackup(file);
      el.importFile.value = '';
    });
  }

  function bindForm() {
    el.addBtn.addEventListener('click', function () { openForm(null); });
    el.cancelBtn.addEventListener('click', closeForm);
    el.itemForm.addEventListener('submit', submitForm);
    el.modal.addEventListener('click', function (e) { if (e.target === el.modal) closeForm(); });
    el.photoPreview.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'removePhoto') setPhotoPreview('');
    });

    el.photoInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      compressImage(file).then(function (dataUrl) {
        setPhotoPreview(dataUrl);
      }).catch(function (err) {
        alert(err.message + '，请换一张图片。其余内容仍可保存。');
      }).then(function () {
        el.photoInput.value = '';
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !el.modal.hidden) closeForm();
    });
  }

  function bindToolbar() {
    el.catTabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      state.category = btn.getAttribute('data-cat');
      render();
    });

    el.searchInput.addEventListener('input', function (e) {
      state.query = e.target.value;
      renderList();
    });

    el.favOnly.addEventListener('change', function (e) {
      state.favoritesOnly = e.target.checked;
      renderList();
    });

    el.sortSelect.addEventListener('change', function (e) {
      state.sort = e.target.value;
      try { store.setSettings({ sort: state.sort }); } catch (err) { /* 存储不可用不阻断界面 */ }
      renderList();
    });
  }

  function bindList() {
    el.list.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var card = e.target.closest('.card');
      if (!card) return;
      var id = card.getAttribute('data-id');
      var it = state.items.filter(function (x) { return x.id === id; })[0];
      if (!it) return;

      var act = btn.getAttribute('data-act');
      if (act === 'fav') toggleFavorite(id);
      else if (act === 'del') confirmDelete(it);
      else if (act === 'edit') openForm(it);
    });
  }

  function init() {
    el.statsBar = $('statsBar');
    el.catTabs = $('catTabs');
    el.list = $('list');
    el.emptyState = $('emptyState');
    el.searchInput = $('searchInput');
    el.favOnly = $('favOnly');
    el.sortSelect = $('sortSelect');
    el.addBtn = $('addBtn');
    el.modal = $('modal');
    el.modalTitle = $('modalTitle');
    el.itemForm = $('itemForm');
    el.formErrors = $('formErrors');
    el.photoPreview = $('photoPreview');
    el.cancelBtn = $('cancelBtn');
    el.photoInput = $('photoInput');
    el.exportBtn = $('exportBtn');
    el.importBtn = $('importBtn');
    el.importFile = $('importFile');

    store = Store.createStore(global.localStorage);
    var settings = store.getSettings();
    state.sort = settings.sort;
    state.items = store.getItems();

    renderSortOptions();
    fillSelect(el.itemForm.category, Store.CATEGORIES, 'other', '');
    fillSelect(el.itemForm.season, Store.SEASONS, '', '未记录');

    bindToolbar();
    bindList();
    bindForm();
    bindData();
    render();
  }

  global.App = { init: init, _state: state };

  if (typeof document !== 'undefined' && document.getElementById) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
