(function () {
  /* ─── CONFIG ─── */
  const SKIP_SELECTORS = 'nav, .nav-toggle, .epilogo .firma, cite, .ev-ref, .per-rol, .ch-num, .ch-divider, .bb-num, .bb-line, .cover-tag, .cover-author, .nav-brand, .nav-section';

  /* ─── STATE ─── */
  let utterances = [];
  let currentIndex = 0;
  let isPlaying = false;
  let isPaused = false;
  let rate = 1;

  /* ─── BUILD TEXT BLOCKS ─── */
  function buildBlocks() {
    const blocks = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const el = node.parentElement;
        if (!el) return NodeFilter.FILTER_REJECT;
        if (el.closest(SKIP_SELECTORS)) return NodeFilter.FILTER_REJECT;
        if (el.closest('script, style, noscript')) return NodeFilter.FILTER_REJECT;
        const txt = node.textContent.trim();
        if (!txt) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let buffer = '';
    let node;
    while ((node = walker.nextNode())) {
      const txt = node.textContent.replace(/\s+/g, ' ').trim();
      if (!txt) continue;
      buffer += ' ' + txt;
      if (buffer.length > 300) {
        blocks.push(buffer.trim());
        buffer = '';
      }
    }
    if (buffer.trim()) blocks.push(buffer.trim());
    return blocks;
  }

  function buildUtterances(blocks) {
    return blocks.map(text => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-MX';
      u.rate = rate;
      return u;
    });
  }

  /* ─── PLAYBACK ─── */
  function speakFrom(index) {
    window.speechSynthesis.cancel();
    if (index >= utterances.length) { stop(); return; }
    currentIndex = index;
    updateProgress();
    const u = utterances[index];
    u.rate = rate;
    u.onend = () => {
      if (isPlaying) speakFrom(currentIndex + 1);
    };
    u.onerror = () => {
      if (isPlaying) speakFrom(currentIndex + 1);
    };
    window.speechSynthesis.speak(u);
    setBtn('pause');
  }

  function play() {
    if (utterances.length === 0) {
      const blocks = buildBlocks();
      utterances = buildUtterances(blocks);
    }
    isPlaying = true;
    isPaused = false;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      setBtn('pause');
    } else {
      speakFrom(currentIndex);
    }
  }

  function pause() {
    isPlaying = false;
    isPaused = true;
    window.speechSynthesis.pause();
    setBtn('play');
  }

  function stop() {
    isPlaying = false;
    isPaused = false;
    currentIndex = 0;
    window.speechSynthesis.cancel();
    setBtn('play');
    updateProgress();
  }

  function togglePlay() {
    if (isPlaying) pause();
    else play();
  }

  function changeRate(val) {
    rate = parseFloat(val);
    document.getElementById('ar-rate-label').textContent = rate.toFixed(1) + 'x';
    // rebuild with new rate — restart from current
    if (utterances.length > 0) {
      const idx = currentIndex;
      const blocks = buildBlocks();
      utterances = buildUtterances(blocks);
      if (isPlaying) { isPlaying = false; speakFrom(idx); isPlaying = true; }
    }
  }

  function updateProgress() {
    const total = utterances.length || 1;
    const pct = Math.round((currentIndex / total) * 100);
    const bar = document.getElementById('ar-progress-bar');
    const label = document.getElementById('ar-progress-label');
    if (bar) bar.style.width = pct + '%';
    if (label) label.textContent = pct + '%';
  }

  /* ─── UI ─── */
  function setBtn(state) {
    const btn = document.getElementById('ar-playbtn');
    if (!btn) return;
    btn.innerHTML = state === 'pause'
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';
  }

  function buildUI() {
    const wrap = document.createElement('div');
    wrap.id = 'audio-reader';
    wrap.innerHTML = `
      <style>
        #audio-reader{
          position:fixed;bottom:20px;right:20px;z-index:9999;
          background:linear-gradient(135deg,#003B6F 0%,#011529 100%);
          border:1px solid rgba(240,171,0,.35);
          border-radius:14px;padding:12px 16px;
          box-shadow:0 4px 24px rgba(0,0,0,.5);
          display:flex;flex-direction:column;gap:8px;
          min-width:220px;font-family:'Raleway',sans-serif;
          transition:opacity .3s;
        }
        #audio-reader.ar-hidden{opacity:0;pointer-events:none;}
        #ar-title{font-family:'Cinzel',serif;font-size:10px;letter-spacing:3px;
          color:rgba(240,171,0,.7);text-transform:uppercase;margin-bottom:2px;}
        #ar-controls{display:flex;align-items:center;gap:10px;}
        #ar-playbtn{
          width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;
          background:#F0AB00;color:#040e1c;display:flex;align-items:center;
          justify-content:center;flex-shrink:0;transition:background .2s;
        }
        #ar-playbtn:hover{background:#FFD166;}
        #ar-playbtn svg{width:16px;height:16px;}
        #ar-stopbtn{
          width:28px;height:28px;border-radius:6px;border:1px solid rgba(240,171,0,.3);
          cursor:pointer;background:transparent;color:rgba(240,171,0,.7);
          display:flex;align-items:center;justify-content:center;transition:all .2s;
        }
        #ar-stopbtn:hover{background:rgba(240,171,0,.1);color:#F0AB00;}
        #ar-stopbtn svg{width:12px;height:12px;}
        #ar-rate-wrap{display:flex;align-items:center;gap:6px;margin-left:auto;}
        #ar-rate-wrap label{font-size:10px;color:rgba(240,171,0,.5);letter-spacing:1px;}
        #ar-rate-label{font-size:12px;color:#F0AB00;min-width:28px;text-align:center;font-weight:600;}
        #ar-rate{-webkit-appearance:none;appearance:none;width:70px;height:3px;
          background:rgba(240,171,0,.2);border-radius:2px;outline:none;cursor:pointer;}
        #ar-rate::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;
          border-radius:50%;background:#F0AB00;cursor:pointer;}
        #ar-progress-wrap{height:3px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;}
        #ar-progress-bar{height:100%;background:#F0AB00;border-radius:2px;
          width:0%;transition:width .4s;}
        #ar-footer{display:flex;justify-content:space-between;align-items:center;}
        #ar-progress-label{font-size:10px;color:rgba(240,171,0,.5);}
        #ar-toggle{position:fixed;bottom:20px;right:20px;z-index:9998;
          width:48px;height:48px;border-radius:50%;
          background:linear-gradient(135deg,#003B6F,#011529);
          border:1px solid rgba(240,171,0,.4);cursor:pointer;
          display:none;align-items:center;justify-content:center;
          box-shadow:0 4px 16px rgba(0,0,0,.4);color:#F0AB00;font-size:20px;
          transition:all .2s;
        }
        #ar-toggle:hover{background:#003B6F;}
        #ar-close{background:none;border:none;cursor:pointer;
          color:rgba(240,171,0,.4);font-size:16px;padding:0;line-height:1;
          transition:color .2s;align-self:flex-start;margin-left:auto;
        }
        #ar-close:hover{color:#F0AB00;}
        @media(max-width:400px){#audio-reader{min-width:180px;right:12px;bottom:12px;}}
      </style>

      <div id="ar-title">🎧 Lector de voz</div>
      <button id="ar-close" title="Minimizar">✕</button>
      <div id="ar-controls">
        <button id="ar-playbtn" title="Reproducir / Pausar">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        </button>
        <button id="ar-stopbtn" title="Detener">
          <svg viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>
        </button>
        <div id="ar-rate-wrap">
          <label>VEL</label>
          <input type="range" id="ar-rate" min="0.5" max="2" step="0.1" value="1">
          <span id="ar-rate-label">1.0x</span>
        </div>
      </div>
      <div id="ar-progress-wrap"><div id="ar-progress-bar"></div></div>
      <div id="ar-footer"><span id="ar-progress-label">0%</span></div>
    `;

    document.body.appendChild(wrap);

    // Toggle button (when minimized)
    const toggle = document.createElement('button');
    toggle.id = 'ar-toggle';
    toggle.title = 'Abrir lector';
    toggle.innerHTML = '🎧';
    document.body.appendChild(toggle);

    // Events
    document.getElementById('ar-playbtn').addEventListener('click', togglePlay);
    document.getElementById('ar-stopbtn').addEventListener('click', stop);
    document.getElementById('ar-rate').addEventListener('input', e => changeRate(e.target.value));
    document.getElementById('ar-close').addEventListener('click', () => {
      wrap.classList.add('ar-hidden');
      toggle.style.display = 'flex';
    });
    toggle.addEventListener('click', () => {
      wrap.classList.remove('ar-hidden');
      toggle.style.display = 'none';
    });

    // Fix position conflict between reader and toggle
    wrap.style.bottom = '20px';
    wrap.style.right = '20px';
  }

  // Init on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI);
  } else {
    buildUI();
  }

  // Stop on page unload
  window.addEventListener('beforeunload', () => window.speechSynthesis.cancel());
})();
