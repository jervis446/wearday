/* Fit Slots: spin a random outfit, lock pieces you like, get a drip score and an aesthetic. */
(function () {
  var root = document.getElementById('slots');
  if (!root) return;

  // ---- Colours -------------------------------------------------------------------------------
  var COLORS = [
    { n: 'white', h: '#f7f5ef', f: 'neutral' }, { n: 'black', h: '#1f1d24', f: 'dark' }, { n: 'grey', h: '#9b98a3', f: 'neutral' },
    { n: 'cream', h: '#efe3c8', f: 'neutral' }, { n: 'camel', h: '#c39a63', f: 'earth' }, { n: 'brown', h: '#71492f', f: 'earth' },
    { n: 'olive', h: '#6f7442', f: 'earth' }, { n: 'navy', h: '#24304f', f: 'dark' }, { n: 'denim', h: '#4f6f9f', f: 'cool' },
    { n: 'sage', h: '#a9bd98', f: 'pastel' }, { n: 'baby blue', h: '#a9cdf0', f: 'pastel' }, { n: 'lilac', h: '#c9b3f2', f: 'pastel' },
    { n: 'baby pink', h: '#f6bdd3', f: 'pastel' }, { n: 'hot pink', h: '#ff3fae', f: 'bright' }, { n: 'red', h: '#d9363e', f: 'bright' },
    { n: 'lime', h: '#c6ff3d', f: 'bright' }, { n: 'cobalt', h: '#2f56e0', f: 'bright' }, { n: 'burgundy', h: '#6e1f33', f: 'dark' },
  ];

  // ---- Aesthetics ----------------------------------------------------------------------------
  var AES = {
    'old money': { e: '🥂', lines: ['quiet luxury, loud results.', 'smells like a yacht you don’t own (yet).'] },
    streetwear: { e: '🛹', lines: ['certified drop-day energy.', 'the hypebeasts are taking notes.'] },
    y2k: { e: '💿', lines: ['2003 called, it wants its icon back.', 'butterfly clips not included, but implied.'] },
    'clean girl': { e: '🫧', lines: ['effortless (it took effort).', 'slicked back and sorted.'] },
    'dark academia': { e: '📚', lines: ['reads Dostoevsky in a café, on purpose.', 'library at midnight, but make it fashion.'] },
    gorpcore: { e: '🏔️', lines: ['ready for a hike you won’t take.', 'outdoorsy from the comfort of the city.'] },
    coastal: { e: '🌊', lines: ['linen and sea salt behaviour.', 'vacation mode: permanently on.'] },
    party: { e: '🪩', lines: ['the group chat will hear about this.', 'main character at the afterparty.'] },
  };
  var NAMES = Object.keys(AES);

  // ---- Pieces: shape → aesthetic tags ----------------------------------------------------------
  var SLOTS = [
    [['tee', ['clean girl', 'streetwear', 'coastal']], ['hoodie', ['streetwear', 'gorpcore']], ['shirt', ['old money', 'coastal', 'dark academia']],
     ['crop top', ['y2k', 'party', 'clean girl']], ['sweater', ['old money', 'dark academia']], ['blazer', ['old money', 'dark academia', 'party']],
     ['jersey', ['streetwear', 'y2k']]],
    [['jeans', ['streetwear', 'clean girl', 'y2k']], ['cargos', ['streetwear', 'gorpcore', 'y2k']], ['skirt', ['y2k', 'party', 'coastal', 'dark academia']],
     ['shorts', ['coastal', 'gorpcore']], ['trousers', ['old money', 'dark academia', 'clean girl']], ['flares', ['y2k', 'party']]],
    [['sneakers', ['streetwear', 'clean girl']], ['boots', ['dark academia', 'gorpcore']], ['loafers', ['old money', 'dark academia']],
     ['heels', ['party', 'y2k']], ['chunky kicks', ['streetwear', 'y2k', 'gorpcore']], ['slides', ['coastal', 'clean girl']]],
  ];
  var FAMILY_TAGS = { neutral: ['clean girl', 'old money'], earth: ['gorpcore', 'dark academia', 'old money'], pastel: ['coastal', 'y2k'], bright: ['y2k', 'party', 'streetwear'], dark: ['dark academia', 'party', 'streetwear'], cool: ['coastal', 'streetwear'] };

  // ---- Drawing ---------------------------------------------------------------------------------
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
    var c = function (v) { return Math.max(0, Math.min(255, v)); };
    return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
  }
  var SHAPES = {
    tee: 'M30 18 L42 12 Q50 18 58 12 L70 18 L86 34 L76 44 L70 38 L70 104 L30 104 L30 38 L24 44 L14 34 Z',
    hoodie: 'M30 22 Q50 2 70 22 L84 32 L94 92 L82 94 L72 50 L72 106 L28 106 L28 50 L18 94 L6 92 L16 32 Z',
    shirt: 'M32 16 L44 12 L50 20 L56 12 L68 16 L84 30 L92 90 L80 92 L70 46 L70 106 L30 106 L30 46 L20 92 L8 90 L16 30 Z',
    'crop top': 'M30 26 L42 20 Q50 26 58 20 L70 26 L84 40 L74 50 L70 44 L70 78 L30 78 L30 44 L26 50 L16 40 Z',
    sweater: 'M30 18 Q50 26 70 18 L84 30 L92 94 L80 96 L72 48 L72 106 L28 106 L28 48 L20 96 L8 94 L16 30 Z',
    blazer: 'M30 14 L50 52 L70 14 L84 28 L92 94 L80 96 L72 48 L72 108 L28 108 L28 48 L20 96 L8 94 L16 28 Z',
    jersey: 'M30 18 L42 12 Q50 20 58 12 L70 18 L80 26 L72 40 L72 106 L28 106 L28 40 L20 26 Z',
    jeans: 'M28 10 L72 10 L76 112 L56 112 L50 42 L44 112 L24 112 Z',
    cargos: 'M26 10 L74 10 L80 112 L56 112 L50 44 L44 112 L20 112 Z',
    skirt: 'M34 18 L66 18 L84 94 L16 94 Z',
    shorts: 'M26 30 L74 30 L80 82 L56 82 L50 56 L44 82 L20 82 Z',
    trousers: 'M30 10 L70 10 L72 112 L54 112 L50 40 L46 112 L28 112 Z',
    flares: 'M32 10 L68 10 L66 70 L82 112 L56 112 L50 44 L44 112 L18 112 L34 70 Z',
    sneakers: 'M12 66 Q14 54 26 54 L46 60 Q58 62 66 70 L88 76 Q94 80 92 88 L12 88 Z',
    boots: 'M24 18 L50 18 L52 62 Q60 66 76 70 Q90 74 90 86 L22 86 Z',
    loafers: 'M12 74 Q14 64 30 62 L58 64 Q74 66 88 76 Q92 82 88 86 L12 86 Z',
    heels: 'M16 52 L30 48 Q56 70 88 74 L88 84 L62 84 L56 80 L28 64 L26 92 L20 92 L20 64 Z',
    'chunky kicks': 'M10 62 Q12 48 26 48 L48 54 Q62 56 70 64 L90 70 Q96 76 94 84 L94 94 L10 94 Z',
    slides: 'M10 80 Q12 72 24 72 L86 72 Q94 74 92 82 L10 84 Z M24 60 Q50 52 70 62 L70 74 L24 74 Z',
  };
  function draw(piece) {
    var c = piece.color.h, edge = shade(c, -40);
    var extra = '';
    if (piece.shape === 'shirt') extra = '<path d="M50 20 L50 104" stroke="' + edge + '" stroke-width="2" stroke-dasharray="2 8"/>';
    if (piece.shape === 'jersey') extra = '<text x="50" y="74" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="26" fill="' + shade(c, c === '#f7f5ef' ? -120 : 90) + '">23</text>';
    if (piece.shape === 'hoodie') extra = '<path d="M38 70 L62 70 L64 86 L36 86 Z" fill="' + shade(c, -18) + '"/>';
    if (piece.shape === 'cargos') extra = '<rect x="22" y="58" width="12" height="14" rx="2" fill="' + shade(c, -20) + '"/><rect x="66" y="58" width="12" height="14" rx="2" fill="' + shade(c, -20) + '"/>';
    if (piece.shape === 'chunky kicks' || piece.shape === 'sneakers') extra = '<path d="M12 86 L92 86" stroke="#f7f5ef" stroke-width="' + (piece.shape === 'sneakers' ? 4 : 10) + '"/>';
    return '<svg viewBox="0 0 100 120" aria-hidden="true"><path d="' + SHAPES[piece.shape] + '" fill="' + c + '" stroke="' + edge + '" stroke-width="2.5" stroke-linejoin="round"/>' + extra + '</svg>';
  }

  // ---- Game state ------------------------------------------------------------------------------
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('wearday:slots:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('wearday:slots:' + k, JSON.stringify(v)); } catch (e) {} },
  };
  var rnd = function (a) { return a[Math.floor(Math.random() * a.length)]; };
  var randomPiece = function (slot) { var s = rnd(SLOTS[slot]); return { shape: s[0], tags: s[1], color: rnd(COLORS) }; };
  var today = new Date();
  var seed = today.getFullYear() * 400 + today.getMonth() * 31 + today.getDate();
  var theme = NAMES[seed % NAMES.length];

  var reels = [].slice.call(root.querySelectorAll('.reel'));
  var pieces = [randomPiece(0), randomPiece(1), randomPiece(2)];
  var locked = [false, false, false];
  var spinning = false;
  var last = null;
  var best = store.get('best', null), streak = store.get('streak', 0);

  var $ = function (id) { return document.getElementById(id); };
  $('theme-pill').textContent = AES[theme].e + ' today: ' + theme;
  $('daily-theme').textContent = 'today’s theme (' + theme + ')';
  $('best').textContent = best == null ? '–' : best;
  $('streak').textContent = streak;

  function render(i) {
    var r = reels[i], p = pieces[i];
    r.querySelector('svg') && r.removeChild(r.querySelector('svg'));
    r.insertAdjacentHTML('afterbegin', draw(p));
    r.querySelector('.label').textContent = p.color.n + ' ' + p.shape;
    r.setAttribute('aria-label', p.color.n + ' ' + p.shape + (locked[i] ? ', locked' : ', tap to lock'));
  }
  reels.forEach(function (_, i) { render(i); });

  function toggleLock(i) {
    if (spinning) return;
    locked[i] = !locked[i];
    reels[i].classList.toggle('locked', locked[i]);
    reels[i].setAttribute('aria-pressed', String(locked[i]));
    reels[i].querySelector('.lock').textContent = locked[i] ? '🔒 locked' : 'tap to lock';
    render(i);
  }
  reels.forEach(function (r, i) { r.addEventListener('click', function () { toggleLock(i); }); });

  // ---- Scoring ---------------------------------------------------------------------------------
  function score(ps) {
    var tally = {};
    NAMES.forEach(function (n) { tally[n] = 0; });
    ps.forEach(function (p) {
      p.tags.forEach(function (t) { tally[t] += 2; });
      (FAMILY_TAGS[p.color.f] || []).forEach(function (t) { tally[t] += 1; });
    });
    var vibe = NAMES.slice().sort(function (a, b) { return tally[b] - tally[a]; })[0];
    var shared = ps.filter(function (p) { return p.tags.indexOf(vibe) >= 0; }).length;

    var fams = ps.map(function (p) { return p.color.f; });
    var count = function (f) { return fams.filter(function (x) { return x === f; }).length; };
    var neutrals = count('neutral') + count('dark');
    var s = 52 + shared * 9;
    var mono = ps[0].color.n === ps[1].color.n && ps[1].color.n === ps[2].color.n;
    if (mono) s += 16;
    else if (neutrals === 3) s += 12;
    else if (neutrals === 2) s += 8;
    if (count('bright') >= 2 && ps.filter(function (p) { return p.color.f === 'bright'; }).map(function (p) { return p.color.n; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).length > 1) s -= 14;
    if (count('earth') >= 2 || count('pastel') >= 2) s += 7;
    s += Math.round(Math.random() * 10 - 4);
    var themed = vibe === theme;
    if (themed) s = Math.round(s * 1.2);
    return { score: Math.max(31, Math.min(100, s)), vibe: vibe, themed: themed, mono: mono };
  }

  function verdict(r) {
    var base = r.score >= 95 ? 'ate and left no crumbs. 💅'
      : r.score >= 85 ? 'certified serve. the mirror is shook.'
      : r.score >= 70 ? 'low-key a look. one tweak from iconic.'
      : r.score >= 55 ? 'it’s giving… a Tuesday. lock your fave and respin.'
      : 'the fit is… a choice. bravely spin again.';
    return base + ' ' + rnd(AES[r.vibe].lines) + (r.themed ? ' (+20% theme bonus ✨)' : '') + (r.mono ? ' Monochrome serve!' : '');
  }

  // ---- Spin ------------------------------------------------------------------------------------
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

  function spin() {
    if (spinning) return;
    if (locked.every(Boolean)) { $('verdict').textContent = 'Everything’s locked. Unlock a piece to spin it.'; return; }
    spinning = true;
    $('spin').disabled = true;
    var stops = [700, 1000, 1300];
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    reels.forEach(function (r, i) {
      if (locked[i]) return;
      r.classList.remove('landed');
      r.classList.add('spinning');
      var t = setInterval(function () { pieces[i] = randomPiece(i); render(i); }, reduced ? 400 : 80);
      setTimeout(function () {
        clearInterval(t);
        pieces[i] = randomPiece(i);
        r.classList.remove('spinning');
        render(i);
        void r.offsetWidth;
        r.classList.add('landed');
        buzz(12);
      }, reduced ? 200 : stops[i]);
    });
    setTimeout(finish, reduced ? 260 : 1400);
  }

  function finish() {
    spinning = false;
    $('spin').disabled = false;
    $('spin').textContent = 'Spin again';
    var r = score(pieces);
    last = r;
    $('vibe').textContent = AES[r.vibe].e + ' ' + r.vibe;
    $('score').textContent = r.score + '%';
    $('meter').style.width = r.score + '%';
    $('verdict').textContent = verdict(r);
    streak = r.score >= 70 ? streak + 1 : 0;
    store.set('streak', streak);
    $('streak').textContent = streak;
    if (best == null || r.score > best) { best = r.score; store.set('best', best); $('best').textContent = best; }
    if (r.score >= 85) { confetti(); buzz([20, 40, 20]); }
  }

  $('spin').addEventListener('click', spin);
  document.addEventListener('keydown', function (e) {
    if (/input|textarea|select/i.test(e.target.tagName)) return;
    var rect = root.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight) return;
    if (e.code === 'Space') { e.preventDefault(); spin(); }
    if (e.key === '1' || e.key === '2' || e.key === '3') toggleLock(Number(e.key) - 1);
  });

  $('share').addEventListener('click', function () {
    var fit = pieces.map(function (p) { return p.color.n + ' ' + p.shape; }).join(' + ');
    var text = last ? 'My fit scored ' + last.score + '% drip (' + last.vibe + ' ' + AES[last.vibe].e + '): ' + fit + '. Beat me on Wearday 👀' : 'Spin a fit on Wearday 🎰';
    var url = 'https://wearday.asanoha.co.in/#play';
    if (navigator.share) navigator.share({ title: 'Fit Slots · Wearday', text: text, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).then(function () { $('verdict').textContent = 'Copied! Paste it in the group chat.'; });
  });

  // ---- Confetti ------------------------------------------------------------------------------
  function confetti() {
    var cv = $('confetti');
    if (!cv || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    var cols = ['#7c4dff', '#ff4fd8', '#c6ff3d', '#a58bff', '#ffffff'];
    var box = root.getBoundingClientRect();
    var parts = Array.from({ length: 140 }, function () {
      return { x: box.left + box.width / 2, y: box.top + box.height / 3, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 14 - 4, r: Math.random() * 6 + 3, c: rnd(cols), a: Math.random() * 6, s: Math.random() > 0.5 };
    });
    var start = performance.now();
    (function frame(t) {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.a += 0.15;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        if (p.s) ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2, 0, 7); ctx.fill(); }
        ctx.restore();
      });
      if (t - start < 1800) requestAnimationFrame(frame); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })(start);
  }
})();
