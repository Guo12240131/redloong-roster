/* ============================================================
   heraldry.js — 纹章矢量生成系统
   依据真实纹章学构成：Escutcheon(盾形) + Field(底色) +
   Charge(主图) + Ordinary(几何图记) + Tincture(色记)
   全部为参数化 SVG 字符串，可离线运行、无限缩放
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 基础几何 ---------- */
  const GEO = {
    // 中世纪 heater shield 鸢盾
    shield: 'M10 7 H90 V44 C90 63 76 83 50 97 C24 83 10 63 10 44 Z',
    // 圆头盾（客卿用，区别于本团鸢盾）
    roundel: 'M12 10 H88 V52 C88 74 72 90 50 97 C28 90 12 74 12 52 Z',
    // 鸢尾花饰 fleur-de-lis
    fleur: 'M50 21 C45 33 43 44 45.5 54 C46.5 58.5 53.5 58.5 54.5 54 C57 44 55 33 50 21 Z ' +
           'M45.5 53 C37 51 28 45 26 36.5 C25 30 30.5 27.5 34.5 31.5 C38.5 35.5 43 44 45.5 50 Z ' +
           'M54.5 53 C63 51 72 45 74 36.5 C75 30 69.5 27.5 65.5 31.5 C61.5 35.5 57 44 54.5 50 Z ' +
           'M33 57.5 H67 V63.5 H33 Z ' +
           'M48 63.5 C46 71 44.5 75 42.5 78 H57.5 C55.5 75 54 71 52 63.5 Z',
    // 立剑（正置）
    swordUp: 'M50 16 L54.5 22 V64 H45.5 V22 Z M36 64 H64 V69 H36 Z M47.5 69 H52.5 V86 H47.5 Z',
    // 冠冕
    crown: 'M22 34 L30 16 L40 27 L50 12 L60 27 L70 16 L78 34 Z M24 34 H76 V41 H24 Z',
    // 月桂（左右各一弧）
    laurelL: 'M30 74 C18 62 18 42 28 30 M30 74 C24 60 25 44 32 34',
    laurelR: 'M70 74 C82 62 82 42 72 30 M70 74 C76 60 75 44 68 34',
    // 断剑（见习）
    swordBroken: 'M50 16 L54.5 22 V48 H45.5 V22 Z M40 54 L60 60 L58 66 L38 60 Z M36 42 H64 V47 H36 Z',
    // 连锁双环（客卿）
    chain: 'M34 44 a11 11 0 1 0 0.1 0 Z M66 44 a11 11 0 1 0 0.1 0 Z',
    // 十字（东征十字）
    cross: 'M44 22 H56 V40 H74 V52 H56 V70 H44 V52 H26 V40 H44 Z'
  };

  /* ---------- 色记 Tincture ---------- */
  // 传统纹章色：or(金) argent(银) gules(红) azure(蓝) sable(黑) vert(绿) purpure(紫)
  const TINCTURES = {
    or:      { name: '鎏金 Or',       field: '#3a2c10', charge: '#e8c76a', edge: '#c9a227' },
    argent:  { name: '银白 Argent',   field: '#2a2e33', charge: '#d9dee6', edge: '#8f99a6' },
    gules:   { name: '血红 Gules',    field: '#3d1412', charge: '#c0574c', edge: '#8f2f27' },
    azure:   { name: '忠诚蓝 Azure',  field: '#141f33', charge: '#6c94c4', edge: '#3d628f' },
    sable:   { name: '玄黑 Sable',    field: '#14110f', charge: '#6d6259', edge: '#3a322c' },
    vert:    { name: '希望绿 Vert',   field: '#16261a', charge: '#6f9c72', edge: '#3f6b46' },
    purpure: { name: '紫绒 Purpure',  field: '#241635', charge: '#9b7bc0', edge: '#61417f' },
    ember:   { name: '炉火 Ember',    field: '#3a1c0c', charge: '#ff9a4d', edge: '#c2622a' }
  };
  const TINCTURE_KEYS = Object.keys(TINCTURES);

  /* ---------- 层级 Ranks ---------- */
  const RANKS = {
    lord_commander: {
      label: '大骑士长', en: 'Lord Commander', hall: 'council',
      tier: 1, geo: 'shield', charge: 'fleur', crest: 'crown',
      ornament: 'laurel', dash: false, defaultTincture: 'or'
    },
    knight_captain: {
      label: '骑士长', en: 'Knight Captain', hall: 'council',
      tier: 2, geo: 'shield', charge: 'swordUp', crest: null,
      ornament: 'laurel', dash: false, defaultTincture: 'gules'
    },
    knight: {
      label: '骑士', en: 'Knight', hall: 'order',
      tier: 3, geo: 'shield', charge: 'swordUp', crest: null,
      ornament: null, dash: false, defaultTincture: 'azure'
    },
    squire: {
      label: '见习侍从', en: 'Squire', hall: 'order',
      tier: 4, geo: 'shield', charge: 'swordBroken', crest: null,
      ornament: null, dash: false, defaultTincture: 'sable'
    },
    allied_knight: {
      label: '客卿骑士', en: 'Allied Knight', hall: 'allied',
      tier: 3, geo: 'roundel', charge: 'chain', crest: null,
      ornament: null, dash: true, defaultTincture: 'vert'
    }
  };

  /* ---------- 生成单枚纹章 ---------- */
  /**
   * @param {string} rankKey  层级 key
   * @param {string} tincture 色记 key
   * @param {object} opt      {size, anim}
   */
  function arms(rankKey, tincture, opt) {
    opt = opt || {};
    const r = RANKS[rankKey] || RANKS.knight;
    const t = TINCTURES[tincture] || TINCTURES[r.defaultTincture];
    const size = opt.size || 100;
    const dash = r.dash ? ' stroke-dasharray="4 3"' : '';
    const uid = 'a' + Math.random().toString(36).slice(2, 8);

    let crestSvg = '';
    if (r.crest === 'crown') {
      crestSvg =
        '<path d="' + GEO.crown + '" fill="' + t.charge + '" stroke="' + t.edge + '" stroke-width="1" opacity="0.92" transform="translate(0,-6)"/>';
    }
    let ornSvg = '';
    if (r.ornament === 'laurel') {
      ornSvg =
        '<path d="' + GEO.laurelL + '" fill="none" stroke="' + t.charge + '" stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>' +
        '<path d="' + GEO.laurelR + '" fill="none" stroke="' + t.charge + '" stroke-width="1.6" opacity="0.55" stroke-linecap="round"/>';
    }

    const chargeSvg =
      '<path d="' + GEO[r.charge] + '" fill="' + t.charge + '" stroke="' + t.edge + '" stroke-width="0.8" stroke-linejoin="round"/>';

    return '' +
      '<svg class="arms' + (opt.anim ? ' arms--anim' : '') + '" viewBox="0 0 100 112" width="' + size + '" height="' + size * 1.12 + '" role="img" aria-label="' + r.label + '纹章">' +
        '<defs>' +
          '<linearGradient id="g' + uid + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="' + t.charge + '" stop-opacity="0.16"/>' +
            '<stop offset="100%" stop-color="#000" stop-opacity="0.34"/>' +
          '</linearGradient>' +
        '</defs>' +
        ornSvg +
        crestSvg +
        '<path class="arms__shield" d="' + GEO[r.geo] + '" fill="' + t.field + '" stroke="' + t.edge + '" stroke-width="2.2"' + dash + ' stroke-linejoin="round"/>' +
        '<path class="arms__shield" d="' + GEO[r.geo] + '" fill="url(#g' + uid + ')"/>' +
        chargeSvg +
      '</svg>';
  }

  /* ---------- 公会主纹章（大纹章：盾 + 交叉双剑 + 飘带） ---------- */
  function guildCrest(size) {
    size = size || 160;
    return '' +
      '<svg class="crest" viewBox="0 0 200 210" width="' + size + '" height="' + size * 1.05 + '" role="img" aria-label="公会主纹章">' +
        '<defs>' +
          '<linearGradient id="cgold" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="#e8c76a"/><stop offset="55%" stop-color="#c9a227"/><stop offset="100%" stop-color="#8a6c14"/>' +
          '</linearGradient>' +
        '</defs>' +
        '<g class="crest__swords" stroke="url(#cgold)" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.9">' +
          '<path d="M36 40 L150 176"/><path d="M164 40 L50 176"/>' +
        '</g>' +
        '<path d="' + GEO.crown + '" fill="url(#cgold)" transform="translate(50,-4) scale(1)" opacity="0.95"/>' +
        '<path class="crest__shield" d="M60 30 H140 V76 C140 106 122 134 100 152 C78 134 60 106 60 76 Z" ' +
          'fill="#141110" stroke="url(#cgold)" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="' + GEO.fleur + '" fill="url(#cgold)" transform="translate(50,32) scale(1)" opacity="0.96"/>' +
        '<g class="crest__ribbon" fill="none" stroke="url(#cgold)" stroke-width="2.2" opacity="0.85">' +
          '<path d="M22 168 C60 186 140 186 178 168"/>' +
        '</g>' +
      '</svg>';
  }

  /* ---------- 空肖像占位（纹章剪影） ---------- */
  function portraitPlaceholder(rankKey, tincture, size) {
    const r = RANKS[rankKey] || RANKS.knight;
    const t = TINCTURES[tincture] || TINCTURES[r.defaultTincture];
    return '' +
      '<svg viewBox="0 0 100 100" width="' + (size || 200) + '" height="' + (size || 200) + '" role="img" aria-label="肖像待补">' +
        '<rect width="100" height="100" fill="#151211"/>' +
        '<path d="' + GEO[r.geo] + '" fill="' + t.field + '" stroke="' + t.edge + '" stroke-width="1.6" opacity="0.5" transform="translate(0,6) scale(0.82) translate(11,0)"/>' +
        '<circle cx="50" cy="42" r="15" fill="none" stroke="' + t.charge + '" stroke-width="1.4" opacity="0.35"/>' +
        '<path d="M30 82 C34 62 66 62 70 82" fill="none" stroke="' + t.charge + '" stroke-width="1.4" opacity="0.35"/>' +
        '<text x="50" y="93" font-size="7" fill="' + t.charge + '" opacity="0.4" text-anchor="middle" font-family="serif">待补肖像</text>' +
      '</svg>';
  }

  window.Heraldry = {
    GEO: GEO,
    RANKS: RANKS,
    TINCTURES: TINCTURES,
    TINCTURE_KEYS: TINCTURE_KEYS,
    arms: arms,
    guildCrest: guildCrest,
    portraitPlaceholder: portraitPlaceholder
  };
})();
