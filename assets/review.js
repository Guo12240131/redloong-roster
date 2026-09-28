/* ============================================================
   review.js — 登录面板 / 审核队列 / 我的投稿
   ------------------------------------------------------------
   依赖 sync.js 暴露的 window.Sync。按钮能不能点由 RLS 决定，
   这里只负责「按角色把该露的露出来、该藏的藏起来」。
   ============================================================ */
(function () {
  'use strict';

  var ui = { tab: 'pw', mode: 'login', pending: null, maskOnly: '' };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return window.Sync ? window.Sync.esc(s) : String(s); }
  function toast(m) { if (window.Sync) window.Sync.toast(m); }

  /* ---------------- 登录面板 ---------------- */
  function openAuth() {
    if (!window.Sync || !window.Sync.isEnabled()) { toast('离线版不支持云同步，请用在线网址打开'); return; }
    ui.tab = window.Sync.signedIn() ? 'me' : 'pw';
    paintAuth();
    $('#syncModal').classList.add('is-open');
  }
  function closeAuth() { $('#syncModal').classList.remove('is-open'); }

  function field(label, ctl) {
    return '<div class="field"><label>' + esc(label) + '</label>' + ctl + '</div>';
  }
  /* 面板右上角的 ✕。三个弹窗共用一套，别只给编辑表单做——
     不然用户养成了「点空白关窗」的肌肉记忆，回头又踩编辑表单的坑。 */
  function xBtn() {
    return '<button class="modal__x" type="button" data-act="close" aria-label="关闭" title="关闭">✕</button>';
  }
  function foot(okText) {
    return '<div class="modal__foot">' +
             '<button class="ghost" data-act="close">关闭</button>' +
             '<button class="primary" data-act="submit">' + esc(okText) + '</button>' +
           '</div>';
  }

  function paintAuth(msg, bad) {
    var panel = $('#syncPanel');
    if (!panel) return;
    var body, S = window.Sync;

    if (ui.tab === 'me') {
      var u = S.user() || {};
      var mail = ui.maskOnly || S.mask();
      var roleText = { guest: '未登录', author: '投稿人', admin: '管理者' }[S.role()] || '—';
      body =
        xBtn() +
        '<h3 class="modal__title">云同步</h3>' +
        '<div class="field"><label>当前身份</label><div class="readonly">' + esc(mail) + '</div></div>' +
        '<div class="field"><label>权限</label><div class="readonly">' + esc(roleText) + '</div></div>' +
        '<div class="field"><label>名册状态</label><div class="readonly">' + esc(S.status().text || '—') + '</div></div>' +
        (S.role() === 'author'
          ? '<div class="field__hint">你递交的新成员要等管理者过审才会对外显示；已经通过的那部分，你自己随时能改，不用再审。</div>'
          : (S.role() === 'admin'
            ? '<div class="field__hint">你是管理者：录入即上线，也能在「审核队列」里处理别人的投稿。</div>'
            : '')) +
        '<div class="btnline"><button class="minibtn" data-act="mine">我的投稿</button>' +
        (S.isAdmin() ? '<button class="minibtn" data-act="queue">审核队列</button>' : '') +
        '<button class="minibtn" data-act="pull">从云端拉取</button></div>' +
        '<div class="modal__foot">' +
          '<button class="ghost" data-act="signout">退出登录</button>' +
          '<button class="primary" data-act="close">收起</button>' +
        '</div>';
    } else {
      var t = function (id, label) {
        return '<button class="tab' + (ui.tab === id ? ' is-on' : '') + '" data-act="tab-' + id + '">' + esc(label) + '</button>';
      };
      body =
        xBtn() +
        '<h3 class="modal__title">云同步 · 登录</h3>' +
        '<div class="tabs">' + t('pw', '密码登录') + t('otp', '邮箱验证码') + t('up', '注册') + '</div>';

      if (ui.tab === 'pw') {
        body +=
          field('邮箱', '<input type="email" data-f="email" autocomplete="username" placeholder="you@example.com">') +
          field('密码', '<div class="pwline">' +
              '<input type="password" data-f="password" autocomplete="current-password" placeholder="登录密码">' +
              '<button class="pweye" type="button" data-act="peek" aria-label="显示密码">👁</button>' +
            '</div>') +
          '<div class="authline"><a data-act="forget">忘记密码？</a></div>' + foot('登录');
      } else if (ui.tab === 'otp') {
        body +=
          field('邮箱', '<input type="email" data-f="email" autocomplete="username" placeholder="you@example.com">') +
          field('验证码', '<input type="text" data-f="code" inputmode="numeric" autocomplete="one-time-code" placeholder="邮件里的 6 位数字">') +
          '<div class="btnline"><button class="minibtn" data-act="send">获取验证码</button>' +
          (ui.pending && ui.pending.resendIn ? '<span class="cooldown">' + ui.pending.resendIn + ' 秒后可重发</span>' : '') +
          '</div>' +
          sendHint() +
          foot('登录 / 注册');
      } else if (ui.tab === 'up') {
        body +=
          field('邮箱', '<input type="email" data-f="email" autocomplete="username" placeholder="you@example.com">') +
          field('密码', '<div class="pwline">' +
              '<input type="password" data-f="password" autocomplete="new-password" placeholder="至少 8 位，含字母和数字">' +
              '<button class="pweye" type="button" data-act="peek" aria-label="显示密码">👁</button>' +
            '</div>' +
            '<div class="field__hint">密码要求：<b>至少 8 位</b>，且同时包含<b>字母</b>和<b>数字</b>；' +
            '可用符号（如 . _ @ #）但<b>不要有空格</b>。例：Knight2026</div>') +
          field('验证码', '<input type="text" data-f="code" inputmode="numeric" autocomplete="one-time-code" placeholder="先点下面获取验证码">') +
          '<div class="btnline"><button class="minibtn" data-act="send">获取验证码</button>' +
          (ui.pending && ui.pending.resendIn ? '<span class="cooldown">' + ui.pending.resendIn + ' 秒后可重发</span>' : '') +
          '</div>' +
          sendHint() +
          foot('注册');
      } else if (ui.tab === 'forget') {
        body +=
          field('邮箱', '<input type="email" data-f="email" placeholder="注册时用的邮箱">') +
          (ui.pending
            ? field('邮件里的验证码', '<input type="text" data-f="code" inputmode="numeric" autocomplete="one-time-code" placeholder="6 位数字">') +
              field('新密码', '<div class="pwline">' +
                '<input type="password" data-f="password" autocomplete="new-password" placeholder="至少 8 位，含字母和数字">' +
                '<button class="pweye" type="button" data-act="peek" aria-label="显示密码">👁</button>' +
              '</div>' +
              '<div class="field__hint">新密码同样要求：<b>至少 8 位</b> + <b>字母</b> + <b>数字</b>，不含空格。</div>')
            : '<div class="btnline"><button class="minibtn" data-act="send-reset">发送重置邮件</button></div>') +
          '<div class="authline"><a data-act="back">← 回到登录</a></div>' +
          foot(ui.pending ? '确认新密码' : '下一步');
      }
      body += '<div class="authnote">名册谁都能看；只有管理者能改上线名单。管理者白名单还空着时，第一个登录的人自动成为管理者。</div>';
    }

    snapshot();                                  // 重绘前留一份草稿，下面回填
    panel.innerHTML = '<div class="errbox' + (bad ? ' is-bad' : '') + '" id="syncErr">' + (msg ? esc(msg) : '') + '</div>' + body;
    restoreDraft();
  }

  function val(f) {
    var i = $('#syncPanel [data-f="' + f + '"]');
    return i ? i.value.trim() : '';
  }
  function raw(f) {
    var i = $('#syncPanel [data-f="' + f + '"]');
    return i ? i.value : '';
  }
  /* 面板是 innerHTML 整块重绘的，一重绘输入框就全是新的空壳。
     所以「获取验证码 → 重绘」这一下会把用户刚敲的邮箱、密码抹掉。
     对策：重绘前把草稿捞进 ui.draft，重绘后回填。
     密码必须走 raw()（不去空格），不然用户设的 "  Knight2026  " 会被悄悄改掉。 */
  function snapshot() {
    var d = {};
    ['email', 'password', 'code'].forEach(function (f) {
      var i = $('#syncPanel [data-f="' + f + '"]');
      if (i) d[f] = i.value;
    });
    ui.draft = d;
  }
  function restoreDraft() {
    var d = ui.draft;
    if (!d) return;
    ['email', 'password', 'code'].forEach(function (f) {
      var i = $('#syncPanel [data-f="' + f + '"]');
      if (i && d[f] != null && !i.value) i.value = d[f];
    });
  }
  // 邮箱一旦改过，之前拿到的验证码就不算数了，必须重新获取
  function draftEmail() { return String((ui.draft && ui.draft.email) || '').trim(); }
  function sendHint() {
    if (!ui.pending) return '';
    var mismatch = draftEmail() && draftEmail() !== ui.pending.email;
    if (mismatch) {
      return '<div class="field__hint field__hint--warn">' +
             '你改了邮箱：现在填的是 ' + esc(draftEmail()) + '，验证码却发给了 ' +
             esc(ui.pending.email) + '。请为当前邮箱重新获取一次。</div>';
    }
    return '<div class="field__hint">验证码已发往 <b>' + esc(ui.pending.email) +
           '</b>，10 分钟内有效。</div>';
  }
  function say(msg, bad) {
    var el = $('#syncErr');
    if (el) { el.textContent = msg; el.className = 'errbox' + (bad ? ' is-bad' : ''); }
  }

  function afterSignIn(r) {
    if (!r || r.error) { say('登录失败：' + ((r && r.error && r.error.message) || '请检查邮箱与密码'), true); return; }
    ui.pending = null;
    ui.draft = null;
    return window.Sync.pull().then(function () {
      ui.tab = 'me';
      paintAuth('登录成功 · ' + (window.Sync.status().text || ''));
      refreshBar();
    });
  }

  /* ---------- 密码格式校验 ----------
     要求：≥8 位、字母+数字、不含空格。
     另有两条本机实测踩过的坑，一并挡在这里，免得报错全是英文看不懂：
       ① 超长密码会被拒（本机实测 32 位以上不通过）→ 上限 24 位留足余量
       ② 邮箱密码是「哈希后」再校验的，前端长度判断和后端不是一回事 → 文案写清楚别用长密码 */
  function pwProblem(p) {
    if (!p) return '密码不能为空（注册必须设密码）';
    if (p.length < 8) return '密码太短：至少要 8 位，现在只有 ' + p.length + ' 位';
    if (p.length > 24) return '密码太长：请控制在 24 位以内（本机实测过长会被服务端拒绝）';
    if (/\s/.test(p)) return '密码里不能有空格（首尾也算），检查一下输入法';
    if (!/[A-Za-z]/.test(p)) return '密码要有字母：至少 1 个 A-Z / a-z';
    if (!/[0-9]/.test(p)) return '密码要有数字：至少 1 个 0-9';
    return '';
  }

  /* 重发冷却：防止连点把验证码刷爆，也顺带提示「已发出去了」 */
  function startCooldown() {
    if (!ui.pending) return;
    ui.pending.resendIn = 60;
    clearInterval(ui.cdTimer);
    ui.cdTimer = setInterval(function () {
      if (!ui.pending || !ui.pending.resendIn) { clearInterval(ui.cdTimer); return; }
      ui.pending.resendIn -= 1;
      if (ui.pending.resendIn <= 0) { clearInterval(ui.cdTimer); ui.pending.resendIn = 0; }
      var el = document.querySelector('.cooldown');
      if (el) el.textContent = ui.pending.resendIn ? (ui.pending.resendIn + ' 秒后可重发') : '';
    }, 1000);
  }

  function bindAuthPanel() {
    var panel = $('#syncPanel');
    if (!panel) return;
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act;
      var S = window.Sync;
      var c = Cloud();                 // 云客户端只有 sync.js 里有那份实例
      if (!c) { say('离线版不支持登录', true); return; }

      if (act === 'close') { closeAuth(); return; }
      if (act === 'mine') { closeAuth(); renderMine(); return; }
      if (act === 'queue') { closeAuth(); renderQueue(); return; }
      if (act === 'peek') {
        var pw = $('#syncPanel [data-f="password"]');
        if (!pw) return;
        // 切 type 不改 value，切换时临时把焦点收回来免得光标乱跳
        pw.type = (pw.type === 'password') ? 'text' : 'password';
        b.textContent = (pw.type === 'password') ? '👁' : '🙈';
        return;
      }
      if (act.indexOf('tab-') === 0) { snapshot(); ui.tab = act.slice(4); ui.pending = null; paintAuth(); return; }
      if (act === 'back') { snapshot(); ui.tab = 'pw'; ui.pending = null; paintAuth(); return; }
      if (act === 'forget') { snapshot(); ui.tab = 'forget'; ui.pending = null; paintAuth(); return; }
      if (act === 'pull') { say('正在从云端拉取…'); S.pull().then(function () { paintAuth(S.status().text || '已拉取'); refreshBar(); }); return; }
      if (act === 'signout') {
        c.auth.signOut().then(function () {
          ui.tab = 'pw'; ui.pending = null; closeAuth(); refreshBar();
          toast('已退出登录');
        });
        return;
      }
      if (act === 'send' || act === 'send-reset') {
        var email = val('email');
        if (!email) { say('先填邮箱', true); return; }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { say('邮箱格式不对，检查一下有没有打错', true); return; }
        // 「注册」这页密码是必填的：注册前先把格式挡住，别等邮箱验证码发出去了才发现密码不合格
        if (ui.tab === 'up') {
          var pwBad = pwProblem(raw('password'));
          if (pwBad) { say(pwBad, true); return; }
        }
        snapshot();
        say('正在发送…');
        if (act === 'send-reset') {
          c.auth.resetPasswordForEmail(email).then(function (r) {
            if (r && r.error) { say('发送失败：' + r.error.message, true); return; }
            ui.pending = { email: email, reset: true, data: r.data };
            paintAuth('重置邮件已发出，把邮件里的验证码填进下面');
          });
          return;
        }
        c.auth.sendOtp({ email: email }).then(function (r) {
          if (r && r.error) { say('发送失败：' + r.error.message, true); return; }
          ui.pending = { email: email, verificationId: r.data.verificationId, isExistingUser: !!r.data.isExistingUser };
          startCooldown();
          paintAuth('验证码已发往 ' + email + '（邮箱和密码都给你留着，不用重填）');
        });
        return;
      }
      if (act === 'submit') {
        if (ui.tab === 'pw') {
          if (!val('email')) { say('先填邮箱', true); return; }
          if (!raw('password')) { say('先填密码', true); return; }
          say('正在登录…');
          c.auth.signInWithPassword({ email: val('email'), password: raw('password') }).then(afterSignIn);
          return;
        }
        if (ui.tab === 'otp' || ui.tab === 'up') {
          var p = ui.pending;
          if (!p || p.email !== val('email')) { say('请先为这个邮箱获取验证码', true); return; }
          if (!val('code')) { say('把邮件里的验证码填进来', true); return; }
          if (ui.tab === 'up') {
            var bad = pwProblem(raw('password'));
            if (bad) { say(bad, true); return; }
          }
          say('正在校验…');
          c.auth.verifyOtp({
            email: p.email,
            verificationId: p.verificationId,
            isExistingUser: p.isExistingUser,
            token: val('code'),
            password: p.isExistingUser ? undefined : (raw('password') || undefined)
          }).then(afterSignIn);
          return;
        }
        if (ui.tab === 'forget') {
          if (!ui.pending || !ui.pending.data) { say('先发送重置邮件', true); return; }
          var badPw = pwProblem(raw('password'));
          if (badPw) { say(badPw, true); return; }
          say('正在设置新密码…');
          ui.pending.data.updateUser({ nonce: val('code'), password: raw('password') }).then(function (r) {
            if (r && r.error) { say('设置失败：' + r.error.message, true); return; }
            return afterSignIn(r);
          });
          return;
        }
      }
    });

    var modal = $('#syncModal');
    // 不给背景绑定「点一下关掉」：登录要么点 ✕ / 关闭，要么按 Esc。
    // 表单里敲了一半的东西，不该被一次误触抹掉。
    // （原来那行 modal click → closeAuth() 已删，别再顺手加回来）
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeAuth();
    });
  }

  /* sync.js 里有唯一的云客户端实例，这里取现成的用 */
  function Cloud() { return window.Sync && window.Sync._client ? window.Sync._client() : null; }

  /* ---------------- 审核队列（管理者） ---------------- */
  function renderQueue() {
    if (!window.Sync || !window.Sync.isAdmin()) { toast('只有管理者能开审核队列'); return; }
    var list = window.Sync.pending();
    var dup = window.Sync.dupes ? window.Sync.dupes() : [];
    var body;
    if (!list.length && !dup.length) {
      body = xBtn() + '<h3 class="modal__title">审核队列</h3><div class="readonly">没有待审投稿。</div>' +
             '<div class="modal__foot"><button class="primary" data-act="close">知道了</button></div>';
    } else {
      var H = window.Heraldry;
      body = xBtn() + '<h3 class="modal__title">审核队列 · ' + list.length + ' 份待审' +
             (dup.length ? ' · ' + dup.length + ' 条重复' : '') + '</h3>' +
        (dup.length
          ? '<div class="dupbox"><b>发现重复投稿：同一姓名被递交了多次</b>' +
            dup.map(function (d) {
              return '<span>' + esc(d.name || '(未命名)') + '</span>';
            }).join('、') +
            '<div class="btnline"><button class="minibtn minibtn--no" data-act="clean-dup">清掉重复的（只留一条）</button></div>' +
            '<div class="field__hint">名册上已经只显示一条了；点这里是把云端多余的记录真正删掉。</div></div>'
          : '') +
        (list.length
          ? list.map(function (m) {
          var r = H.RANKS[m.rank] || H.RANKS.knight;
          return '<div class="submission" data-key="' + esc(m.id) + '">' +
                   '<div class="submission__head">' +
                     '<b>' + esc(m.name) + '</b><em>' + esc(r.label) + '</em>' +
                     '<span class="submission__by">投稿 ' + esc(String(m.__owner || '').slice(0, 8)) + '</span>' +
                   '</div>' +
                   '<div class="submission__tag">' + esc(m.tagline || '') + '</div>' +
                   '<div class="submission__oath">' + esc(m.oath || '') + '</div>' +
                   (m.portrait ? '<img class="submission__img" src="' + esc(m.portrait) + '" alt="">' : '') +
                   '<input type="text" data-note="' + esc(m.id) + '" placeholder="给投稿人的回话（可留空）">' +
                   '<div class="btnline">' +
                     '<button class="minibtn minibtn--ok" data-act="approve" data-key="' + esc(m.id) + '">通过 · 上线</button>' +
                     '<button class="minibtn minibtn--no" data-act="reject" data-key="' + esc(m.id) + '">驳回</button>' +
                     '<button class="minibtn" data-act="edit-sub" data-key="' + esc(m.id) + '">先改一改</button>' +
                   '</div>' +
                 '</div>';
          }).join('')
          : '') +
        '<div class="modal__foot"><button class="ghost" data-act="close">关闭</button></div>';
    }
    $('#queuePanel').innerHTML = body;
    $('#queueModal').classList.add('is-open');
  }
  function closeQueue() { $('#queueModal').classList.remove('is-open'); }

  function bindQueuePanel() {
    var panel = $('#queuePanel');
    if (!panel) return;
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var act = b.dataset.act, key = b.dataset.key;
      if (act === 'close') { closeQueue(); return; }
      if (act === 'clean-dup') {
        b.disabled = true;
        window.Sync.cleanDupes().then(function () {
          closeQueue(); renderQueue();
        });
        return;
      }
      if (act === 'edit-sub') {
        closeQueue();
        if (window.Editor) window.Editor.edit(key);
        return;
      }
      var noteEl = panel.querySelector('[data-note="' + key + '"]');
      var noteVal = noteEl ? noteEl.value.trim() : '';
      b.disabled = true;
      window.Sync.decide(key, act === 'approve', noteVal).then(function () {
        closeQueue();
        renderQueue();
      });
    });
    var modal = $('#queueModal');
    // 同样不在背景上绑关闭：队列里可能正敲着给投稿人的回话
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('is-open')) closeQueue();
    });
  }

  /* ---------------- 我的投稿 ---------------- */
  function renderMine() {
    var S = window.Sync;
    if (!S || !S.signedIn()) { toast('先登录再看投稿状态'); return; }
    var uid = S.uid();
    var list = (window.GalleryState.get().members || []).filter(function (m) { return m.__owner === uid; });
    var ds = S.decisions();
    var body =
      xBtn() +
      '<h3 class="modal__title">我的投稿</h3>' +
      (list.length
        ? list.map(function (m) {
            return '<div class="submission submission--flat">' +
                     '<div class="submission__head"><b>' + esc(m.name) + '</b>' +
                     '<span class="tag ' + (m.__pending ? 'tag--wait' : 'tag--live') + '">' +
                     (m.__pending ? '待审核' : '已上线') + '</span></div>' +
                   '</div>';
          }).join('')
        : '<div class="readonly">你还没有递交过成员。</div>') +
      '<div class="field"><label>管理者回执</label>' +
      (ds.length
        ? ds.map(function (d) {
            return '<div class="decision decision--' + esc(d.decision) + '">' +
                     '<b>' + esc(d.member_name || d.member_key) + '</b>' +
                     '<span>' + (d.decision === 'approved' ? '已通过' : '已驳回') + '</span>' +
                     (d.note ? '<em>「' + esc(d.note) + '」</em>' : '') +
                     '<i>' + esc(window.Sync.fmt(d.created_at)) + '</i>' +
                   '</div>';
          }).join('')
        : '<div class="field__hint">还没有回执。</div>') +
      '</div>' +
      '<div class="modal__foot"><button class="primary" data-act="close">关闭</button></div>';
    $('#queuePanel').innerHTML = body;
    $('#queueModal').classList.add('is-open');
  }

  /* ---------------- 工具条按角色刷新 ---------------- */
  function refreshBar() {
    var S = window.Sync;
    var role = S ? S.role() : 'guest';
    var signed = S ? S.signedIn() : false;
    function show(sel, on) {
      var el = $(sel);
      if (el) el.style.display = on ? '' : 'none';
    }
    // 未登录 = 单机全权；登录后按角色收敛
    var localMode = !signed;
    show('#btnQueue', localMode ? false : role === 'admin');
    show('#btnMine', signed);
    show('#btnGuild', localMode || role === 'admin');
    show('#btnReset', localMode || role === 'admin');
    show('#btnImport', localMode);
    // 工具条提示语
    var hint = $('#editHint');
    if (hint) {
      hint.textContent = signed
        ? (role === 'admin' ? '管理者 · 改动直传云端' : '投稿人 · 新递交需审核')
        : '双击团徽 · Ctrl+Shift+E · #forge 切换';
    }
  }

  if (window.Sync) window.Sync.openAuth = openAuth;
  window.Review = { openAuth: openAuth, queue: renderQueue, mine: renderMine, refreshBar: refreshBar, init: function () {
    bindAuthPanel();
    bindQueuePanel();
    refreshBar();
    if (window.Sync) window.Sync.onChange(refreshBar);
  } };
  setTimeout(function () {
    if (window.Review) window.Review.init();
    if (window.Sync) window.Sync.openAuth = window.Sync.openAuth || openAuth;
  }, 0);
})();
