/* ============================================================
   editor.js — 锻造模式（隐蔽编辑）
   进入方式见 app.js：双击团徽 / Ctrl+Shift+E / #forge / 页脚印记三连点
   ============================================================ */
(function () {
  'use strict';

  const H = window.Heraldry;
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  const FIELDS = [
    { k: 'name',     label: '姓名',     type: 'text', ph: '如：亚德里安' },
    { k: 'alias',    label: '称号',     type: 'text', ph: '如：铁誓' },
    { k: 'fullName', label: '全名',     type: 'text', ph: '如：亚德里安 · 冯 · 灰隼' },
    { k: 'tagline',  label: '一句话',   type: 'textarea', ph: '卡片上显示的预览简介，两行内' },
    { k: 'oath',     label: '誓言',     type: 'textarea', ph: '详情页誓言碑上的文字' },
    { k: 'joined',   label: '入团',     type: 'text', ph: '如：圣历 1187 年 · 创团' },
    { k: 'weapon',   label: '兵器',     type: 'text', ph: '如：双手大剑「长夜」' },
    { k: 'armor',    label: '甲胄',     type: 'text', ph: '如：鎏金鸢盾铠' },
    { k: 'deeds',    label: '战绩',     type: 'textarea', ph: '一行一条，回车换行' },
    { k: 'quote',    label: '箴言',     type: 'text', ph: '详情页底部那句' }
  ];

  let draft = null;
  let draftIsNew = true;
  let saving = false;

  /* ---------- 角色与按钮文案 ---------- */
  // local = 离线/未登录（自己机器上随便改），admin = 管理者，author = 投稿人
  function mode() {
    const S = window.Sync;
    if (!S || !S.isEnabled() || !S.signedIn()) return 'local';
    return S.isAdmin() ? 'admin' : 'author';
  }
  function saveLabel(isNew, m) {
    if (mode() !== 'author') return '刻上名册';
    return (isNew || !m.id || m.__pending) ? '递交审核' : '保存修改';
  }

  /* ---------- 公共入口 ---------- */
  function init() {
    const bar = $('#editBar');
    bar.addEventListener('click', function (e) {
      const b = e.target.closest('[data-ed]');
      if (!b) return;
      const act = b.dataset.ed;
      if (act === 'guild')  openGuildForm();
      if (act === 'export') exportJson();
      if (act === 'import') $('#importFile').click();
      if (act === 'reset')  resetAll();
      if (act === 'queue')  { if (window.Review) window.Review.queue(); }
      if (act === 'mine')   { if (window.Review) window.Review.mine(); }
      if (act === 'exit')   window.GalleryEdit.toggle(false);
    });

    $('#importFile').addEventListener('change', function (e) {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = function () {
        try {
          const p = JSON.parse(fr.result);
          if (!p || !Array.isArray(p.members)) throw new Error('格式不符');
          window.GalleryState.set(p);
          toast('已导入 ' + p.members.length + ' 名成员');
        } catch (err) { alert('导入失败：' + err.message); }
      };
      fr.readAsText(f);
      e.target.value = '';
    });
  }
  function arm() { /* 进入编辑态，预留钩子 */ }

  /* ---------- 增 / 改 / 删 ---------- */
  // 上传：居中裁方 + 压到 512px 再转 JPEG
  // （原图直存 base64 会迅速撑爆浏览器存储和云端同步，2560×1600 的截图能到 2MB/张）
  function readCompressed(file, maxPx, quality) {
    return new Promise(function (resolve, reject) {
      const fr = new FileReader();
      fr.onerror = function () { reject(new Error('图片读取失败')); };
      fr.onload = function () {
        const img = new Image();
        img.onerror = function () { reject(new Error('不是可用的图片文件')); };
        img.onload = function () {
          const side = Math.min(img.width, img.height);
          const sx = Math.round((img.width - side) / 2);
          const sy = Math.round((img.height - side) / 2);
          const out = Math.min(maxPx, side);
          const cv = document.createElement('canvas');
          cv.width = out; cv.height = out;
          const ctx = cv.getContext('2d');
          ctx.fillStyle = '#0a0908';            // 与卡片底色一致，透明区不会有白边
          ctx.fillRect(0, 0, out, out);
          ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
          resolve(cv.toDataURL('image/jpeg', quality));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function add(hall, rank) {
    openForm({
      id: '', name: '', alias: '', fullName: '',
      rank: rank || 'knight', hall: hall || 'order',
      tincture: (H.RANKS[rank] || H.RANKS.knight).defaultTincture,
      portrait: '', tagline: '', oath: '', joined: '',
      weapon: '', armor: '', deeds: [], quote: ''
    }, true);
  }
  function edit(id) {
    const s = window.GalleryState.get();
    const m = s.members.find(function (x) { return x.id === id; });
    if (!m) return;
    openForm(JSON.parse(JSON.stringify(m)), false);
  }
  function remove(id) {
    const s = window.GalleryState.get();
    const m = s.members.find(function (x) { return x.id === id; });
    if (!m) return;
    if (!confirm('把「' + m.name + '」从名册上划去？此操作可在还原里恢复。')) return;
    s.members = s.members.filter(function (x) { return x.id !== id; });
    window.GalleryState.set(s);
    toast('已划去 ' + m.name);
  }

  /* ---------- 成员表单 ---------- */
  function openForm(m, isNew) {
    draft = m;
    const s = window.GalleryState.get();

    const rankOpts = Object.keys(H.RANKS).map(function (k) {
      return '<option value="' + k + '"' + (m.rank === k ? ' selected' : '') + '>' +
             esc(H.RANKS[k].label) + ' · ' + esc(H.RANKS[k].en) + '</option>';
    }).join('');
    const hallOpts = s.halls.map(function (h) {
      return '<option value="' + esc(h.key) + '"' + (m.hall === h.key ? ' selected' : '') + '>' +
             esc(h.name) + '</option>';
    }).join('');
    const tincOpts = H.TINCTURE_KEYS.map(function (k) {
      return '<option value="' + k + '"' + (m.tincture === k ? ' selected' : '') + '>' +
             esc(H.TINCTURES[k].name) + '</option>';
    }).join('');

    const fields = FIELDS.map(function (f) {
      const v = Array.isArray(m[f.k]) ? m[f.k].join('\n') : (m[f.k] || '');
      const ctl = f.type === 'textarea'
        ? '<textarea data-k="' + f.k + '" placeholder="' + esc(f.ph) + '">' + esc(v) + '</textarea>'
        : '<input type="text" data-k="' + f.k + '" value="' + esc(v) + '" placeholder="' + esc(f.ph) + '">';
      return '<div class="field"><label>' + esc(f.label) + '</label>' + ctl + '</div>';
    }).join('');

    const preview = m.portrait
      ? '<img src="' + esc(m.portrait) + '" alt="">'
      : H.portraitPlaceholder(m.rank, m.tincture, 84);

    $('#modalPanel').innerHTML =
      '<button class="modal__x" type="button" data-close aria-label="关闭" title="关闭">✕</button>' +
      '<h3 class="modal__title">' + (isNew ? '录入新成员' : '修订 · ' + esc(m.name)) + '</h3>' +
      '<div class="field">' +
        '<label>肖像（1:1）</label>' +
        '<div class="portrait-pick">' +
          '<div class="portrait-pick__preview" id="pv">' + preview + '</div>' +
          '<div class="portrait-pick__ops">' +
            '<input type="text" data-k="portrait" value="' + esc(m.portrait) + '" placeholder="portraits/亚德里安.png">' +
            '<div class="field__hint">上传会自动居中裁成 1:1 并压到 512px（约 60KB），存进名册后自动同步到云端；也可填相对路径 portraits/xxx.png</div>' +
            '<div class="btnline">' +
              '<button class="minibtn" id="btnUpload">上传本地图片</button>' +
              '<button class="minibtn" id="btnClearImg">清除图片</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="field--row">' +
        '<div class="field"><label>层级</label><select data-k="rank">' + rankOpts + '</select></div>' +
        '<div class="field"><label>所属廷</label><select data-k="hall">' + hallOpts + '</select></div>' +
      '</div>' +
      '<div class="field"><label>纹章色记</label><select data-k="tincture">' + tincOpts + '</select></div>' +
      fields +
      (mode() === 'author'
        ? '<div class="field__hint">投稿人身份：新成员递交后先进管理者后台，过审才对外显示；' +
          '已经是「已上线」的自己投稿，改完直接生效，不用再审。</div>'
        : '') +
      '<div class="modal__foot">' +
        '<button class="ghost" data-close>取消</button>' +
        '<button class="primary" data-save>' + esc(saveLabel(isNew, m)) + '</button>' +
      '</div>';

    // 上传
    const up = document.createElement('input');
    up.type = 'file'; up.accept = 'image/*'; up.style.display = 'none';
    $('#modalPanel').appendChild(up);
    up.addEventListener('change', function () {
      const f = up.files && up.files[0];
      if (!f) return;
      readCompressed(f, 512, 0.86).then(function (uri) {
        $('#modalPanel').querySelector('[data-k="portrait"]').value = uri;
        $('#pv').innerHTML = '<img src="' + uri + '" alt="">';
      })['catch'](function (err) { alert('图片处理失败：' + err.message); });
      up.value = '';
    });

    openModal(isNew);
  }

  function syncPreview() {
    const v = $('#modalPanel').querySelector('[data-k="portrait"]').value.trim();
    $('#pv').innerHTML = v ? '<img src="' + esc(v) + '" alt="">'
      : H.portraitPlaceholder(
          $('#modalPanel').querySelector('[data-k="rank"]').value,
          $('#modalPanel').querySelector('[data-k="tincture"]').value, 84);
  }

  /* ---------- 公会信息表单 ---------- */
  function openGuildForm() {
    const g = window.GalleryState.get().guild;
    const rows = [
      ['name', '公会名', g.name], ['enName', '英文名', g.enName],
      ['crest', '团徽图片路径', g.crest || ''],
      ['motto', '箴言（拉丁）', g.motto], ['mottoCn', '箴言（中）', g.mottoCn],
      ['founded', '建团纪年', g.founded], ['blurb', '简介', g.blurb]
    ];
    $('#modalPanel').innerHTML =
      '<button class="modal__x" type="button" data-close aria-label="关闭" title="关闭">✕</button>' +
      '<h3 class="modal__title">团徽与箴言</h3>' +
      rows.map(function (r) {
        const hint = r[0] === 'crest'
          ? '<div class="field__hint">填图片路径或粘贴图片地址；留空则用程序化主纹章</div>' : '';
        return '<div class="field"><label>' + esc(r[1]) + '</label>' +
               '<input type="text" data-g="' + r[0] + '" value="' + esc(r[2]) + '">' + hint + '</div>';
      }).join('') +
      '<div class="modal__foot">' +
        '<button class="ghost" data-close>取消</button>' +
        '<button class="primary" data-save-guild>刻上石碑</button>' +
      '</div>';
    openModal(false);
  }

  /* ---------- 弹窗控制 ---------- */
  // 面板的点击事件只在启动时绑一次。
  // ⚠ 千万别挪回 openModal() 里：那会每开一次表单多挂一个监听，
  //    第 N 次点「递交」就会连写 N 条同名成员（踩过：一次点击进了 4 条）。
  function openModal(isNew) {
    draftIsNew = !!isNew;
    $('#modal').classList.add('is-open');
  }

  function bindPanel() {
    const panel = $('#modalPanel');
    panel.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { closeModal(); return; }

      if (e.target.closest('#btnUpload')) {
        const up = panel.querySelector('input[type="file"]');
        if (up) up.click();
        return;
      }
      if (e.target.closest('#btnClearImg')) {
        panel.querySelector('[data-k="portrait"]').value = '';
        syncPreview();
        return;
      }

      if (e.target.closest('[data-save]')) {
        if (saving) return;                 // 防连点：一次提交走完才放下一个
        saving = true;
        try { saveMember(panel); } finally { saving = false; }
        return;
      }

      if (e.target.closest('[data-save-guild]')) {
        const s = window.GalleryState.get();
        Array.prototype.forEach.call(panel.querySelectorAll('[data-g]'), function (i) {
          s.guild[i.dataset.g] = i.value;
        });
        commit(s, '已更新团徽');
      }
    });

    // 预览联动也只绑一次。之前这两坨写在 openForm() 里，
    // 跟「递交写多条」是同一个病：开 N 次表单就挂 N 个监听。
    panel.addEventListener('input', function (e) {
      const k = e.target.dataset && e.target.dataset.k;
      if (!k) return;
      if (k === 'portrait') { syncPreview(); return; }
      if (k === 'rank' || k === 'tincture') {
        const pv = $('#pv');
        if (pv && !pv.querySelector('img')) {
          pv.innerHTML = H.portraitPlaceholder(
            panel.querySelector('[data-k="rank"]').value,
            panel.querySelector('[data-k="tincture"]').value, 84);
        }
      }
    });
  }

  function saveMember(panel) {
    const data = collect(panel);
    if (!data.name) { alert('姓名不能为空'); return; }
    const s = window.GalleryState.get();
    const S = window.Sync;
    const md = mode();
    const cloud = md !== 'local';
    const isNew = draftIsNew || !draft.id;

    // 同名查重：撞上已存在的成员，能改就并进去，不能改就拦下
    const dup = findByName(s.members, data.name, isNew ? null : draft.id);
    if (dup && isNew) {
      if (!canEditMember(dup)) {
        alert('名册里已经有「' + dup.name + '」了，那是别人递交的成员，你改不了。\n换个名字或称号再递交吧。');
        return;
      }
      if (!confirm('名册里已经有「' + dup.name + '」了。\n\n确定：把这次的内容更新到它身上（不会多出一条）\n取消：回到表单继续改')) return;
      applyMember(s, dup, data, cloud, md, S);
      commit(s, dup.__pending ? '已更新 · 仍在待审队列' : '已更新名册');
      return;
    }
    if (dup && !isNew) {
      alert('已经有同名的「' + dup.name + '」了，改个名字再保存。');
      return;
    }

    if (isNew) {
      data.id = 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      if (cloud) {
        data.__owner = S.uid();
        data.__pending = (md === 'author');   // 管理者直上，投稿人待审
      }
      s.members.push(data);
    } else {
      const i = s.members.findIndex(function (x) { return x.id === draft.id; });
      applyMember(s, (i >= 0) ? s.members[i] : draft, data, cloud, md, S);
    }

    const waiting = !!(cloud && data.__pending);
    commit(s, waiting
      ? (isNew ? '已递交 · 等管理者过审后才会显示' : '已改好 · 仍在待审队列')
      : '已更新名册');
  }

  // 把表单内容合并进已有成员，并保留归属与审核状态
  function applyMember(s, prev, data, cloud, md, S) {
    const i = s.members.findIndex(function (x) { return x.id === prev.id; });
    const base = (i >= 0) ? s.members[i] : prev;
    if (cloud) {
      data.__owner = base.__owner || S.uid();
      // 自己已上线的成员：改完直接生效；还在待审的，保持待审
      data.__pending = (md === 'author') ? !!base.__pending : false;
    }
    if (i >= 0) s.members[i] = Object.assign({}, base, data);
  }

  function findByName(list, name, exceptId) {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    return (list || []).filter(function (m) {
      return m.id !== exceptId && String(m.name || '').trim().toLowerCase() === n;
    })[0] || null;
  }
  // 与 app.js 的 canEdit 同一套判定：离线/未登录=本机全权，管理者=全权，投稿人=只改自己的
  function canEditMember(m) {
    const S = window.Sync;
    if (!S || !S.isEnabled() || !S.signedIn()) return true;
    if (S.isAdmin()) return true;
    return !!m.__owner && m.__owner === S.uid();
  }
  function closeModal() { $('#modal').classList.remove('is-open'); }

  // ⚠ 这里原本有一行「点面板外的暗区就 closeModal()」，已按设计师要求删除。
  //    录入一个骑士要塞十来栏，误触空白全清空太亏。关闭只认面板上的 ✕ / 取消，以及 Esc。
  //    别以为「加个 confirm 就安全了」——confirm 本身也是打断。
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('#modal').classList.contains('is-open')) closeModal();
  });

  function collect(panel) {
    const out = {};
    Array.prototype.forEach.call(panel.querySelectorAll('[data-k]'), function (i) {
      out[i.dataset.k] = i.value;
    });
    out.deeds = String(out.deeds || '').split('\n').map(function (s) { return s.trim(); })
                 .filter(function (s) { return s.length; });
    return out;
  }

  function commit(s, msg) {
    try {
      window.GalleryState.set(s);
      closeModal();
      toast(msg);
    } catch (e) {
      alert('保存失败：' + e.message + '\n（若图片为 base64 且较多，可能超出浏览器存储上限，建议改用相对路径）');
    }
  }

  /* ---------- 导出 / 重置 ---------- */
  function exportJson() {
    const s = window.GalleryState.get();
    const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'knight-gallery-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function resetAll() {
    if (!confirm('还原为初始名册？当前所有编辑会丢失（建议先导出备份）。')) return;
    localStorage.removeItem('knightGallery.v1');
    window.GalleryState.reload();
    if (window.Sync) window.Sync.schedulePush();   // 还原也算一次改动，登录后同步上云
    toast('已还原初始名册');
  }

  /* ---------- 轻提示 ---------- */
  let toastTimer = null;
  function toast(msg) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:76px;transform:translateX(-50%) translateY(14px);' +
        'z-index:260;padding:9px 18px;font-size:12.5px;letter-spacing:.16em;color:#d9c9a6;' +
        'background:rgba(10,9,8,.95);border:1px solid rgba(201,162,39,.4);opacity:0;' +
        'transition:opacity .3s,transform .3s;pointer-events:none';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    requestAnimationFrame(function () { el.style.opacity = '1'; el.style.transform = 'translateX(-50%) translateY(0)'; });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(14px)';
    }, 2200);
  }

  bindPanel();
  window.Editor = { init: init, arm: arm, add: add, edit: edit, remove: remove };
})();
