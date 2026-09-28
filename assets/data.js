/* ============================================================
   data.js — 默认成员数据（可被 localStorage 覆盖）
   所有字段均可由隐蔽编辑模式改写，改完存 localStorage
   ============================================================ */
(function () {
  'use strict';

  const GUILD = {
    name: '红龙骑士团',
    enName: 'RedLoong',
    crest: 'assets/img/guild_crest.png',
    motto: 'FIDES ET FERRUM',
    mottoCn: '信与铁',
    founded: '建团于圣历 1187 年 · 红龙堡',
    blurb: '我们不以血统论高低，只以誓言与剑锋定座次。'
  };

  const HALLS = [
    { key: 'council', name: '骑士议事厅', en: 'Council Chamber', sub: '内廷 · 执掌者与管理者',
      note: '凡进入此厅者，皆已在红龙堡地窖里，对着炉火宣过誓。' },
    { key: 'order',   name: '骑士团',     en: 'The Order',       sub: '外廷 · 在编骑士与见习侍从',
      note: '盾牌挂在外廷墙上，谁来取走，谁就去守那道缺口。' },
    { key: 'allied',  name: '友军骑士团', en: 'Allied Orders',   sub: '客卿席 · 同盟旗下的他团骑士',
      note: '他团的誓约，与本团的誓约，在战场上等重。' }
  ];

  const MEMBERS = [
    /* ---------- 议事厅 · 内廷 ---------- */
    {
      id: 'm-adrian',
      name: '亚德里安',
      alias: '铁誓',
      fullName: '亚德里安 · 冯 · 红龙',
      rank: 'lord_commander',
      hall: 'council',
      tincture: 'or',
      portrait: '',
      tagline: '把名字刻在誓约石上的人，没有退路。',
      oath: '我以红龙之名起誓：不退、不降、不弃同袍。若有一日我背弃此言，愿我的剑先断。',
      joined: '圣历 1187 年 · 创团',
      weapon: '双手大剑「长夜」· 红龙家传',
      armor: '鎏金鸢盾铠 · 冠冕盔',
      deeds: [
        '创始七人之一，亲手钉下议事厅誓约石',
        '北境缺口之战，独守断桥三昼夜',
        '裁定过 41 次内廷争端，无一翻案'
      ],
      quote: '座次不是荣耀，是你要第一个站出来的位置。'
    },
    {
      id: 'm-seraphina',
      name: '塞拉菲娜',
      alias: '赤绒',
      fullName: '塞拉菲娜 · 赤绒',
      rank: 'knight_captain',
      hall: 'council',
      tincture: 'gules',
      portrait: '',
      tagline: '副会长。她管的不是人，是人心。',
      oath: '我守内廷的秩序，也守每一个骑士说不出口的那一句。',
      joined: '圣历 1189 年',
      weapon: '骑兵长枪 · 单手配剑',
      armor: '暗红丝绒罩袍 · 轻甲',
      deeds: [
        '重整外廷编制，把溃散的第三队重新捏成一支',
        '连续五季主持新骑士授剑礼',
        '团内唯一同时握着议事厅钥匙与外廷名册的人'
      ],
      quote: '骑士不怕死，怕的是死了没人记得名字。我负责记。'
    },
    {
      id: 'm-godric',
      name: '戈德里克',
      alias: '铁律',
      fullName: '戈德里克 · 铁律',
      rank: 'knight_captain',
      hall: 'council',
      tincture: 'sable',
      portrait: '',
      tagline: '管理者。规矩写下来，就得有人去得罪人。',
      oath: '我不求被喜欢，只求团还在。',
      joined: '圣历 1189 年',
      weapon: '战锤 · 铁面盔',
      armor: '玄黑重甲 · 无纹章',
      deeds: [
        '起草《外廷守则》十七条，沿用至今',
        '处置违纪 63 起，其中 9 起是自己人',
        '守着那间没人愿意进的账房'
      ],
      quote: '温和的人定不了规矩，但定规矩的人会孤单。'
    },

    /* ---------- 骑士团 · 外廷 ---------- */
    {
      id: 'm-rowan',
      name: '罗温',
      alias: '长弓',
      fullName: '罗温 · 灰木',
      rank: 'knight',
      hall: 'order',
      tincture: 'azure',
      portrait: '',
      tagline: '他从不站在最前面，但最前面的都活着回来。',
      oath: '我的箭替前面的人活着。',
      joined: '圣历 1190 年',
      weapon: '紫杉长弓 · 白羽箭',
      armor: '轻皮甲 · 钢蓝罩袍',
      deeds: [
        '断桥之战三箭定旗，扭转缺口',
        '团内箭术教习，带出 12 名弓手',
        '雪夜独行两百里送回战报'
      ],
      quote: '射得准不算本事，知道什么时候不射才算。'
    },
    {
      id: 'm-lysandra',
      name: '莉桑德拉',
      alias: '银锋',
      fullName: '莉桑德拉 · 银锋',
      rank: 'knight',
      hall: 'order',
      tincture: 'argent',
      portrait: '',
      tagline: '出剑最快的一个，也是包扎最细的一个。',
      oath: '快,是为了少流血——包括敌人的。',
      joined: '圣历 1191 年',
      weapon: '细剑「银锋」· 左手短匕',
      armor: '银白轻甲 · 无面甲',
      deeds: [
        '外廷比武三届连冠',
        '带回 27 名伤员，无一死于途中',
        '首创「双刃急救法」，写入《外廷守则》'
      ],
      quote: '剑快一瞬，缝针就能少三针。'
    },
    {
      id: 'm-bram',
      name: '布拉姆',
      alias: '碎石',
      fullName: '布拉姆 · 碎石',
      rank: 'knight',
      hall: 'order',
      tincture: 'ember',
      portrait: '',
      tagline: '盾墙第一块砖，谁撞谁碎。',
      oath: '我站着，后面的人就还在。',
      joined: '圣历 1190 年',
      weapon: '塔盾 · 短柄战斧',
      armor: '重装板甲 · 炉火纹罩袍',
      deeds: [
        '缺口之战扛下七次冲阵，盾裂人未退',
        '训练营首席教习，专教新人「怎么不被打死」',
        '全团唯一把塔盾当主武器还活到现在的'
      ],
      quote: '躲是本能，站住是本事。'
    },
    {
      id: 'm-elin',
      name: '艾琳',
      alias: '夜莺',
      fullName: '艾琳 · 夜莺',
      rank: 'knight',
      hall: 'order',
      tincture: 'purpure',
      portrait: '',
      tagline: '你听到她的时候，通常已经晚了。',
      oath: '我在暗处，是因为有人得在明处活着。',
      joined: '圣历 1192 年',
      weapon: '双短刃 · 烟丸',
      armor: '紫绒软甲 · 消音裹布',
      deeds: [
        '三度潜入敌营，带回完整布防图',
        '唯一被内廷允许不参加点名的骑士',
        '救回过两名被俘的见习侍从'
      ],
      quote: '光越亮，影子越好用。'
    },

    /* ---------- 见习侍从 ---------- */
    {
      id: 'm-tobias',
      name: '托比亚斯',
      alias: '半刃',
      fullName: '托比亚斯 · 半刃',
      rank: 'squire',
      hall: 'order',
      tincture: 'sable',
      portrait: '',
      tagline: '他的剑只开了一半刃——按规矩,得自己磨完。',
      oath: '我把另一半刃磨出来那天，再来领纹章。',
      joined: '圣历 1194 年',
      weapon: '未开刃练习剑 · 侍从短刀',
      armor: '玄黑布衣 · 无甲',
      deeds: [
        '布拉姆的随侍,扛了两年盾',
        '开始在训练营带更年轻的见习生',
        '距授剑礼还差一次实战记录'
      ],
      quote: '断剑不是耻辱,是还没磨完。'
    },
    {
      id: 'm-nella',
      name: '妮拉',
      alias: '新铁',
      fullName: '妮拉 · 新铁',
      rank: 'squire',
      hall: 'order',
      tincture: 'vert',
      portrait: '',
      tagline: '入团三个月,已经敢跟骑士长顶嘴。',
      oath: '我不要别人让着我,我要打赢。',
      joined: '圣历 1196 年',
      weapon: '练习长剑 · 木盾',
      armor: '希望绿罩袍 · 半甲',
      deeds: [
        '入营首月打完整套基础课目',
        '唯一敢在比武中挑战骑士长的见习生',
        '被莉桑德拉记名收作弟子'
      ],
      quote: '他们说我急。剑不等人。'
    },

    /* ---------- 友军骑士团 · 客卿 ---------- */
    {
      id: 'm-cassian',
      name: '卡西安',
      alias: '赤链',
      fullName: '卡西安 · 赤链（赤链骑士团）',
      rank: 'allied_knight',
      hall: 'allied',
      tincture: 'gules',
      portrait: '',
      tagline: '他团的旗,插在我们的墙上。',
      oath: '赤链与红龙,在缺口处是一根链。',
      joined: '圣历 1193 年 · 缔盟',
      weapon: '链枷 · 赤纹圆盾',
      armor: '赤链团甲 · 客卿绶带',
      deeds: [
        '缺口之战率赤链前锋先行抵达',
        '两团联合演习的常驻对手',
        '把赤链的链枷术教给了布拉姆'
      ],
      quote: '盟友不是来蹭火的,是来添柴的。'
    },
    {
      id: 'm-yvelle',
      name: '伊薇尔',
      alias: '霜枝',
      fullName: '伊薇尔 · 霜枝（白鹿骑士团）',
      rank: 'allied_knight',
      hall: 'allied',
      tincture: 'azure',
      portrait: '',
      tagline: '白鹿的医师。她治的人都欠她一条命。',
      oath: '白鹿不举剑,但白鹿救人。',
      joined: '圣历 1194 年 · 缔盟',
      weapon: '医刀 · 药囊（不佩战剑）',
      armor: '白鹿团白袍 · 客卿绶带',
      deeds: [
        '缺口之战后连续救治六日未眠',
        '把白鹿的止血方给了莉桑德拉',
        '两团共享伤药配方的推动者'
      ],
      quote: '我不杀敌,我只把被杀的人抢回来。'
    }
  ];

  window.GuildData = { GUILD: GUILD, HALLS: HALLS, MEMBERS: MEMBERS };
})();
