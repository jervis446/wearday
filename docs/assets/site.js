/* Wearday website: theme switch, scroll reveals, draggable stickers, tilting phones. */
(function () {
  var root = document.documentElement;
  var btn = document.querySelector('[data-theme-toggle]');
  if (btn) {
    btn.addEventListener('click', function () {
      var dark = root.dataset.theme ? root.dataset.theme === 'dark' : !matchMedia('(prefers-color-scheme: light)').matches;
      root.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('wearday:theme', root.dataset.theme); } catch (e) {}
    });
  }

  // Header button says "Sign in" until you're signed in to your Asanoha account (shared cookie on .asanoha.co.in).
  var accBtn = document.querySelector('.nav-links a.btn[href="/account.html"]');
  if (accBtn && !/(?:^|; )asanoha-auth\.n=/.test(document.cookie)) accBtn.textContent = 'Sign in';

  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    reveals.forEach(function (el) { io.observe(el); });
  } else reveals.forEach(function (el) { el.classList.add('in'); });

  // Drag the hero stickers around.
  document.querySelectorAll('.sticker').forEach(function (el) {
    var sx, sy, ox = 0, oy = 0;
    el.addEventListener('pointerdown', function (e) {
      el.setPointerCapture(e.pointerId); sx = e.clientX - ox; sy = e.clientY - oy; el.style.animation = 'none'; el.style.zIndex = 5;
    });
    el.addEventListener('pointermove', function (e) {
      if (!el.hasPointerCapture(e.pointerId)) return;
      ox = e.clientX - sx; oy = e.clientY - sy; el.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(1.06)';
    });
    el.addEventListener('pointerup', function () { el.style.transform = 'translate(' + ox + 'px,' + oy + 'px)'; });
  });

  // Phones lean towards the pointer.
  var phones = document.querySelector('.phones');
  if (phones && matchMedia('(hover: hover)').matches) {
    phones.addEventListener('pointermove', function (e) {
      var r = phones.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      phones.querySelectorAll('.phone').forEach(function (p, i) {
        var base = i ? 'translateX(-10%) rotate(6deg)' : 'translateX(-80%) rotate(-7deg)';
        p.style.transform = base + ' rotateY(' + x * 14 + 'deg) rotateX(' + -y * 10 + 'deg)';
      });
    });
    phones.addEventListener('pointerleave', function () { phones.querySelectorAll('.phone').forEach(function (p) { p.style.transform = ''; }); });
  }
})();
