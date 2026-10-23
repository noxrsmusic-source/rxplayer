/* rx-core.js  (rename of anti-adblock.js)
   Why renamed: filter lists often block files with "adblock" in the name,
   which silently removes your protection. Use a neutral name and update the
   <script src> in index.html, ads.html and player.html.

   What changed vs. the old version:
   1. Probes YOUR real ad hosts (Monetag / highrevenueformat), not Google.
   2. Runs automatically + re-checks every 5s (old file only defined a
      function that nobody called).
   3. Exposes window.rxAdGuard so ads.html / player.html can pause the
      timer and stop the stream while blocked.
   4. Closed shadow root + frozen API.
*/
(function () {
  'use strict';

  const OVERLAY_ID = 'rx-guard-host';
  const PROBES = [
    'https://n6wxm.com/vignette.min.js',
    'https://nap5k.com/tag.min.js',
    'https://al5sm.com/tag.min.js',
    'https://5gvci.com/act/files/tag.min.js?z=12062817',
    'https://www.highrevenueformat.com/4a5f21676e17448c3ce7697746d1287c/invoke.js'
  ];
  const FAIL_THRESHOLD = 2;      // blocked probes needed (1 if Brave)
  const PROBE_TIMEOUT = 4500;    // timeouts are neutral, not "blocked"
  const MONITOR_MS = 5000;

  const posters1 = ['https://m.media-amazon.com/images/M/MV5BMTk2ZmFhYjctYWZiYy00N2IxLWEzMWItZGRiMDY4ZDQwZWFlXkEyXkFqcGc@._V1_QL75_UY281_CR11,0,190,281_.jpg', 'https://m.media-amazon.com/images/M/MV5BNzdkNjAxNWMtNWY3My00NTI1LTg2YWQtOGI3MDA0NzdhMjEyXkEyXkFqcGc@._V1_QL75_UY281_CR12,0,190,281_.jpg', 'https://m.media-amazon.com/images/M/MV5BOWNjYWM3NWItOGE0ZS00MWRjLThiZWEtYjc4ZmNmMmU5ZTVmXkEyXkFqcGc@._V1_QL75_UX190_CR0,0,190,281_.jpg'];
  const posters2 = ['https://m.media-amazon.com/images/M/MV5BMjEzMDAxOTUyMV5BMl5BanBnXkFtZTgwNzAxMzYzOTE@._V1_QL75_UX190_CR0,0,190,281_.jpg', 'https://m.media-amazon.com/images/M/MV5BMGUzOWE4NDItNzAxYy00M2VkLWFiNDEtNjczZTQ2Nzg5YmVhXkEyXkFqcGc@._V1_QL75_UY281_CR18,0,190,281_.jpg', 'https://m.media-amazon.com/images/M/MV5BYmEzYTQ2OTEtMGM4MS00MWE1LWI3MGYtMTIyN2IwYzlkYmI0XkEyXkFqcGc@._V1_QL75_UY281_CR18,0,190,281_.jpg'];
  const posters3 = ['https://m.media-amazon.com/images/M/MV5BMWU1OGEwNmQtNGM3MS00YTYyLThmYmMtN2FjYzQzNzNmNTE0XkEyXkFqcGc@._V1_QL75_UX190_CR0,2,190,281_.jpg', 'https://m.media-amazon.com/images/M/MV5BZTNjOWI0ZTAtOGY1OS00ZGU0LWEyOWYtMjhkYjdlYmVjMDk2XkEyXkFqcGc@._V1_QL75_UY281_CR1,0,190,281_.jpg'];

  const T = {
    en: {
      title: 'Ad Blocker Detected',
      body: 'Please disable your <b>Ad Blocker</b>, lower <b>Brave Shields</b> for this site, turn off <b>Private DNS / DNS blockers</b>, or try a different browser.',
      btnCheck: "I've Disabled It – Check Again",
      btnWait: 'Checking...',
      btnStill: 'Still blocked! Check Again',
      hint1: '<b>Using Brave?</b> Click the Lion icon in the address bar and select "Shields Down".',
      hint2: '<b>Using a DNS Blocker?</b> Please whitelist our domain.',
      toggle: 'हिंदी'
    },
    hi: {
      title: 'Ad Blocker Detected',
      body: 'Kripya apna <b>Ad Blocker</b> band karein, <b>Brave Shields</b> ko is site ke liye disable karein, <b>Private DNS</b> band karein, ya kisi anya browser mein try karein.',
      btnCheck: 'Maine Ad Blocker Band Kar Diya – Check Karein',
      btnWait: 'Checking...',
      btnStill: 'Abhi bhi block hai! Check Again',
      hint1: '<b>Brave use kar rahe hain?</b> Address bar mein Lion icon par click karke "Shields Down" karein.',
      hint2: '<b>DNS Blocker?</b> Kripya is domain ko whitelist karein.',
      toggle: 'English'
    }
  };
  let lang = 'en';
  try { lang = localStorage.getItem('adblock_lang') || 'en'; } catch (e) {}

  /* ---------- state ---------- */
  let state = null;                 // null = unknown, true = blocked, false = clear
  const listeners = [];
  let checking = false;
  let host = null, root = null, observer = null, reAdd = null, music = null;

  function setState(b) {
    if (state === b) return;
    state = b;
    listeners.slice().forEach(fn => { try { fn(b); } catch (e) {} });
  }

  /* ---------- detection ---------- */
  async function isBrave() {
    try { if (navigator.brave && await navigator.brave.isBrave()) return true; } catch (e) {}
    try {
      if (navigator.userAgentData && navigator.userAgentData.brands)
        return navigator.userAgentData.brands.some(b => b.brand === 'Brave');
    } catch (e) {}
    return false;
  }

  // 'ok' | 'blocked' | 'timeout'
  function probe(url) {
    return new Promise(resolve => {
      const ctl = new AbortController();
      const t = setTimeout(() => { ctl.abort(); resolve('timeout'); }, PROBE_TIMEOUT);
      const u = url + (url.includes('?') ? '&' : '?') + '_=' + Math.random().toString(36).slice(2);
      fetch(u, { mode: 'no-cors', cache: 'no-store', signal: ctl.signal })
        .then(() => { clearTimeout(t); resolve('ok'); })
        .catch(err => {
          clearTimeout(t);
          resolve(err && err.name === 'AbortError' ? 'timeout' : 'blocked');
        });
    });
  }

  function domBait() {
    if (!document.body) return false;
    const bait = document.createElement('div');
    bait.className = 'adsbox ad-banner ad-unit pub_300x250 textads';
    bait.style.cssText = 'position:absolute!important;left:-10000px!important;top:-10000px!important;width:10px!important;height:10px!important;';
    document.body.appendChild(bait);
    const blocked = bait.offsetWidth === 0 || bait.offsetHeight === 0 ||
      getComputedStyle(bait).display === 'none' || getComputedStyle(bait).visibility === 'hidden';
    bait.remove();
    return blocked;
  }

  async function detect() {
    const [brave, results] = await Promise.all([isBrave(), Promise.all(PROBES.map(probe))]);
    const blockedN = results.filter(r => r === 'blocked').length;
    return domBait() || blockedN >= (brave ? 1 : FAIL_THRESHOLD);
  }

  async function cycle() {
    if (checking) return;
    checking = true;
    try {
      const blocked = await detect();
      if (blocked) { showOverlay(); setState(true); }
      else { hideOverlay(); setState(false); }
    } catch (e) {
      showOverlay(); setState(true);    // fail closed
    } finally {
      checking = false;
    }
  }

  /* ---------- overlay ---------- */
  function buildHost() {
    const h = document.createElement('div');
    h.id = OVERLAY_ID;
    h.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:auto!important;display:block!important;visibility:visible!important;opacity:1!important;';
    root = h.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        :host{all:initial}
        @keyframes up{0%{transform:translateY(0)}100%{transform:translateY(calc(-50% - 6px))}}
        .wrap{position:fixed;inset:0;background:#050505;display:flex;align-items:center;justify-content:center;padding:24px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;text-align:center;overflow:hidden}
        .bg{position:absolute;inset:0;display:flex;justify-content:center;gap:12px;opacity:.65;pointer-events:none;overflow:hidden}
        .col{display:flex;flex-direction:column;gap:12px;width:30%;will-change:transform}
        @media(min-width:768px){.col{width:18%}}
        .f{animation:up 45s linear infinite}.s{animation:up 60s linear infinite}.m{animation:up 50s linear infinite}
        .pc{border-radius:12px;overflow:hidden;aspect-ratio:2/3;background:#1c1c1e;flex-shrink:0}
        .pc img{width:100%;height:100%;object-fit:cover;display:block}
        .grad{position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,15,15,.6) 0%,rgba(15,15,15,.9) 45%,#0f0f0f 100%);pointer-events:none}
        .box{position:relative;max-width:480px;background:rgba(28,28,31,.85);backdrop-filter:blur(12px);padding:40px 30px;border-radius:16px;box-shadow:0 15px 35px rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.1)}
        h2{margin:10px 0 16px;font-size:24px;color:#fff;font-weight:700}
        p{margin:0 0 24px;line-height:1.6;font-size:16px;color:#b3b3b3}
        .btn{background:#e50914;color:#fff;border:0;border-radius:8px;padding:14px 24px;cursor:pointer;font-size:16px;font-weight:700;width:100%;max-width:320px;box-shadow:0 4px 15px rgba(229,9,20,.4)}
        .btn:disabled{opacity:.6;cursor:wait}
        .top{position:absolute;top:12px;right:16px}
        .lt{background:transparent;border:1px solid #444;color:#aaa;padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700}
        .hint{color:#777;font-size:13px;margin-top:24px;line-height:1.5}.hint b{color:#aaa}
      </style>
      <audio id="m" loop><source src="https://res.cloudinary.com/du9nysbwl/video/upload/v1792581281/Silent_Partner_-_Space_Walk_Youtube_Premiere_Countdown_download_60_fps_jphhye.mp3" type="audio/mpeg"></audio>
      <div class="wrap">
        <div class="bg" id="bg"></div><div class="grad"></div>
        <div class="box">
          <div class="top"><button class="lt" id="lt">${T[lang].toggle}</button></div>
          <h2 id="t">${T[lang].title}</h2>
          <p id="b">${T[lang].body}</p>
          <button class="btn" id="r">${T[lang].btnCheck}</button>
          <p class="hint" id="h">${T[lang].hint1}<br>${T[lang].hint2}</p>
        </div>
      </div>`;

    const bg = root.getElementById('bg');
    const sets = [posters1, posters2, posters3], speeds = ['f', 's', 'm'];
    for (let i = 0; i < 6; i++) {
      const c = document.createElement('div');
      c.className = 'col ' + speeds[i % 3];
      let html = '';
      for (let k = 0; k < 5; k++) sets[i % 3].forEach(u => { html += `<div class="pc"><img src="${u}" alt=""></div>`; });
      c.innerHTML = html;
      bg.appendChild(c);
    }

    const $ = id => root.getElementById(id);
    music = $('m'); music.volume = 0.3;

    $('lt').addEventListener('click', () => {
      lang = lang === 'en' ? 'hi' : 'en';
      try { localStorage.setItem('adblock_lang', lang); } catch (e) {}
      $('t').innerHTML = T[lang].title;
      $('b').innerHTML = T[lang].body;
      $('h').innerHTML = T[lang].hint1 + '<br>' + T[lang].hint2;
      $('lt').textContent = T[lang].toggle;
      if (!$('r').disabled) $('r').textContent = T[lang].btnCheck;
    });

    $('r').addEventListener('click', async () => {
      const btn = $('r');
      btn.disabled = true; btn.textContent = T[lang].btnWait;
      await new Promise(r => setTimeout(r, 800));
      await cycle();
      const b = root && root.getElementById('r');   // overlay may be gone if cleared
      if (b) { b.disabled = false; b.textContent = T[lang].btnStill; }
    });

    // music needs a user gesture on most browsers
    const kick = () => {
      if (music && music.paused) music.play().catch(() => {});
      document.removeEventListener('click', kick);
      document.removeEventListener('touchstart', kick);
    };
    music.play().catch(() => {
      document.addEventListener('click', kick);
      document.addEventListener('touchstart', kick);
    });
    return h;
  }

  function showOverlay() {
    if (host && document.getElementById(OVERLAY_ID)) return;
    if (!host) host = buildHost();
    document.documentElement.appendChild(host);

    if (!observer) {
      observer = new MutationObserver(() => {
        if (host && !document.getElementById(OVERLAY_ID)) document.documentElement.appendChild(host);
        else if (host) host.style.cssText = 'position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:auto!important;display:block!important;visibility:visible!important;opacity:1!important;';
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    }
    if (!reAdd) {
      reAdd = setInterval(() => {
        if (host && !document.getElementById(OVERLAY_ID)) document.documentElement.appendChild(host);
      }, 300);
    }
  }

  function hideOverlay() {
    if (!host) return;
    if (observer) { observer.disconnect(); observer = null; }
    if (reAdd) { clearInterval(reAdd); reAdd = null; }
    try { music && music.pause(); } catch (e) {}
    host.remove();
    host = null; root = null; music = null;
  }

  /* ---------- public API (frozen, non-overwritable) ---------- */
  const api = Object.freeze({
    onState(fn) {
      if (typeof fn !== 'function') return;
      listeners.push(fn);
      if (state !== null) { try { fn(state); } catch (e) {} }
    },
    isBlocked() { return state !== false; }
  });
  try {
    Object.defineProperty(window, 'rxAdGuard', { value: api, writable: false, configurable: false });
  } catch (e) {}

  // old API kept so existing calls still work
  window.runAdBlockCheck = function (cb) {
    api.onState(b => { if (!b && cb) { const f = cb; cb = null; f(); } });
  };

  /* ---------- boot ---------- */
  function boot() {
    cycle();
    setInterval(cycle, MONITOR_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) cycle(); });
    window.addEventListener('focus', cycle);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
