/* ============================================================
   app.js — 渲染 / 路由 / 详情转场 / 粒子 / 隐蔽入口
   ============================================================ */
(function () {
  'use strict';

  const STORE_KEY = 'knightGallery.v1';
  const H = window.Heraldry;

  /* ---------- 状态 ---------- */
  let state = load();
  let order = [];          // 当前可见成员顺序（详情页上下翻用）
  let currentIndex = -1;

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        // members 为空数组多半是被云端空快照洗过，别认，直接回出厂名册
        if (p && Array.isArray(p.members) && p.members.length) return migrate(p);
      }
    } catch (e) { /* 读取失败则用默认数据 */ }
    const d = window.GuildData;
    return JSON.parse(JSON.stringify({ guild: d.GUILD, halls: d.HALLS, members: d.MEMBERS }));
  }

  // 旧数据迁移：仅当用户未自定义过团名/团徽时，无感升级为红龙骑士团
  function migrate(p) {
    if (p.guild && !p.guild.crest) {
      // 取默认团徽（打包成单文件时这里是 data URI，源码版是相对路径）
      p.guild.crest = window.GuildData.GUILD.crest;
      if (p.guild.name === '灰隼骑士团') p.guild.name = '红龙骑士团';
      if (p.guild.enName === 'Order of the Grey Falcon') p.guild.enName = 'RedLoong';
      if (p.guild.founded && p.guild.founded.indexOf('灰隼堡') >= 0) {
        p.guild.founded = p.guild.founded.replace('灰隼堡', '红龙堡');
      }
    }
    return p;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('存储失败（可能是隐私模式）', e); }
  }
  window.GalleryState = {
    get: function () { return state; },
    set: function (s) { state = s; save(); render(); if (window.Sync) window.Sync.schedulePush(); },
    save: save,
    reload: function () { state = load(); render(); if (window.Sync) window.Sync.pull(); },
    // 云端那份更新 → 直接替换并回写本机缓存（不触发上传，避免来回打转）
    applyCloud: function (p) {
      if (!p || !Array.isArray(p.members)) return;
      state = migrate({ guild: p.guild || state.guild, halls: p.halls || state.halls, members: p.members });
      save();
      render();
    }
  };

  /* ---------- 工具 ---------- */
  const $ = function (s, r) { return (r || document).querySelector(s); };
  const esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function rankOf(m) { return H.RANKS[m.rank] || H.RANKS.knight; }

  // 谁能改这张卡：离线/未登录=本机全权；管理者=全都能改；投稿人=只改自己递交的
  function canEdit(m) {
    if (!window.Sync || !window.Sync.isEnabled() || !window.Sync.signedIn()) return true;
    if (window.Sync.isAdmin()) return true;
    return !!m.__owner && m.__owner === window.Sync.uid();
  }
  // 待审核的成员：只给编辑态（管理者/投稿人本人）看，访客看不到
  function showable(m) {
    return !m.__pending || document.body.classList.contains('is-editing');
  }
  function portraitHtml(m, cls) {
    if (m.portrait) {
      return '<img src="' + esc(m.portrait) + '" alt="' + esc(m.name) + '肖像" loading="lazy" ' +
             'onerror="this.style.display=\'none\';this.parentNode.classList.add(\'is-fallback\')">';
    }
    return H.portraitPlaceholder(m.rank, m.tincture, 200);
  }

  /* ============================================================
     渲染
     ============================================================ */
  function render() {
    renderMasthead();
    renderNav();
    renderHalls();
    bindCards();
    observeCards();
    paintQueueDot();
  }

  function renderMasthead() {
    const g = state.guild;
    // 团徽优先用自定义图片（GUILD.crest），无则回退程序化主纹章
    $('#crestSlot').innerHTML = g.crest
      ? '<img src="' + esc(g.crest) + '" alt="' + esc(g.name) + '团徽" ' +
        'onerror="this.remove();document.getElementById(\'crestSlot\').innerHTML=Heraldry.guildCrest(168)">'
      : H.guildCrest(168);
    $('#guildName').textContent = g.name;
    $('#guildEn').textContent = g.enName;
    $('#guildMotto').innerHTML = esc(g.motto) + '<span>' + esc(g.mottoCn) + '</span>';
    $('#guildBlurb').textContent = g.blurb;
    $('#guildFounded').textContent = g.founded;
  }

  function renderNav() {
    $('#hallNav').innerHTML = state.halls.map(function (h) {
      return '<button class="hallnav__btn" data-hall="' + esc(h.key) + '">' +
             esc(h.name) + '<small>' + esc(h.en) + '</small></button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('.hallnav__btn'), function (b) {
      b.addEventListener('click', function () {
        const el = document.getElementById('hall-' + b.dataset.hall);
        if (el) window.scrollTo({ top: el.offsetTop - 84, behavior: 'smooth' });
      });
    });
  }

  function renderHalls() {
    const wrap = $('#halls');
    wrap.innerHTML = state.halls.map(function (h) {
      const members = state.members.filter(function (m) { return m.hall === h.key && showable(m); });
      // 按层级 tier 排序，同层级保持录入顺序
      members.sort(function (a, b) { return rankOf(a).tier - rankOf(b).tier; });

      // 按 tier 分组
      const groups = [];
      members.forEach(function (m) {
        const r = rankOf(m);
        let g = groups.find(function (x) { return x.rank === m.rank; });
        if (!g) { g = { rank: m.rank, tier: r.tier, list: [] }; groups.push(g); }
        g.list.push(m);
      });
      groups.sort(function (a, b) { return a.tier - b.tier; });

      // 议事厅是内廷门面：两层级合入同一网格让首行排满；
      // 其余厅按层级分块，非首个层级前插全宽标签
      const ghostBtn = function (rankKey) {
        return '<button class="card card--ghost" data-add-rank="' + esc(rankKey) +
               '" data-add-hall="' + esc(h.key) + '"><span>+</span>新增' + esc(H.RANKS[rankKey].label) + '</button>';
      };
      let blocks;
      if (h.key === 'council') {
        blocks = '<div class="grid">' +
                   members.map(cardHtml).join('') +
                   groups.map(function (g) { return ghostBtn(g.rank); }).join('') +
                 '</div>';
      } else {
        blocks = groups.map(function (g, gi) {
          const r = H.RANKS[g.rank];
          const label = gi > 0
            ? '<div class="tier-label"><b>' + esc(r.label) + '</b><em>' + esc(r.en) + '</em></div>'
            : '';
          return label + '<div class="grid">' + g.list.map(cardHtml).join('') + ghostBtn(g.rank) + '</div>';
        }).join('');
      }

      return '<section class="hall" id="hall-' + esc(h.key) + '" data-hall="' + esc(h.key) + '">' +
               '<div class="hall__head">' +
                 '<h2 class="hall__title">' + esc(h.name) + '</h2>' +
                 '<div class="hall__en">' + esc(h.en) + '</div>' +
                 '<p class="hall__sub">' + esc(h.sub) + '</p>' +
                 '<p class="hall__note">' + esc(h.note) + '</p>' +
               '</div>' + blocks +
             '</section>';
    }).join('');

    // 渲染后重建全局顺序（详情页翻页用）
    order = [];
    state.halls.forEach(function (h) {
      const members = state.members.filter(function (m) { return m.hall === h.key && showable(m); })
        .sort(function (a, b) { return rankOf(a).tier - rankOf(b).tier; });
      members.forEach(function (m) { order.push(m); });
    });
  }

  function cardHtml(m) {
    const r = rankOf(m);
    const mod = {
      lord_commander: 'card--lord',
      knight_captain: 'card--captain',
      knight: 'card--knight',
      squire: 'card--squire',
      allied_knight: 'card--allied'
    }[m.rank] || '';

    const mark = (m.rank === 'squire' ? '<div class="card__mark">未授剑</div>' : '') +
                 (m.__pending ? '<div class="card__mark card__mark--wait">待审核</div>' : '');

    return '<article class="card ' + mod + '" data-id="' + esc(m.id) + '" tabindex="0" role="button" ' +
             'aria-label="' + esc(m.name + ' · ' + r.label) + '">' +
             '<div class="card__crestbar">' + H.arms(m.rank, m.tincture, { size: 34 }) + '</div>' +
             '<div class="card__portrait">' + portraitHtml(m) + '</div>' +
             mark +
             '<div class="card__body">' +
               '<div class="card__rank">' + esc(r.label) + '</div>' +
               '<h3 class="card__name">' + esc(m.name) + '</h3>' +
               '<div class="card__alias">「' + esc(m.alias) + '」</div>' +
               '<p class="card__tagline">' + esc(m.tagline) + '</p>' +
             '</div>' +
             '<div class="card__sweep"></div>' +
             (canEdit(m)
               ? '<div class="card__tools">' +
                   '<button class="card__tool" data-act="edit" title="编辑">✎</button>' +
                   '<button class="card__tool card__tool--del" data-act="del" title="移除">✕</button>' +
                 '</div>'
               : '') +
           '</article>';
  }

  /* ---------- 入场动画 ---------- */
  let io = null;
  function observeCards() {
    if (io) io.disconnect();
    const cards = document.querySelectorAll('.card:not(.card--ghost)');
    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(cards, function (c) { c.classList.add('is-in'); });
      return;
    }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        const el = en.target;
        const delay = parseInt(el.dataset.delay || '0', 10);
        setTimeout(function () { el.classList.add('is-in'); }, delay);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    Array.prototype.forEach.call(cards, function (c, i) {
      c.dataset.delay = String((i % 4) * 70);
      io.observe(c);
    });

    // 兜底：首屏卡片若因某些环境未触发观察器（无头截图、缩放异常），1.2s 后强制显形
    clearTimeout(failsafeTimer);
    failsafeTimer = setTimeout(function () {
      Array.prototype.forEach.call(cards, function (c) {
        if (c.classList.contains('is-in')) return;
        const r = c.getBoundingClientRect();
        if (r.top < window.innerHeight + 80) c.classList.add('is-in');
      });
    }, 1200);
  }
  let failsafeTimer = null;

  /* ---------- 卡片交互 ---------- */
  function bindCards() {
    const halls = $('#halls');
    halls.addEventListener('click', function (e) {
      const tool = e.target.closest('[data-act]');
      const card = e.target.closest('.card');
      const ghost = e.target.closest('.card--ghost');

      if (ghost) {
        e.stopPropagation();
        if (window.Editor) window.Editor.add(ghost.dataset.addHall, ghost.dataset.addRank);
        return;
      }
      if (tool && document.body.classList.contains('is-editing')) {
        e.stopPropagation();
        const id = card && card.dataset.id;
        const m = state.members.filter(function (x) { return x.id === id; })[0];
        if (!m || !canEdit(m)) { toastForbid(m); return; }
        if (tool.dataset.act === 'edit' && window.Editor) window.Editor.edit(id);
        if (tool.dataset.act === 'del' && window.Editor) window.Editor.remove(id);
        return;
      }
      if (card && card.dataset.id) {
        if (document.body.classList.contains('is-editing')) {
          const m = state.members.filter(function (x) { return x.id === card.dataset.id; })[0];
          if (m && canEdit(m) && window.Editor) window.Editor.edit(card.dataset.id);
          else if (m) toastForbid(m);
          return;
        }
        openDetail(card.dataset.id);
      }
    });

    halls.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.card[data-id]');
      if (!card) return;
      e.preventDefault();
      openDetail(card.dataset.id);
    });
  }

  /* ============================================================
     详情页
     ============================================================ */
  const detail = document.getElementById('detail');

  function openDetail(id) {
    const idx = order.findIndex(function (m) { return m.id === id; });
    if (idx < 0) return;
    currentIndex = idx;
    paintDetail(order[idx]);
    detail.classList.add('is-open');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { detail.classList.add('is-visible'); });
    });
    document.body.style.overflow = 'hidden';
    $('#detailClose').focus();
  }

  function closeDetail() {
    detail.classList.remove('is-visible');
    setTimeout(function () {
      detail.classList.remove('is-open');
      document.body.style.overflow = '';
    }, 320);
  }

  function stepDetail(dir) {
    const next = currentIndex + dir;
    if (next < 0 || next >= order.length) return;
    currentIndex = next;
    const scroll = $('.scroll', detail);
    scroll.style.transition = 'none';
    scroll.style.opacity = '0';
    scroll.style.transform = 'translateY(14px)';
    setTimeout(function () {
      paintDetail(order[currentIndex]);
      scroll.style.transition = '';
      scroll.style.opacity = '';
      scroll.style.transform = '';
      detail.scrollTop = 0;
    }, 160);
  }

  function paintDetail(m) {
    const r = rankOf(m);
    $('#detailBody').innerHTML =
      '<div class="detail__grid">' +
        '<div class="detail__left">' +
          '<div class="detail__portrait">' + portraitHtml(m) + '</div>' +
          '<div class="detail__arms">' + H.arms(m.rank, m.tincture, { size: 118 }) + '</div>' +
        '</div>' +
        '<div class="detail__right">' +
          '<div class="detail__rank">' + esc(r.label) + ' · ' + esc(r.en) + '</div>' +
          '<h2 class="detail__name">' + esc(m.name) + '</h2>' +
          '<div class="detail__alias">「' + esc(m.alias) + '」</div>' +
          '<div class="detail__full">' + esc(m.fullName || '') + '</div>' +
          '<p class="detail__tagline">' + esc(m.tagline) + '</p>' +
          '<div class="oath">' +
            '<div class="oath__label">Oath · 誓言</div>' +
            '<div class="oath__text">' + esc(m.oath) + '</div>' +
          '</div>' +
          '<div class="facts">' +
            fact('入团', m.joined) +
            fact('兵器', m.weapon) +
            fact('甲胄', m.armor) +
          '</div>' +
          '<div class="deeds">' +
            '<div class="deeds__label">Deeds · 战绩</div>' +
            '<ul>' + (m.deeds || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('') + '</ul>' +
          '</div>' +
          (m.quote ? '<div class="detail__quote">' + esc(m.quote) + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="detail__nav">' +
        '<button class="prev" data-step="-1">← 上一位</button>' +
        '<button class="next" data-step="1">下一位 →</button>' +
      '</div>';
  }
  function fact(k, v) {
    if (!v) return '';
    return '<div class="facts__row"><div class="facts__k">' + esc(k) + '</div><div class="facts__v">' + esc(v) + '</div></div>';
  }

  $('#detailClose').addEventListener('click', closeDetail);
  detail.addEventListener('click', function (e) {
    if (e.target === detail) closeDetail();
    const step = e.target.closest('[data-step]');
    if (step) stepDetail(parseInt(step.dataset.step, 10));
  });
  document.addEventListener('keydown', function (e) {
    if (!detail.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeDetail();
    if (e.key === 'ArrowLeft') stepDetail(-1);
    if (e.key === 'ArrowRight') stepDetail(1);
  });

  /* ============================================================
     尘埃粒子
     ============================================================ */
  function initDust() {
    const cv = $('#dust');
    if (!cv || !cv.getContext) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = cv.getContext('2d');
    let w = 0, h = 0, dpr = 1;
    const ps = [];

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function spawn(seedTop) {
      return {
        x: Math.random() * w,
        y: seedTop ? Math.random() * h : h + Math.random() * 40,
        r: 0.5 + Math.random() * 1.7,
        vy: -(0.10 + Math.random() * 0.34),
        vx: (Math.random() - 0.5) * 0.16,
        a: 0.12 + Math.random() * 0.4,
        life: 0,
        max: 400 + Math.random() * 500,
        warm: Math.random() < 0.45
      };
    }
    function reset() {
      ps.length = 0;
      const n = Math.round((w * h) / 26000);
      for (let i = 0; i < Math.min(n, 130); i++) ps.push(spawn(true));
    }
    function frame() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.life++;
        p.x += p.vx + Math.sin((p.life + i * 30) * 0.008) * 0.14;
        p.y += p.vy;
        if (p.y < -10 || p.x < -20 || p.x > w + 20 || p.life > p.max) ps[i] = spawn(false);
        const fade = Math.min(1, p.life / 60) * Math.min(1, (p.max - p.life) / 90);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.warm
          ? 'rgba(255,175,105,' + (p.a * fade * 0.85).toFixed(3) + ')'
          : 'rgba(216,201,168,' + (p.a * fade * 0.5).toFixed(3) + ')';
        ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    size(); reset(); frame();
    let t = null;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { size(); reset(); }, 180);
    });
  }

  /* ============================================================
     隐蔽编辑入口（四种，都不显眼）
     1) 双击公会主纹章  2) Ctrl+Shift+E  3) 网址加 #forge
     4) 页脚印记连点三下
     ============================================================ */
  function toggleEdit(on) {
    const next = (typeof on === 'boolean') ? on : !document.body.classList.contains('is-editing');
    document.body.classList.toggle('is-editing', next);
    if (next && window.Editor) window.Editor.arm();
  }
  window.GalleryEdit = { toggle: toggleEdit, isOn: function () { return document.body.classList.contains('is-editing'); } };

  function bindSecretEntry() {
    // 1) 双击主纹章
    const crest = document.getElementById('crestSlot');
    crest.addEventListener('dblclick', function () { toggleEdit(); });

    // 2) 快捷键
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        e.preventDefault(); toggleEdit();
      }
      // 编辑态下 Esc 退出编辑（详情开着时先关详情）
      if (e.key === 'Escape' && document.body.classList.contains('is-editing') &&
          !detail.classList.contains('is-open')) {
        toggleEdit(false);
      }
    });

    // 3) 网址 hash
    if (location.hash === '#forge') setTimeout(function () { toggleEdit(true); }, 400);

    // 4) 页脚印记连点三下
    let taps = 0, timer = null;
    const sigil = document.querySelector('.footer .sigil');
    if (sigil) {
      sigil.addEventListener('click', function () {
        taps++;
        clearTimeout(timer);
        timer = setTimeout(function () { taps = 0; }, 1400);
        if (taps >= 3) { taps = 0; toggleEdit(); }
      });
    }
  }

  /* ---------- 导航高亮 + 吸顶态 ---------- */
  function bindNavHighlight() {
    const nav = $('#hallNav');
    function onScroll() { nav.classList.toggle('is-stuck', window.scrollY > 300); }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    if (!('IntersectionObserver' in window)) return;
    const obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        const key = en.target.dataset.hall;
        Array.prototype.forEach.call(document.querySelectorAll('.hallnav__btn'), function (b) {
          b.classList.toggle('is-active', b.dataset.hall === key);
        });
      });
    }, { threshold: 0, rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('.hall').forEach(function (h) { obs.observe(h); });
  }

  function toastForbid(m) {
    if (!m) return;
    if (window.Sync && window.Sync.toast) {
      window.Sync.toast(m.__pending ? '这份还在审核队列里' : '别人递交的成员改不了（只有管理者能动）');
    }
  }

  /* ---------- 云同步指示灯（只在锻造模式里露面，访客看不见） ---------- */
  function bindCloudChip() {
    const chip = document.getElementById('cloudChip');
    if (!chip || !window.Sync) return;
    chip.addEventListener('click', function () { window.Sync.openAuth(); });
    window.Sync.onChange(function (s) {
      const roleEl = document.getElementById('chipRole');
      const stateEl = document.getElementById('chipState');
      const roleWord = { guest: '未登录', author: '投稿人', admin: '管理者' }[s.role] || '未登录';
      const map = {
        off:     ['离线版', s.text || '改动只存本机', 'is-dim'],
        boot:    ['连接云端…', s.text || '', ''],
        anon:    ['待同步', s.text || '改动只存本机 · 点此登录', 'is-warn'],
        pending: ['待同步', s.text || '有改动还没上传', 'is-warn'],
        syncing: ['同步中…', s.text || '正在读写云端', ''],
        ok:      ['已同步', s.text || '', 'is-ok'],
        down:    ['网络不通', s.text || '改动存在本机，联网后自动补传', 'is-warn'],
        error:   ['同步失败', s.text || '点此查看登录面板', 'is-bad']
      };
      const v = map[s.k] || map.off;
      const r = window.Sync.isEnabled() ? window.Sync.role() : 'guest';
      if (roleEl) roleEl.textContent = window.Sync.isEnabled() ? ({ guest: '未登录', author: '投稿人', admin: '管理者' }[r] || roleWord) : '离线版';
      if (stateEl) stateEl.textContent = v[0];
      chip.title = v[1];
      chip.className = 'cloudchip ' + v[2];
      paintQueueDot();
    });
  }

  // 管理者工具条上的待审小红点
  function paintQueueDot() {
    const dot = document.getElementById('queueDot');
    if (!dot || !window.Sync) return;
    const n = (window.Sync.isAdmin() && window.Sync.pending) ? window.Sync.pending().length : 0;
    dot.textContent = n ? String(n) : '';
    dot.classList.toggle('is-live', !!n);
  }

  /* ---------- 启动 ---------- */
  function boot() {
    render();
    initDust();
    bindSecretEntry();
    bindNavHighlight();
    bindCloudChip();
    if (window.Editor) window.Editor.init();
    // 先按本机缓存秒开，再去云端对表：云端新则覆盖本机，本机新则上传覆盖云端
    if (window.Sync) window.Sync.start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
