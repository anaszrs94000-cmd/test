// public/whereisparcel.js
(function () {
  'use strict';

  /**
   * ===== 1) Gestion centralisée du CSS =====
   * - Une seule balise <style id="tcolis-styles"> pour toutes tes règles.
   * - Tu peux ajouter des règles à chaud si besoin via addStyleRules([...]).
   */
  var STYLE_ID = 'tcolis-styles';

  function ensureStyleTag() {
    var tag = document.getElementById(STYLE_ID);
    if (!tag) {
      tag = document.createElement('style');
      tag.id = STYLE_ID;
      tag.type = 'text/css';
      (document.head || document.documentElement).appendChild(tag);
    }
    return tag;
  }

  function addStyleRules(rules) {
    try {
      var tag = ensureStyleTag();
      var list = Array.isArray(rules) ? rules : [rules];
      // Nettoie les falsy, join avec un saut de ligne pour la lisibilité
      var css = list.filter(Boolean).join('\n');
      if (css.trim()) {
        tag.appendChild(document.createTextNode('\n' + css + '\n'));
      }
    } catch (_) {}
  }

  // Règles par défaut (tu peux en ajouter ici)
  addStyleRules([
    // Neutralise le display:none de Shopify sur les divs vides
    'div:empty { display: initial !important; }',

    // Ta règle demandée (corrigée)
    '.container-suivis span { padding: 0 !important; font-weight: 500 !important; }'
  ]);

  /**
   * ===== 2) Garde-fou : ne s’exécute que sur /pages/suivis =====
   */


  /**
   * ===== 3) Config API =====
   * ← si tu changes de domaine/API, modifie ici
   */
  var API = 'https://angel-nonarchitectonic-grey.ngrok-free.app';

  /**
   * ===== 4) Utilitaires =====
   */
  function qs(name) {
    return new URLSearchParams(location.search).get(name);
  }
  function money(v, c) {
    var n = Number(v);
    if (isNaN(n)) return String(v || '—');
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: c || 'EUR'
      }).format(n);
    } catch (_) {
      return (n.toFixed ? n.toFixed(2) : String(v)) + ' ' + (c || '');
    }
  }
  function show(el, on) {
    if (el) el.style.display = on ? '' : 'none';
  }
  function replaceTokens(root, map) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false),
      nodes = [];
    while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(function (n) {
      var t = n.nodeValue,
        changed = false;
      for (var k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k) && t.indexOf(k) !== -1) {
          t = t.split(k).join(map[k]);
          changed = true;
        }
      }
      if (changed) n.nodeValue = t;
    });
  }
  function findOrder(orders, number) {
    number = String(number || '').trim();
    if (!number) return null;
    return (
      (orders || []).find(function (o) {
        var name = (o && o.name || '').replace(/^#/, '');
        var onum = String((o && o.order_number) || '').trim();
        return name === number || onum === number;
      }) || null
    );
  }

  /**
   * ===== 5) Rendu =====
   */
  function render(o, number) {
    var root = document.querySelector('.tcolis') || document;
    var errorBox = root.querySelector('[data-tc="error"]');
    var resultBox = root.querySelector('[data-tc="result"]');
    var timeline = root.querySelector('[data-tc="timeline"]');

    if (!o) {
      replaceTokens(root, { '{{order_id}}': number || '—' });
      show(resultBox, false);
      show(errorBox, true);
      if (timeline) timeline.innerHTML = '';
      return;
    }

    var ccy =
      o.currency ||
      (o.total_price_set &&
        o.total_price_set.presentment_money &&
        o.total_price_set.presentment_money.currency) ||
      'EUR';

    var total =
      o.total_price ||
      o.current_total_price ||
      (o.total_price_set &&
        o.total_price_set.shop_money &&
        o.total_price_set.shop_money.amount);

    var tokenMap = {
      '{{order_id}}': (o.name || '').replace(/^#/, '') || number || '—',
      '{{order_number}}':
        o.order_number != null ? String(o.order_number) : number || '—',
      '{{order_name}}': o.name || '',
      '{{date_start}}': o.created_at
        ? new Date(o.created_at).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          })
        : '—',
      '{{status}}': o.fulfillment_status || o.financial_status || 'en cours',
      '{{currency}}': String(ccy || '').toUpperCase(),
      '{{total_price}}': money(total, ccy),
      '{{total_price_raw}}': String(total || '')
    };

    replaceTokens(resultBox || root, tokenMap);
    show(errorBox, false);
    show(resultBox, true);

    try {
      var f = o.fulfillments && o.fulfillments[0];
      var ev = (f && (f.tracking_events || f.events)) || [];
      if (timeline) {
        timeline.innerHTML = (ev || [])
          .map(function (e) {
            var label = e.status || e.message || e.description || 'Mise à jour';
            var when = e.created_at || e.date || '';
            var where = e.location || e.city || '';
            return (
              '<li><b>' +
              label +
              '</b> <small>' +
              when +
              '</small>' +
              (where ? ' — ' + where : '') +
              '</li>'
            );
          })
          .join('');
      }
    } catch (_) {}
  }

  /**
   * ===== 6) Récupération / exécution =====
   */
  function run(number) {
    var shop = (window.Shopify && Shopify.shop) || location.hostname;
    fetch(API + '/api/overview?shop=' + encodeURIComponent(shop), {
      headers: { Accept: 'application/json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var orders = (data && data.orders) || [];
        render(findOrder(orders, number), number);
      })
      .catch(function () {
        render(null, number);
      });
  }

  /**
   * ===== 7) Hydrate (UI) =====
   */
  function hydrate() {
    var root = document.querySelector('.tcolis') || document;
    var input =
      root.querySelector('input[name="tcolis-number"]') ||
      root.querySelector('.tcolis-input');
    var btn =
      root.querySelector('[data-tc="submit"]') ||
      root.querySelector('.tcolis-button');

    function submit() {
      var n = (input && input.value) || '';
      n = n.trim();
      if (!n) return;
      var url = new URL(location.href);
      url.searchParams.set('number', n);
      history.replaceState(null, '', url);
      run(n);
    }

    if (btn) btn.addEventListener('click', submit);
    if (input)
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') submit();
      });

    var initial = qs('number');
    if (initial) {
      if (input) input.value = initial;
      run(initial);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrate);
  } else {
    hydrate();
  }

  /**
   * ===== 8) (Optionnel) API publique pour ajouter du CSS plus tard =====
   * Tu peux, ailleurs dans ton code, faire :
   *   window.tcolisAddStyles(['.selector{...}', '...']);
   */
  window.tcolisAddStyles = addStyleRules;
})();
