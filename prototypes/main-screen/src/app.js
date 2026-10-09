/* Эскиз «Библия наглядно»: маршрутизация по #адресу (история браузера), вклейки стихов,
   поиск, варианты главного экрана, журнал действий для ведущего. Без библиотек. */
(function () {
  'use strict';
  var D = JSON.parse(document.getElementById('data').textContent);
  var root = document.documentElement;
  var main = document.getElementById('main');

  // ── Хранилище: всё в try/catch, эскиз работает и без него
  var mem = {};
  var LS = {
    get: function (k, d) {
      try { var v = localStorage.getItem(k); return v === null ? (k in mem ? mem[k] : d) : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : d; }
    },
    set: function (k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* без хранилища */ } },
    del: function (k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* без хранилища */ } }
  };

  var params;
  try { params = new URLSearchParams(location.search); } catch (e) { params = { get: function () { return null; } }; }
  var variant = params.get('v');
  if (['ab', 'v', 'd'].indexOf(variant) < 0) variant = 'ab';

  // ── Имена лиц
  var PN = {};
  D.persons.forEach(function (p) { PN[p[0]] = p[1][0]; });
  PN['p-iosif-muzh-marii'] = 'Иосиф, муж Марии';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function stubHref(label) { return '#/stub/' + encodeURIComponent(label); }

  // ── Журнал
  var LOGKEY = 'bn-sketch-log';
  var log = LS.get(LOGKEY, []);
  if (!Array.isArray(log)) log = [];
  var countEl = document.querySelector('[data-h-count]');
  function addLog(type, data) {
    var e = { t: new Date().toISOString(), type: type, variant: variant, route: location.hash || '#/',
      width: window.innerWidth, layer: root.getAttribute('data-layer'), participant: LS.get('bn-part', '') };
    for (var k in data) if (data[k] !== undefined) e[k] = data[k];
    log.push(e);
    if (log.length > 20000) log.shift();
    LS.set(LOGKEY, log);
    if (countEl) countEl.textContent = String(log.length);
  }
  function labelOf(el) {
    var s = el.getAttribute('aria-label') || el.getAttribute('data-name') || el.textContent || el.value || '';
    return s.replace(/\s+/g, ' ').trim().slice(0, 80);
  }
  document.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-host]')) return;
    var el = ev.target.closest('a,button,summary,select,input');
    addLog('click', el ? { el: el.tagName.toLowerCase(), label: labelOf(el), href: el.getAttribute('href') || undefined,
      x: Math.round(ev.clientX), y: Math.round(ev.clientY) }
      : { el: 'none', label: (ev.target.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40), x: Math.round(ev.clientX), y: Math.round(ev.clientY) });
  }, true);

  // ── Слой и тема
  function setLayer(v, silent) {
    root.setAttribute('data-layer', v);
    var sel = document.querySelector('[data-layer-select]');
    if (sel) sel.value = v;
    LS.set('bn-layer', v);
    if (!silent) addLog('layer', { value: v });
  }
  function setTheme(v) {
    if (v) root.setAttribute('data-theme', v); else root.removeAttribute('data-theme');
    LS.set('bn-theme', v);
  }
  setLayer(LS.get('bn-layer', 'simple'), true);
  setTheme(LS.get('bn-theme', ''));
  document.querySelector('[data-layer-select]').addEventListener('change', function (e) { setLayer(e.target.value); });

  // ── Стихи: адреса и вклейки
  var BOOKS = {};
  D.books.forEach(function (b) { BOOKS[b[0].toLowerCase()] = b[0]; });
  function normBook(s) {
    var t = s.replace(/\s+/g, '').toLowerCase().replace(/ё/g, 'е');
    if (BOOKS[t]) return BOOKS[t];
    for (var i = 0; i < D.books.length; i++) {
      var full = D.books[i][1].replace(/\s+/g, '').toLowerCase().replace(/ё/g, 'е');
      if (t.length >= 3 && (full === t || full.indexOf(t) === 0)) return D.books[i][0];
    }
    for (var j = 0; j < D.books.length; j++) {
      var ab = D.books[j][0].toLowerCase();
      if (t.length >= 2 && t.indexOf(ab) === 0 && t.length - ab.length <= 2) return D.books[j][0];
    }
    return null;
  }
  function expandRef(ref) {
    var out = [], book = null;
    ref.split(/;\s*/).forEach(function (part) {
      var m = part.trim().match(/^(?:(\d?\s*[А-ЯЁа-яё]+)\.?\s+)?(\d+)(?::([\d,\-–\s]+))?$/);
      if (!m) return;
      if (m[1]) book = normBook(m[1]);
      if (!book) return;
      if (!m[3]) return;
      m[3].split(',').forEach(function (piece) {
        var ab = piece.trim().replace('–', '-').split('-');
        var a = parseInt(ab[0], 10), z = parseInt(ab[1] || ab[0], 10);
        for (var v = a; v <= z && v - a < 200; v++) out.push(book + ' ' + m[2] + ':' + v);
      });
    });
    return out;
  }
  function dispKey(k) { return k.replace(/^(\d)(\S)/, '$1 $2').replace(' ', ' '); }
  function verseHTML(t) {
    return esc(t).replace(/\[[^\]]*\]/g, function (m) { return '<span class="br">' + m + '</span>'; })
      .replace(/\([^)]*\)/g, function (m) { return '<span class="br">' + m + '</span>'; });
  }
  function hasBr(t) { return /[\[\(]/.test(t); }
  function insetFor(ref) {
    var keys = expandRef(ref);
    var box = document.createElement('div');
    box.className = 'inset';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', 'Стихи: ' + ref);
    var br = false, html = '';
    keys.forEach(function (k, i) {
      var t = D.verses[k];
      if (t && hasBr(t)) br = true;
      html += '<p class="v"' + (i >= 3 ? ' hidden' : '') + '><span class="vadr">' + esc(dispKey(k)) + '</span>' +
        (t ? verseHTML(t) : '<span class="vnone">Текста этого стиха в эскизе нет.</span>') + '</p>';
    });
    if (keys.length > 3) html += '<button type="button" class="vmore">ещё ' + (keys.length - 3) + ' ' + plural(keys.length - 3, 'стих', 'стиха', 'стихов') + '</button>';
    if (br) html += '<p class="brnote">Слова в скобках [ ] и ( ) — в скобках Синодального издания.</p>';
    box.innerHTML = html;
    return box;
  }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c); }
  var insetSeq = 0;
  function toggleRef(btn) {
    var open = btn.getAttribute('aria-expanded') === 'true';
    if (open) {
      var old = document.getElementById(btn.getAttribute('aria-controls'));
      if (old) old.remove();
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    var box = insetFor(btn.getAttribute('data-ref'));
    box.id = 'inset-' + (++insetSeq);
    btn.setAttribute('aria-controls', box.id);
    btn.setAttribute('aria-expanded', 'true');
    var host = btn.closest('li, td, th, .uhead, .couple, p, blockquote, .gap, figcaption, h2');
    if (!host) host = btn.parentNode;
    var tag = host.tagName;
    if (tag === 'LI' || tag === 'TD' || tag === 'TH' || host.classList.contains('gap')) host.appendChild(box);
    else host.insertAdjacentElement('afterend', box);
  }

  // ── Выбор лица: «что открыть?»
  var ACTS = [['card', 'Карточка'], ['gen', 'Генеалогия'], ['time', 'Время'], ['geo', 'География'], ['links', 'Связи']];
  function toolHref(pid, k, label, nm) {
    var d = D.drawn[pid] || {};
    return d[k] || stubHref(label + ' — ' + nm);
  }
  function closeActs(except) {
    Array.prototype.forEach.call(document.querySelectorAll('.pick[aria-expanded="true"]'), function (b) {
      if (b === except) return;
      b.setAttribute('aria-expanded', 'false');
      var r = document.getElementById(b.getAttribute('aria-controls'));
      if (r) (r.tagName === 'TR' ? r : r).remove();
    });
  }
  var actSeq = 0;
  function togglePick(btn) {
    var open = btn.getAttribute('aria-expanded') === 'true';
    closeActs(btn);
    if (open) {
      var r0 = document.getElementById(btn.getAttribute('aria-controls'));
      if (r0) r0.remove();
      btn.setAttribute('aria-expanded', 'false');
      return;
    }
    var pid = btn.getAttribute('data-pid'), nm = btn.getAttribute('data-name');
    var inner = '<p class="acts-h">' + esc(nm) + ': что открыть?</p><ul class="btnrow">' + ACTS.map(function (a) {
      return '<li><a class="btn" href="' + toolHref(pid, a[0], a[1], nm) + '">' + a[1] + '</a></li>';
    }).join('') + '</ul>';
    var id = 'acts-' + (++actSeq), node;
    var td = btn.closest('td');
    if (td) {
      node = document.createElement('tr');
      node.className = 'actsrow';
      node.innerHTML = '<td colspan="2"><div class="acts">' + inner + '</div></td>';
      td.parentNode.insertAdjacentElement('afterend', node);
    } else {
      node = document.createElement('div');
      node.className = 'acts';
      node.innerHTML = inner;
      var li = btn.closest('li');
      var gn = btn.closest('.gap-names');
      if (gn) gn.insertAdjacentElement('afterend', node);
      else if (li) li.appendChild(node);
      else btn.insertAdjacentElement('afterend', node);
    }
    node.id = id;
    btn.setAttribute('aria-controls', id);
    btn.setAttribute('aria-expanded', 'true');
  }

  // ── Панель инструментов экрана
  var TOOLS = [['gen', 'Генеалогия'], ['time', 'Время'], ['geo', 'География'], ['links', 'Связи'], ['card', 'Карточка']];
  var TOOLNAME = { gen: 'Генеалогия', time: 'Время', geo: 'География', links: 'Связи', card: 'Карточка' };
  function fillToolbar(nav) {
    var pid = nav.getAttribute('data-pid'), cur = nav.getAttribute('data-current');
    var html = '<button type="button" class="btn back" data-back>' + BACK_ICON + '<span>Назад</span></button>';
    if (pid) {
      var nm = PN[pid] || pid;
      html += '<p class="subj"><span class="lbl">Выбрано:</span>' + esc(nm) + '</p><ul class="ttabs">' + TOOLS.map(function (t) {
        return '<li><a href="' + toolHref(pid, t[0], t[1], nm) + '"' + (t[0] === cur ? ' aria-current="page"' : '') + '>' + t[1] + '</a></li>';
      }).join('') + '</ul>';
    } else {
      html += '<p class="subj"><span class="lbl">Инструмент:</span>' + (TOOLNAME[cur] || '') + '</p>';
    }
    nav.innerHTML = html;
  }
  function fillCardTools(nav) {
    var pid = nav.getAttribute('data-pid'), nm = PN[pid] || pid;
    nav.innerHTML = '<ul class="btnrow">' + TOOLS.filter(function (t) { return t[0] !== 'card'; }).map(function (t) {
      return '<li><a class="btn" href="' + toolHref(pid, t[0], t[1], nm) + '">' + t[1] + '</a></li>';
    }).join('') + '</ul>';
  }
  var BACK_ICON = '<svg class="ico" viewBox="0 0 48 48" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M28 10L14 24l14 14"/></svg>';

  // ── Поиск
  var LAT = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`', CYR = 'йцукенгшщзхъфывапролджэячсмитьбюё';
  function fixLayout(s) {
    if (/[а-яё]/i.test(s) || !/[a-z]/i.test(s)) return s;
    return s.toLowerCase().split('').map(function (c) { var i = LAT.indexOf(c); return i >= 0 ? CYR[i] : c; }).join('');
  }
  function nrm(s) { return s.toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function matchForm(f, q) {
    if (f === q) return 4;
    if (f.indexOf(q) === 0 && q.length >= 2) return 3;
    var words = f.split(' ');
    for (var i = 1; i < words.length; i++) if (words[i].indexOf(q) === 0 && q.length >= 3) return 2;
    if (f.length >= 4 && q.indexOf(f.slice(0, -1)) === 0 && q.length - f.length <= 2) return 2;
    if (f.length === 3 && q.length === 3 && q.slice(0, 2) === f.slice(0, 2) && /[аяеуюи]$/.test(q)) return 1;
    return 0;
  }
  function primaryHref(pid, nm) {
    var d = D.drawn[pid] || {};
    return d.card || d.gen || d.time || d.geo || stubHref('Карточка — ' + nm);
  }
  function parseQueryRef(q) {
    var m = q.trim().match(/^(\d?\s*[А-ЯЁа-яё]+)\.?\s*(\d+)\s*[:.,]\s*(\d+)(?:\s*[-–]\s*(\d+))?$/);
    if (!m) return null;
    var b = normBook(m[1]);
    if (!b) return null;
    return { book: b, ref: b + ' ' + m[2] + ':' + m[3] + (m[4] ? '-' + m[4] : '') };
  }
  var AREAKIND = { tribe: 'колено', nation: 'народ', house: 'дом' };
  function runSearch(qRaw, box) {
    var q0 = (qRaw || '').trim();
    var html = '';
    if (!q0) { box.innerHTML = '<p>Введите имя, место или адрес стиха.</p>'; return; }
    var vr = parseQueryRef(q0);
    if (vr) {
      var keys = expandRef(vr.ref);
      html += '<section class="res-sec" aria-labelledby="rv"><h2 id="rv">Стих ' + esc(dispKey(vr.ref.replace('-', '–'))) + '</h2>';
      var any = false, br = false, named = [];
      keys.forEach(function (k) {
        var t = D.verses[k];
        if (t) {
          any = true; if (hasBr(t)) br = true;
          html += '<blockquote class="rverse"><span class="sr">' + esc(k) + ': </span>' + verseHTML(t) + '</blockquote>';
          (D.versePersons[k] || []).forEach(function (p) { if (named.indexOf(p) < 0) named.push(p); });
        }
      });
      if (!any) html += '<p>Текста этого стиха в эскизе нет. В эскиз вошли стихи, нужные его экранам, и главы Быт 5–7, 11, 12, 25; Исх 12; Руф 1–4; Мф 1; Лк 3.</p>';
      if (br) html += '<p class="hint">Слова в скобках [ ] и ( ) — в скобках Синодального издания.</p>';
      if (named.length) {
        html += '<h3>Названы в стихе — ' + named.length + '</h3><ul>' + named.map(function (p) {
          var info = PINFO[p] || [p, [p], '', '', 0, ''];
          return '<li class="res"><a class="rname" href="' + primaryHref(p, info[1][0]) + '">' + esc(PN[p] || p) + '</a>' +
            (info[2] ? '<span class="rsub">' + esc(info[2]) + '</span>' : '') + '</li>';
        }).join('') + '</ul>';
      } else if (any) {
        html += '<p class="hint">Лиц этого стиха в данных эскиза не найдено.</p>';
      }
      html += '</section>';
      box.innerHTML = html;
      return;
    }
    var q = nrm(fixLayout(q0));
    var res = [];
    D.persons.forEach(function (p) {
      var best = 0;
      p[1].forEach(function (f) { best = Math.max(best, matchForm(nrm(f), q)); });
      if (best) res.push([best, p]);
    });
    res.sort(function (a, b) { return b[0] - a[0] || b[1][4] - a[1][4] || (a[1][1][0] < b[1][1][0] ? -1 : 1); });
    var areas = D.areas.filter(function (a) {
      return nrm(a[1]).split(' ').some(function (w) { return w.indexOf(q) === 0 || (q.length >= 4 && w.indexOf(q.slice(0, -1)) === 0); });
    });
    var fixed = fixLayout(q0) !== q0 ? ' (исправлена раскладка: «' + esc(fixLayout(q0)) + '»)' : '';
    var total = res.length + areas.length;
    html += '<p class="res-h">По запросу «' + esc(q0) + '»' + fixed + ' найдено: ' + total + '</p>';
    if (!total) {
      html += '<p>Ничего не найдено. Проверьте написание или попробуйте адрес стиха, например: Руф 4:17.</p>';
    }
    if (res.length) {
      html += '<section class="res-sec" aria-labelledby="rp"><h2 id="rp">Люди — ' + res.length + '</h2><ul>';
      res.slice(0, 40).forEach(function (r, i) {
        var p = r[1], nm = p[1][0];
        var other = p[1].slice(1).filter(function (f) { return nrm(f).indexOf(q) === 0; });
        html += '<li class="res"><a class="rname" href="' + primaryHref(p[0], nm) + '">' + esc(nm) + '</a>' +
          (p[2] ? '<span class="rsub">' + esc(p[2]) + '</span>' : '') +
          '<span class="rkind">' + esc(p[3]) + (other.length ? '; иначе — ' + esc(other.join(', ')) : '') +
          (p[5] ? '; впервые назван — ' + esc(p[5]) : '') + '</span>';
        if (i < 3) {
          html += '<ul class="rtools" aria-label="Открыть: ' + esc(nm) + '">' + TOOLS.map(function (t) {
            return '<li><a href="' + toolHref(p[0], t[0], t[1], nm) + '">' + t[1] + '</a></li>';
          }).join('') + '</ul>';
        }
        html += '</li>';
      });
      html += '</ul>';
      if (res.length > 40) html += '<p class="hint">ещё ' + (res.length - 40) + ' — уточните запрос</p>';
      html += '</section>';
    }
    if (areas.length) {
      html += '<section class="res-sec" aria-labelledby="ra"><h2 id="ra">Колена, народы, дома — ' + areas.length + '</h2><ul>' + areas.map(function (a) {
        return '<li class="res"><a class="rname" href="' + stubHref('Генеалогия — ' + a[1]) + '">' + esc(a[1]) + '</a>' +
          '<span class="rkind">' + (AREAKIND[a[2]] || 'область') + ' — показ в Генеалогии</span></li>';
      }).join('') + '</ul></section>';
    }
    box.innerHTML = html;
  }
  var PINFO = {};
  D.persons.forEach(function (p) { PINFO[p[0]] = p; });

  document.querySelector('[data-search]').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = document.getElementById('q').value.trim();
    addLog('search', { query: v });
    if (!v) return;
    location.hash = '#/s/' + encodeURIComponent(v);
  });

  // ── История: «Назад» возвращает в прежний экран
  var navN = 0;
  try {
    if (!history.state || typeof history.state.n !== 'number') history.replaceState({ n: 0 }, '');
    navN = history.state.n;
  } catch (e) { navN = 0; }
  function goBack() {
    var n = 0;
    try { n = history.state && history.state.n || 0; } catch (e) { n = 0; }
    if (n > 0) history.back(); else location.hash = '#/';
  }

  // ── Отрисовка экрана по адресу
  var first = true;
  function route() {
    try {
      if (!history.state || typeof history.state.n !== 'number') history.replaceState({ n: navN + 1 }, '');
      navN = history.state.n;
    } catch (e) { /* без истории */ }
    var h = (location.hash || '').replace(/^#/, '') || '/';
    var seg = h.split('/').filter(Boolean);
    var tpl, ctx = {};
    if (!seg.length) tpl = 'home-' + variant;
    else if (seg[0] === 's') { tpl = 'search'; ctx.q = safeDecode(seg.slice(1).join('/')); }
    else if (seg[0] === 'gen' && seg[1]) tpl = 'gen-' + seg[1];
    else if (seg[0] === 'time') { tpl = 'time'; ctx.sel = seg[1] || ''; }
    else if (seg[0] === 'geo') tpl = 'geo-' + seg[1];
    else if (seg[0] === 'card') tpl = 'card-' + seg[1];
    else if (seg[0] === 'index') tpl = seg[1] === 'ruf' ? 'index-ruf' : 'index';
    else if (seg[0] === 'stub') { tpl = 'stub'; ctx.what = safeDecode(seg.slice(1).join('/')); }
    var t = document.getElementById('t-' + tpl);
    if (!t) { ctx.what = 'Адрес «' + h + '»'; t = document.getElementById('t-stub'); tpl = 'stub'; }
    main.replaceChildren(t.content.cloneNode(true));
    var scr = main.firstElementChild;
    var isHome = tpl.indexOf('home-') === 0;
    root.classList.toggle('is-home', isHome);
    document.querySelector('[data-home]').hidden = isHome;
    document.querySelector('[data-brand-slot]').innerHTML = isHome
      ? '<h1 class="brand" tabindex="-1">Библия наглядно</h1>' : '<p class="brand">Библия наглядно</p>';
    var title = scr.getAttribute('data-title') || 'Библия наглядно';
    var cont = scr.getAttribute('data-continue');

    if (tpl === 'stub') {
      var w = scr.querySelector('[data-stub-what]');
      w.textContent = ctx.what ? 'Вы открыли: ' + ctx.what + '.' : '';
      addLog('stub', { what: ctx.what || '' });
    }
    if (tpl === 'search') {
      document.getElementById('q').value = ctx.q || '';
      scr.querySelector('.scr-h').textContent = 'Поиск: ' + (ctx.q || '');
      runSearch(ctx.q, scr.querySelector('[data-results]'));
      title = 'Поиск: ' + (ctx.q || '');
    } else if (!first) {
      document.getElementById('q').value = '';
    }
    if (tpl === 'time') {
      var sel = ctx.sel || 'none';
      var panel = scr.querySelector('[data-panel="' + sel + '"]') || scr.querySelector('[data-panel="none"]');
      Array.prototype.forEach.call(scr.querySelectorAll('[data-panel]'), function (p) { p.hidden = p !== panel; });
      var tb = scr.querySelector('.toolbar');
      if (sel.indexOf('p-') === 0 && panel.getAttribute('data-panel') === sel) {
        tb.setAttribute('data-pid', sel);
        var a = scr.querySelector('a.tp[data-pid="' + sel + '"]');
        if (a) { a.setAttribute('aria-current', 'true'); a.closest('.erow').classList.add('sel-p'); }
        scr.querySelector('.scr-h').textContent = (PN[sel] || '') + ' — Время';
        title = (PN[sel] || '') + ' — Время';
        cont = title;
      } else if (sel.indexOf('e-') === 0) {
        var row = scr.querySelector('.erow[data-epoch="' + sel.slice(2) + '"]');
        if (row) row.classList.add('sel');
        cont = 'Время — ' + (row ? row.querySelector('.ehead span').textContent : '');
      } else {
        cont = 'Время — эпохи по порядку';
      }
    }
    Array.prototype.forEach.call(scr.querySelectorAll('nav.toolbar'), fillToolbar);
    Array.prototype.forEach.call(scr.querySelectorAll('nav.cardtools'), fillCardTools);
    if (isHome) {
      var last = LS.get('bn-last', null);
      var cs = scr.querySelector('.continue');
      if (cs && last && last.href) {
        cs.hidden = false;
        var l = cs.querySelector('[data-continue-link]');
        l.href = last.href;
        l.textContent = 'Продолжить: ' + last.label;
      }
      document.title = 'Библия наглядно — главная';
    } else {
      document.title = title + ' — Библия наглядно';
      if (cont) LS.set('bn-last', { href: location.hash, label: cont });
    }
    addLog('screen', { screen: tpl, sel: ctx.sel || undefined, query: ctx.q || undefined });
    // фокус — на заголовок нового экрана; при первой загрузке не трогаем
    if (!first) {
      var hh = isHome ? document.querySelector('.brand') : scr.querySelector('.scr-h');
      if (hh) { try { hh.focus({ preventScroll: true }); } catch (e) { hh.focus(); } }
      window.scrollTo(0, 0);
    }
    first = false;
  }
  function safeDecode(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }

  // ── Делегирование нажатий
  main.addEventListener('click', function (ev) {
    var b = ev.target.closest('button, a');
    if (!b) return;
    if (b.classList.contains('ref')) { toggleRef(b); return; }
    if (b.classList.contains('pick')) { togglePick(b); return; }
    if (b.classList.contains('vmore')) {
      Array.prototype.forEach.call(b.parentNode.querySelectorAll('.v[hidden]'), function (p) { p.hidden = false; });
      b.remove(); return;
    }
    if (b.classList.contains('morebtn')) {
      var lst = b.previousElementSibling;
      var open = b.getAttribute('aria-expanded') === 'true';
      lst.hidden = open;
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      b.textContent = open ? 'ещё ' + lst.children.length : 'свернуть';
      return;
    }
    if (b.classList.contains('gapbtn')) {
      var g = document.getElementById(b.getAttribute('aria-controls'));
      var o = b.getAttribute('aria-expanded') === 'true';
      g.hidden = o;
      b.setAttribute('aria-expanded', o ? 'false' : 'true');
      return;
    }
    if (b.classList.contains('ecell')) { toggleEpoch(b); return; }
    if (b.hasAttribute('data-back')) { goBack(); return; }
  });
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-back]');
    if (b && !main.contains(b)) goBack();
  });
  function toggleEpoch(btn) {
    var eid = btn.getAttribute('data-epoch');
    var panel = document.getElementById('ep-panel');
    var open = btn.getAttribute('aria-expanded') === 'true';
    Array.prototype.forEach.call(document.querySelectorAll('.ecell'), function (c) { c.setAttribute('aria-expanded', 'false'); });
    closeActs(null);
    if (open) { panel.hidden = true; return; }
    btn.setAttribute('aria-expanded', 'true');
    Array.prototype.forEach.call(panel.querySelectorAll('.ep-body'), function (b) { b.hidden = b.getAttribute('data-epoch') !== eid; });
    panel.hidden = false;
    if (window.matchMedia('(max-width: 599px)').matches) btn.closest('li').insertAdjacentElement('afterend', panel);
    else document.querySelector('.ecells').insertAdjacentElement('afterend', panel);
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeActs(null);
    if (e.code === 'KeyH' && e.ctrlKey && e.altKey) { e.preventDefault(); toggleHost(); }
  });
  document.querySelector('[data-skip]').addEventListener('click', function (e) {
    e.preventDefault(); document.getElementById('q').focus();
  });

  // ── Панель ведущего
  var hostEl = document.querySelector('[data-host]');
  function toggleHost(show) {
    hostEl.hidden = show === undefined ? !hostEl.hidden : !show;
  }
  if (params.get('host') === '1') toggleHost(true);
  if (countEl) countEl.textContent = String(log.length);
  var partEl = hostEl.querySelector('[data-h-part]');
  partEl.value = LS.get('bn-part', '');
  partEl.addEventListener('change', function () { LS.set('bn-part', partEl.value.trim()); addLog('host', { action: 'участник', value: partEl.value.trim() }); });
  Array.prototype.forEach.call(hostEl.querySelectorAll('input[name=hv]'), function (r) {
    r.checked = r.value === variant;
    r.addEventListener('change', function () {
      addLog('host', { action: 'вариант', value: r.value });
      var u = location.pathname + '?v=' + r.value + (hostEl.hidden ? '' : '&host=1') + '#/';
      location.href = u;
    });
  });
  hostEl.querySelector('[data-h-theme]').value = LS.get('bn-theme', '');
  hostEl.querySelector('[data-h-theme]').addEventListener('change', function (e) { setTheme(e.target.value); addLog('host', { action: 'тема', value: e.target.value }); });
  Array.prototype.forEach.call(hostEl.querySelectorAll('[data-h-mark]'), function (b) {
    b.addEventListener('click', function () {
      addLog('task', { task: hostEl.querySelector('[data-h-task]').value, mark: b.getAttribute('data-h-mark') });
      b.blur();
    });
  });
  function toStart() {
    LS.del('bn-last');
    setLayer('simple', true);
    location.hash = '#/';
  }
  hostEl.querySelector('[data-h-home]').addEventListener('click', function () { addLog('host', { action: 'исходный экран' }); toStart(); });
  hostEl.querySelector('[data-h-reset]').addEventListener('click', function () {
    addLog('host', { action: 'новый участник' });
    LS.set('bn-part', ''); partEl.value = '';
    toStart();
  });
  hostEl.querySelector('[data-h-hide]').addEventListener('click', function () { toggleHost(false); });
  hostEl.querySelector('[data-h-dl]').addEventListener('click', function () {
    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    var who = (LS.get('bn-part', '') || 'uchastnik').replace(/[^\wА-Яа-яЁё-]+/g, '_');
    var blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), userAgent: navigator.userAgent, entries: log }, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zhurnal-eskiza-' + who + '-' + stamp + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  });
  hostEl.querySelector('[data-h-clear]').addEventListener('click', function () {
    if (!window.confirm('Удалить все записи журнала на этом устройстве? Сначала скачайте журнал.')) return;
    log = []; LS.set(LOGKEY, log); countEl.textContent = '0';
  });

  window.addEventListener('hashchange', route);
  route();
})();
