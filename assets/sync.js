/* ============================================================
   sync.js — 云端同步 · 投稿审核版
   ------------------------------------------------------------
   云端是真源，localStorage 只是缓存。

   角色：
     guest   未登录：只看「已上线」的成员
     author  已登录：可递交新成员（进待审队列，不公开展示）；
                     自己投稿并通过的成员可以随手改，不用再审
     admin   管理者：全部编辑权 + 审核队列（通过 / 驳回留痕）

   权限落在数据库 RLS 上，按钮显不显只是 UI：
     · gallery_members   一行一名成员，owner_id 即投稿人，写自己的或管理员的
     · gallery_published 上线名单，只有管理员能增删 —— 作者改不了上线状态
     · gallery_admins    管理员 uid 白名单，表为空时第一个登录的人自助激活
     · gallery_decisions 审核留痕（通过/驳回 + 理由），投稿人可看自己的
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.CLOUD_CONFIG || {};
  var DOC = CFG.rosterDoc || 'main';
  var META_KEY = 'knightGallery.syncMeta';

  var online = /^https?:$/.test(location.protocol);
  var enabled = online && !!CFG.endpoint && !!CFG.publishableKey && !!window.WorkBuddyCloud;

  var cloud = null;
  var session = null;
  var role = 'guest';
  var meta = readMeta();
  var working = false;
  var pushTimer = null;
  var listeners = [];
  var st = { k: enabled ? 'boot' : 'off', text: '', user: null, mask: '', role: 'guest' };
  var mirror = null;        // 云端最近一次合成出的成员快照，用来 diff 出改动项
  var decisions = [];       // 我的投稿回执
  var dupes = [];           // 同名重复项（显示时已被压掉，等管理者清理）

  /* ---------------- 基础工具 ---------------- */
  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function writeMeta() { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} }
  function setStatus(k, text) {
    st.k = k;
    if (text != null) st.text = text;
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](st); } catch (e) {} }
  }
  function client() {
    if (cloud) return cloud;
    if (!enabled) return null;
    try {
      cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: CFG.endpoint,
        publishableKey: CFG.publishableKey
      });
    } catch (e) { cloud = null; }
    return cloud;
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function fmt(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts).slice(0, 16).replace('T', ' ');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function maskEmail(m) {
    var s = String(m || ''), i = s.indexOf('@');
    if (i < 1) return '';
    var head = s.slice(0, i);
    return (head.length <= 2 ? head.slice(0, 1) : head.slice(0, 2)) + '***@' + s.slice(i + 1);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var el = document.getElementById('toast');
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
    clearTimeout(el.__t);
    el.__t = setTimeout(function () { el.style.opacity = '0'; el.style.transform = 'translateX(-50%) translateY(14px)'; }, 2400);
  }
  // 唯一键冲突：SDK 给的 code 是 DATABASE_23505（不是裸 23505），别漏判
  function isDup(e) {
    var code = String((e && (e.code || e.errorCode || e.status)) || '');
    return code === '23505' || code === 'DATABASE_23505' || /23505/.test(code) ||
           /duplicate key/i.test((e && e.message) || '');
  }

  function netFail(e) {
    var msg = (e && e.message) ? e.message : String(e || '');    var down = /Failed to fetch|NetworkError|network|timeout/i.test(msg);
    setStatus(down ? 'down' : 'error',
              down ? '网络不通 · 改动存在本机' : (msg.slice(0, 60) || '同步失败'));
  }

  /* ---------------- 会话 / 角色 ---------------- */
  function uid() { return session && session.user ? session.user.id : null; }

  function refreshSession() {
    var c = client();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (r) {
      var s = r && r.data;
      session = (s && s.user && s.user.id) ? s : null;
      st.user = session && session.user ? session.user : null;
      st.mask = st.user ? maskEmail(st.user.email || (st.user.raw && st.user.raw.email)) : '';
      return session;
    })['catch'](function () { session = null; st.user = null; return null; });
  }

  // 白名单空着时，第一个登录的人自助成为管理者
  function claimAdminIfEmpty() {
    var c = client();
    if (!c || !uid()) return Promise.resolve(false);
    return c.database.from('gallery_admins').select('uid').limit(1).then(function (r) {
      if (r && r.error) return false;
      if ((r.data || []).length) return false;
      return c.database.from('gallery_admins').insert({ uid: uid(), note: '首位管理者（自助激活）' })
        .then(function (r2) { return !(r2 && r2.error); });
    })['catch'](function () { return false; });
  }

  function checkRole() {
    var c = client();
    if (!c || !uid()) { role = 'guest'; st.role = role; return Promise.resolve(role); }
    return c.database.from('gallery_admins').select('uid').eq('uid', uid()).limit(1)
      .then(function (r) {
        role = (!(r && r.error) && (r.data || []).length) ? 'admin' : 'author';
        st.role = role;
        return role;
      })['catch'](function () { role = 'author'; st.role = role; return role; });
  }

  /* ---------------- 拉取 ---------------- */
  function pullAll() {
    var c = client();
    if (!c) return Promise.reject(new Error('未加载云端组件'));
    var rs = [
      c.database.from('gallery_roster').select('id, payload, rev, updated_at').eq('doc_key', DOC).maybeSingle(),
      c.database.from('gallery_members').select('id, member_key, owner_id, payload, note, created_at, updated_at'),
      c.database.from('gallery_published').select('member_key'),
      uid()
        ? c.database.from('gallery_decisions').select('member_key, member_name, decision, note, created_at')
            .order('created_at', { ascending: false }).limit(30)
        : Promise.resolve({ data: [], error: null })
    ];
    return Promise.all(rs).then(function (out) {
      for (var i = 0; i < out.length; i++) { if (out[i] && out[i].error) throw out[i].error; }
      return {
        roster: out[0] && out[0].data ? out[0].data : null,
        rows: (out[1] && out[1].data) || [],
        published: ((out[2] && out[2].data) || []).map(function (p) { return p.member_key; }),
        decisions: (out[3] && out[3].data) || []
      };
    });
  }

  function compose(data) {
    var pub = {};
    data.published.forEach(function (k) { pub[k] = true; });
    var dedupe = dedupeByName(data.rows.map(function (r) {
      var m = JSON.parse(JSON.stringify(r.payload || {}));
      m.id = r.member_key;
      m.__owner = r.owner_id;
      m.__pending = !pub[r.member_key];
      m.__note = r.note || '';
      m.__at = r.created_at || '';
      return m;
    }));
    var head = (data.roster && data.roster.payload) || {};
    return {
      guild: head.guild || null,
      halls: head.halls || null,
      members: dedupe.list,
      dupes: dedupe.dupes,
      // 旧版名册是整包塞在 roster.payload.members 里的，留作迁移素材
      legacy: Array.isArray(head.members) ? head.members : null,
      __rosterId: data.roster ? data.roster.id : null
    };
  }

  // 同名保底去重：一个人只露一张脸。
  // 留谁的顺序 —— 已上线 > 更早递交的；被压下去的那条标 __dup 交给队列清理。
  function dedupeByName(list) {
    var seen = {}, out = [], dupes = [];
    list.forEach(function (m) {
      var k = String(m.name || '').trim().toLowerCase() || ('#' + m.id);
      var prev = seen[k];
      if (!prev) { seen[k] = m; out.push(m); return; }
      var prevWins = (!prev.__pending && m.__pending) ||
                     (prev.__pending === m.__pending && String(prev.__at) <= String(m.__at));
      if (prevWins) { dupes.push({ key: m.id, name: m.name, keep: prev.id }); return; }
      dupes.push({ key: prev.id, name: prev.name, keep: m.id });
      out[out.indexOf(prev)] = m;
      seen[k] = m;
    });
    return { list: out, dupes: dupes };
  }

  function start() {
    if (!enabled) { role = 'guest'; st.role = role; setStatus('off', '离线版 · 改动只存本机'); return; }
    refreshSession()
      .then(function () { return claimAdminIfEmpty(); })
      .then(function () { return checkRole(); })
      .then(function () { return cycle(true); })
      ['catch'](function () { /* 首轮失败静默 */ });

    setInterval(function () { if (!document.hidden && !working) cycle(true); }, 45000);
    window.addEventListener('focus', function () { if (!working) cycle(true); });

    var c = client();
    if (c && c.auth && c.auth.onAuthStateChange) {
      c.auth.onAuthStateChange(function () {
        refreshSession().then(function (s) {
          if (s) return claimAdminIfEmpty().then(checkRole).then(function () { return cycle(false); });
          role = 'guest'; st.role = role;
          setStatus('anon', '已退出 · 只看已上线成员');
          return null;
        });
      });
    }
  }

  function cycle(silent) {
    if (!enabled || working) return Promise.resolve(null);
    working = true;
    if (!silent) setStatus('syncing', '读取云端…');
    return flushQueue()['catch'](function () { return null; })
      .then(pullAll)
      .then(function (data) {
        working = false;
        decisions = data.decisions;
        var next = compose(data);
        dupes = next.dupes || [];
        mirror = JSON.parse(JSON.stringify(next.members));
        return applyCloud(next);
      })['catch'](function (e) { working = false; netFail(e); return null; });
  }

  function applyCloud(next) {
    var local = window.GalleryState ? window.GalleryState.get() : null;

    // 出厂名册还没搬进云端的成员表 → 补上去。
    // 只补「云端没有的」，已经在云端的成员一律不动，避免把管理者的修改冲掉。
    if (!meta.seeded && role === 'admin') {
      var seed = pickSeed(next, local);
      var have = {};
      next.members.forEach(function (m) { have[m.id] = true; });
      var missing = (seed.members || []).filter(function (m) { return m && m.id && !have[m.id]; });
      if (missing.length) {
        return seedDefaults({ guild: seed.guild, halls: seed.halls, members: missing })
          .then(function (ok) {
            if (ok) { meta.seeded = true; writeMeta(); return cycle(true); }
            return takeCloud(next);
          });
      }
      meta.seeded = true;
      writeMeta();
    }

    // 云端一个成员都没有 → 千万别拿空数组覆盖本机，那会把名册洗掉
    if (next.members.length === 0) {
      setStatus(uid() ? 'pending' : 'anon',
                role === 'admin' ? '名册已从本机补传' : '云端还没开张 · 等管理者首发');
      return null;
    }

    return takeCloud(next);
  }

  function takeCloud(next) {
    if (window.GalleryState) window.GalleryState.applyCloud(next);
    meta.rosterId = next.__rosterId;
    writeMeta();
    setStatus('ok', '云端名册 · ' + fmt(new Date()));
    return null;
  }

  // 播种素材优先级：旧版 roster 里的整包名册 > 本机名册 > data.js 出厂名册
  function pickSeed(next, local) {
    var d = window.GuildData || {};
    var guild = next.guild || (local && local.guild) || d.GUILD || null;
    var halls = next.halls || (local && local.halls) || d.HALLS || null;
    var members = (next.legacy && next.legacy.length) ? next.legacy
                : ((local && local.members && local.members.length) ? local.members
                : (d.MEMBERS ? JSON.parse(JSON.stringify(d.MEMBERS)) : []));
    return { guild: guild, halls: halls, members: members };
  }

  /* ---------------- 上传 ---------------- */
  function schedulePush() {
    if (!enabled) { setStatus('off', '离线版 · 改动只存本机'); return Promise.resolve(null); }
    if (!uid()) { setStatus('pending', '未登录 · 改动只存本机'); return Promise.resolve(null); }
    setStatus('pending', '等待上传…');
    clearTimeout(pushTimer);
    return new Promise(function (resolve) {
      pushTimer = setTimeout(function () { resolve(flushQueue()); }, 700);
    });
  }

  function stripMeta(m) {
    var o = JSON.parse(JSON.stringify(m));
    delete o.__owner; delete o.__pending; delete o.__note; delete o.__at; delete o.__dup;
    return o;
  }

  // 本地 ↔ 云端快照逐个成员 diff，把改动一次推完
  function flushQueue() {
    var c = client();
    if (!c || !uid()) return Promise.resolve(null);
    var cur = window.GalleryState ? window.GalleryState.get() : null;
    if (!cur) return Promise.resolve(null);
    working = true;
    setStatus('syncing', '上传改动…');

    var chain = Promise.resolve(null);

    if (role === 'admin') {
      var head = JSON.stringify({ guild: cur.guild, halls: cur.halls });
      if (head !== meta.headSnap) {
        chain = chain.then(function () {
          return upsertRoster(c, { guild: cur.guild, halls: cur.halls }).then(function (ok) {
            if (ok) { meta.headSnap = head; writeMeta(); }
            return null;
          });
        });
      }
    }

    var cloudMap = {}, localMap = {};
    (mirror || []).forEach(function (m) { cloudMap[m.id] = m; });
    (cur.members || []).forEach(function (m) { localMap[m.id] = m; });

    var changes = [];
    (cur.members || []).forEach(function (m) {
      var old = cloudMap[m.id];
      var clean = stripMeta(m);
      if (!old) { changes.push({ type: 'insert', key: m.id, payload: clean, isMine: true }); return; }
      if (JSON.stringify(stripMeta(old)) !== JSON.stringify(clean)) {
        changes.push({ type: 'update', key: m.id, payload: clean, isMine: old.__owner === uid() });
      }
    });
    (mirror || []).forEach(function (m) {
      if (!localMap[m.id]) changes.push({ type: 'delete', key: m.id, isMine: m.__owner === uid() });
    });

    changes.forEach(function (ch) {
      chain = chain.then(function () { return applyChange(c, ch); });
    });

    return chain.then(function () { return pullAll(); }).then(function (data) {
      working = false;
      mirror = JSON.parse(JSON.stringify(compose(data).members));
      decisions = data.decisions;
      setStatus(changes.length ? 'ok' : 'ok',
                changes.length ? ('已同步 ' + changes.length + ' 处改动 · ' + fmt(new Date())) : ('云端名册 · ' + fmt(new Date())));
      emit();
      return true;
    })['catch'](function (e) { working = false; netFail(e); return null; });
  }

  function emit() { if (window.Review && window.Review.refreshBar) window.Review.refreshBar(); }

  function applyChange(c, ch) {
    if (ch.type === 'delete') {
      if (role === 'admin') {
        return c.database.from('gallery_published').delete().eq('member_key', ch.key)
          .then(function () { return c.database.from('gallery_members').delete().eq('member_key', ch.key); })
          .then(function (r) { if (r && r.error) throw r.error; return true; });
      }
      if (!ch.isMine) return Promise.resolve(null);
      return c.database.from('gallery_members').delete().eq('member_key', ch.key)
        .then(function (r) { if (r && r.error) throw r.error; return true; });
    }
    if (ch.type === 'insert') {
      return c.database.from('gallery_members').insert({ member_key: ch.key, payload: ch.payload })
        .then(function (r) {
          if (r && r.error) {
            if (isDup(r.error)) {
              return c.database.from('gallery_members').update({ payload: ch.payload }).eq('member_key', ch.key)
                .then(function (r2) { if (r2 && r2.error) throw r2.error; return true; });
            }
            throw r.error;
          }
          if (role === 'admin') {   // 管理者自己录入的直接上线，不用过审
            return c.database.from('gallery_published').insert({ member_key: ch.key })
              .then(function () { return true; })['catch'](function () { return true; });
          }
          toast('已递交，等管理者过审');
          return true;
        });
    }
    if (ch.isMine || role === 'admin') {
      return c.database.from('gallery_members').update({ payload: ch.payload }).eq('member_key', ch.key)
        .then(function (r) { if (r && r.error) throw r.error; return true; });
    }
    toast('别人的成员改不了，已跳过');
    return Promise.resolve(null);
  }

  function upsertRoster(c, payload) {
    if (meta.rosterId) {
      return c.database.from('gallery_roster').update({ payload: payload }).eq('id', meta.rosterId)
        .select('id').then(function (r) {
          if (r && r.error) throw r.error;
          return !!(r.data && r.data.length);
        });
    }
    return c.database.from('gallery_roster').insert({ doc_key: DOC, payload: payload }).select('id')
      .then(function (r) {
        if (r && r.error) {
          if (isDup(r.error)) {
            return c.database.from('gallery_roster').select('id').eq('doc_key', DOC).maybeSingle()
              .then(function (q) {
                meta.rosterId = q && q.data ? q.data.id : null;
                writeMeta();
                return meta.rosterId ? upsertRoster(c, payload) : false;
              });
          }
          throw r.error;
        }
        meta.rosterId = r.data && r.data[0] ? r.data[0].id : null;
        meta.headSnap = JSON.stringify(payload);
        writeMeta();
        return true;
      });
  }

  // 单个成员落库：行已存在就改内容，再补上线标记（幂等，重跑不炸）
  function putMember(c, m) {
    var payload = stripMeta(m);
    return c.database.from('gallery_members').insert({ member_key: m.id, payload: payload })
      .then(function (r) {
        if (r && r.error) {
          if (isDup(r.error)) {
            return c.database.from('gallery_members').update({ payload: payload }).eq('member_key', m.id)
              .then(function (r2) { if (r2 && r2.error) throw r2.error; return true; });
          }
          throw r.error;
        }
        return true;
      })
      .then(function () {
        return c.database.from('gallery_published').insert({ member_key: m.id })
          .then(function (r3) { if (r3 && r3.error && !isDup(r3.error)) throw r3.error; return true; });
      });
  }

  function seedDefaults(data) {
    var c = client();
    working = true;
    setStatus('syncing', '正在把名册发到云端…');
    var errs = [];
    return upsertRoster(c, { guild: data.guild, halls: data.halls })
      .then(function () {
        var chain = Promise.resolve(null);
        (data.members || []).forEach(function (m) {
          chain = chain.then(function () {
            return putMember(c, m)['catch'](function (e) {
              var msg = (m && m.name ? m.name + '：' : '') + ((e && e.message) || e);
              errs.push(msg);
              return null;
            });
          });
        });
        return chain;
      })
      .then(function () {
        working = false;
        if (errs.length) {
          setStatus('error', '发布有 ' + errs.length + ' 处失败');
          toast('名册发布失败：' + errs[0]);
        } else {
          toast('初始名册已发布到云端（' + (data.members || []).length + ' 人）');
        }
        return errs.length === 0;
      })['catch'](function (e) { working = false; netFail(e); return false; });
  }

  /* ---------------- 审核（管理者） ---------------- */
  function pendingList() {
    var s = window.GalleryState ? window.GalleryState.get() : null;
    if (!s) return [];
    return (s.members || []).filter(function (m) { return m.__pending; });
  }
  function decide(key, ok, noteText) {
    var c = client();
    if (!c || role !== 'admin') return Promise.resolve(false);
    var s = window.GalleryState.get();
    var m = (s.members || []).filter(function (x) { return x.id === key; })[0];
    var ins = c.database.from('gallery_decisions').insert({
      owner_id: m && m.__owner ? m.__owner : uid(),
      member_key: key, member_name: m ? m.name : '',
      decision: ok ? 'approved' : 'rejected', note: noteText || ''
    });
    var then = ok
      ? ins.then(function (r) {
          if (r && r.error) throw r.error;
          return c.database.from('gallery_published').insert({ member_key: key })
            .then(function (r2) { if (r2 && r2.error && !isDup(r2.error)) throw r2.error; return true; });
        })
      : ins.then(function (r) {
          if (r && r.error) throw r.error;
          return c.database.from('gallery_members').delete().eq('member_key', key)
            .then(function (r2) { if (r2 && r2.error) throw r2.error; return true; });
        });
    return then.then(function () { return cycle(true); })
      .then(function () { toast(ok ? '已过审，上线了' : '已驳回并退回'); return true; })
      ['catch'](function (e) { netFail(e); return false; });
  }

  /* ---------------- 重复投稿清理（管理者） ---------------- */
  function cleanDupes() {
    var c = client();
    if (!c || role !== 'admin' || !dupes.length) return Promise.resolve(0);
    var chain = Promise.resolve(null);
    dupes.slice().forEach(function (d) {
      chain = chain.then(function () {
        return c.database.from('gallery_published').delete().eq('member_key', d.key)
          ['catch'](function () { return null; })
          .then(function () {
            return c.database.from('gallery_members').delete().eq('member_key', d.key)['catch'](function () { return null; });
          });
      });
    });
    return chain.then(function () { return cycle(true); })
      .then(function () { toast('已清掉 ' + dupes.length + ' 条重复投稿'); return dupes.length; })
      ['catch'](function (e) { netFail(e); return 0; });
  }

  /* ---------------- 导出 ---------------- */
  window.Sync = {
    _client: function () { return client(); },
    start: start,
    pull: function () { return cycle(false); },
    push: function () { return schedulePush(); },
    schedulePush: schedulePush,
    status: function () { return st; },
    onChange: function (fn) { listeners.push(fn); fn(st); },
    emit: emit,
    isEnabled: function () { return enabled; },
    user: function () { return st.user; },
    mask: function () { return st.mask; },
    uid: uid,
    role: function () { return role; },
    isAdmin: function () { return role === 'admin'; },
    signedIn: function () { return !!uid(); },
    decisions: function () { return uid() ? decisions : []; },
    pending: pendingList,
    decide: decide,
    dupes: function () { return dupes; },
    cleanDupes: cleanDupes,
    toast: toast,
    fmt: fmt,
    esc: esc,
    signOut: function () { var c = client(); return c ? c.auth.signOut() : Promise.resolve(null); }
  };
})();
