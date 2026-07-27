// Aurora dark-mode background: generates a sparse ambient star field plus a fixed, slightly
// brighter Orion's Belt asterism (see .dkh-aurora-bg in extra.css). Each ambient star needs its OWN
// random position/size/timing so they flicker independently rather than as one synchronized layer
// — a single CSS background-image of dots can't do that (an animation on the container would fade
// them all together), so this is genuinely one of the few places actual per-element randomization
// needs real DOM nodes rather than pure CSS. Runs once regardless of the current light/dark toggle
// state — the stars just sit invisible under display:none (light mode) until the CSS reveals them,
// no need to regenerate on toggle.
(function () {
  var container = document.querySelector("[data-dkh-stars]");
  if (!container) return;

  var STAR_COUNT = 40;
  var fragment = document.createDocumentFragment();

  for (var i = 0; i < STAR_COUNT; i++) {
    var star = document.createElement("div");
    star.className = "dkh-aurora-bg__star";
    star.style.top = Math.random() * 100 + "%";
    star.style.left = Math.random() * 100 + "%";
    star.style.setProperty("--dkh-star-size", (Math.random() * 1.6 + 0.8).toFixed(2) + "px");
    star.style.setProperty("--dkh-twinkle-peak", (Math.random() * 0.5 + 0.4).toFixed(2));
    star.style.setProperty("--dkh-twinkle-duration", (Math.random() * 7 + 6).toFixed(2) + "s");
    star.style.setProperty("--dkh-twinkle-delay", (Math.random() * -18).toFixed(2) + "s");
    fragment.appendChild(star);
  }

  // Orion's Belt: fixed positions (not randomized — it's meant to be the same recognizable
  // asterism every time, not a random cluster), bigger and a higher twinkle peak than the ambient
  // stars so it reads as a distinct, brighter feature rather than blending into the scatter.
  var belt = [
    { left: "66%", top: "20%" },
    { left: "69%", top: "22.5%" },
    { left: "72%", top: "25%" },
  ];
  belt.forEach(function (pos, index) {
    var star = document.createElement("div");
    star.className = "dkh-aurora-bg__star";
    star.style.left = pos.left;
    star.style.top = pos.top;
    star.style.setProperty("--dkh-star-size", "2.4px");
    star.style.setProperty("--dkh-twinkle-peak", "0.9");
    star.style.setProperty("--dkh-twinkle-duration", (8 + index * 1).toFixed(2) + "s");
    star.style.setProperty("--dkh-twinkle-delay", (index * -3).toFixed(2) + "s");
    fragment.appendChild(star);
  });

  container.appendChild(fragment);
})();

// Diagonal light rays (see .dkh-aurora-bg__ray in extra.css): each ray needs its own randomized
// position/angle/timing so the fluttering/fading reads as independent rays rather than one
// synchronized layer. Originally animated with plain CSS @keyframes, which turned out to have a
// mobile-only bug: those keyframes run entirely in the browser's own animation engine with no JS
// re-checking them, and some mobile browsers fail to properly resume an infinite CSS animation
// after its ancestor (.dkh-aurora-bg) toggles display:none -> block (light mode -> dark mode ->
// light -> dark again) — the ray would get stuck invisible until a full page reload. The blobs
// never had this problem because they're driven by a live requestAnimationFrame loop that
// re-checks the current color scheme and re-writes styles every single frame, so they self-heal
// from any interruption automatically. Rays now use that same JS-driven pattern instead of CSS
// animation, for the same robustness.
(function () {
  var container = document.querySelector("[data-dkh-rays]");
  if (!container) return;

  // Mobile only (same 960px breakpoint as extra.css): rays read fainter on mobile since the blobs
  // that normally layer under/around them are hidden there (see the mobile-only block in
  // extra.css), so they're doubled here specifically to compensate.
  var RAY_PEAK_OPACITY = window.innerWidth <= 960 ? 0.5 : 0.25;
  var DRIFT_RANGE_VW = 1.5;
  var reduceMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var fragment = document.createDocumentFragment();
  var rays = [];

  // batch(): a group of rays sharing a left-position range, a peak opacity, and (optionally) an
  // extra class for a color variant — used once for the original set, once more for the paler
  // secondary set further right (see below).
  function batch(count, leftMin, leftRange, peakOpacity, extraClass) {
    for (var i = 0; i < count; i++) {
      var ray = document.createElement("div");
      ray.className = extraClass ? "dkh-aurora-bg__ray " + extraClass : "dkh-aurora-bg__ray";
      ray.style.left = (Math.random() * leftRange + leftMin).toFixed(1) + "vw";
      ray.style.marginTop = (Math.random() * 20 - 15).toFixed(1) + "vh";
      ray.style.setProperty("--dkh-ray-angle", (-(18 + Math.random() * 12)).toFixed(1) + "deg");
      fragment.appendChild(ray);
      rays.push({
        el: ray,
        peakOpacity: peakOpacity,
        fadePeriodMs: (Math.random() * 6 + 8) * 1000,
        driftPeriodMs: (Math.random() * 8 + 10) * 1000,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  // Mobile only (same 960px breakpoint as elsewhere): 5 primary rays instead of 10 — the pale set
  // is already hidden entirely on mobile via CSS, and the primary set is now wider there too (see
  // extra.css), so fewer, bigger rays reads better than the desktop density at that width.
  var isMobile = window.innerWidth <= 960;
  batch(isMobile ? 5 : 10, -8, 28, RAY_PEAK_OPACITY);
  batch(10, 21, 28, RAY_PEAK_OPACITY * 0.2, "dkh-aurora-bg__ray--pale");

  container.appendChild(fragment);

  if (reduceMotion) {
    rays.forEach(function (ray) {
      ray.el.style.opacity = String(ray.peakOpacity * 0.6);
    });
    return;
  }

  function animateRay(ray) {
    function update() {
      requestAnimationFrame(update);
      if (document.body.getAttribute("data-md-color-scheme") !== "slate") return;

      var now = Date.now();
      var fade = (Math.sin((now / ray.fadePeriodMs) * Math.PI * 2 + ray.phase) + 1) / 2;
      var drift = Math.sin((now / ray.driftPeriodMs) * Math.PI * 2 + ray.phase);

      ray.el.style.opacity = (fade * ray.peakOpacity).toFixed(3);
      ray.el.style.marginLeft = (drift * DRIFT_RANGE_VW).toFixed(2) + "vw";
    }
    update();
  }

  rays.forEach(animateRay);
})();

// Aurora blobs (dark mode only, see .dkh-aurora-bg__blob in extra.css): 5 full-viewport-sized,
// heavily-blurred circles doing an independent slow random walk with a gentle scale pulse,
// cross-fading through a few saturated color palettes over time. Ported closely from a reference
// the user found and asked for directly (colors, blur radius, walk/parallax logic) rather than
// designed from scratch. Runs continuously via requestAnimationFrame but only writes new
// transforms while dark mode is active — checked fresh each frame, so it reacts to the light/dark
// toggle with no separate listener needed, same as the rest of this file's dark-mode pieces.
(function () {
  var container = document.querySelector("[data-dkh-aurora-blobs]");
  if (!container) return;

  // Reds, pinks, and purples as the core palette; emerald green and turquoise blue mixed in as
  // recurring (but not dominant) accents — oranges/yellows dropped entirely.
  var COLOR_SETS = [
    ["rgba(255,51,85,0.7)", "rgba(255,45,149,0.7)", "rgba(155,48,255,0.7)", "rgba(34,197,94,0.7)", "rgba(26,188,201,0.7)"],
    ["rgba(255,20,147,0.7)", "rgba(123,0,255,0.7)", "rgba(255,45,85,0.7)", "rgba(255,110,199,0.7)", "rgba(34,197,94,0.7)"],
    ["rgba(157,78,221,0.7)", "rgba(255,77,109,0.7)", "rgba(255,93,162,0.7)", "rgba(34,197,94,0.7)", "rgba(26,188,201,0.7)"],
  ];
  var BLOB_COUNT = 5;
  var FADE_MS = 4000;
  var CYCLE_MS = 30000;
  var MAX_OPACITY = "0.09";
  var SPEED_RANGE = 0.0125;
  var PULSE_SPEED = 0.0001;
  var Y_SHIFT = 20;

  var currentSet = 0;
  var blobs = [];
  for (var i = 0; i < BLOB_COUNT; i++) {
    var blob = document.createElement("div");
    blob.className = "dkh-aurora-bg__blob";
    blob.style.background = COLOR_SETS[currentSet][i];
    container.appendChild(blob);
    blobs.push(blob);
    (function (el, delay) {
      setTimeout(function () {
        el.style.opacity = MAX_OPACITY;
      }, delay);
    })(blob, i * 300);
  }

  setInterval(function () {
    currentSet = (currentSet + 1) % COLOR_SETS.length;
    blobs.forEach(function (blob) {
      blob.style.opacity = "0";
    });
    setTimeout(function () {
      blobs.forEach(function (blob, index) {
        blob.style.background = COLOR_SETS[currentSet][index];
        blob.style.opacity = MAX_OPACITY;
      });
    }, FADE_MS);
  }, CYCLE_MS);

  function animateBlob(el, index) {
    var x = Math.random() * 100;
    var y = Math.random() * 100;
    var xSpeed = (Math.random() - 0.5) * SPEED_RANGE;
    var ySpeed = (Math.random() - 0.5) * SPEED_RANGE;
    var parallax = 0.5 + index * 0.1;

    function update() {
      requestAnimationFrame(update);
      if (document.body.getAttribute("data-md-color-scheme") !== "slate") return;

      x += xSpeed;
      y += ySpeed;
      if (Math.random() < 0.005) {
        xSpeed = (Math.random() - 0.5) * SPEED_RANGE;
        ySpeed = (Math.random() - 0.5) * SPEED_RANGE;
      }
      if (x > 120) x = -20;
      if (x < -20) x = 120;
      if (y > 120) y = -20;
      if (y < -20) y = 120;

      var pulse = 1 + Math.sin(Date.now() * PULSE_SPEED * (index + 1)) * 0.2;
      el.style.transform = "translate(" + x * parallax + "%, " + (y + Y_SHIFT) * parallax + "%) scale(" + pulse + ")";
    }
    update();
  }

  blobs.forEach(animateBlob);
})();

// Header shrink-on-scroll: toggles .dkh-scrolled on <html> past a small threshold (extra.css keys
// the logo's scale-down off that class). mkdocs-material 9.7.7 dropped the older data-md-state
// scroll toggling in favor of a static class set at template-render time, so there's no built-in
// hook left to piggyback on — this is the one place a hand-written scroll listener is unavoidable.
(function () {
  var THRESHOLD = 40;
  var ticking = false;

  function apply() {
    document.documentElement.classList.toggle("dkh-scrolled", window.scrollY > THRESHOLD);
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        window.requestAnimationFrame(apply);
        ticking = true;
      }
    },
    { passive: true }
  );

  apply();
})();

// Scroll-to-top button (mobile only, see .dkh-scrolltop in extra.css): the mobile header scrolls
// away with the page instead of staying pinned (see extra.css), so on a long page the hamburger
// drawer trigger scrolls out of reach too. This button is the way back to it. Own threshold and
// listener rather than reusing .dkh-scrolled above — that one's tuned to appear almost immediately
// to trigger the header's shrink effect, this should only show once you're far enough down that
// swiping back to the top by hand would actually be annoying.
(function () {
  var button = document.querySelector(".dkh-scrolltop");
  if (!button) return;

  var THRESHOLD = 400;
  var ticking = false;

  function apply() {
    document.documentElement.classList.toggle("dkh-show-scrolltop", window.scrollY > THRESHOLD);
    ticking = false;
  }

  window.addEventListener(
    "scroll",
    function () {
      if (!ticking) {
        window.requestAnimationFrame(apply);
        ticking = true;
      }
    },
    { passive: true }
  );

  button.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  apply();
})();

// Face icon: blinks on its own (briefly swaps to the eyes-closed artwork, same as the hover
// state, just triggered by a class instead of :hover — see .dkh-blink in extra.css). Randomized
// gap between blinks, with an occasional quick double-blink, reads more like an actual blink than
// a fixed metronome interval would.
(function () {
  var els = document.querySelectorAll(".dkh-logo-swap");
  if (!els.length) return;

  var BLINK_DURATION = 100;
  var DOUBLE_BLINK_GAP = 120;
  var DOUBLE_BLINK_CHANCE = 0.4;
  var MIN_GAP = 6000;
  var MAX_GAP = 14000;

  function setClosed(closed) {
    els.forEach(function (el) {
      el.classList.toggle("dkh-blink", closed);
    });
  }

  function setInstant(instant) {
    els.forEach(function (el) {
      el.classList.toggle("dkh-blink-instant", instant);
    });
  }

  function doBlink(done) {
    setClosed(true);
    setTimeout(function () {
      setClosed(false);
      if (done) setTimeout(done, DOUBLE_BLINK_GAP);
    }, BLINK_DURATION);
  }

  function scheduleNext() {
    var delay = MIN_GAP + Math.random() * (MAX_GAP - MIN_GAP);
    setTimeout(function () {
      setInstant(true);
      function finish() {
        setInstant(false);
        scheduleNext();
      }
      if (Math.random() < DOUBLE_BLINK_CHANCE) {
        doBlink(function () {
          doBlink(finish);
        });
      } else {
        doBlink(finish);
      }
    }, delay);
  }

  scheduleNext();
})();

// Hero role text: types a word, pauses, deletes it, moves to the next. Hand-written in place of a
// typing-effect library — timings mirror Teddy's typed.js config (startDelay 700, type/backSpeed 60,
// backDelay 1200, loop) so the feel matches, without adding a dependency.
(function () {
  var el = document.getElementById("dkh-typed");
  if (!el) return;

  var words = ["neuroscientist.", "storyteller.", "strategist.", "human."];
  var wordIndex = 0;
  var charIndex = 0;
  var deleting = false;

  var TYPE_SPEED = 60;
  var BACK_SPEED = 60;
  var BACK_DELAY = 1200;
  var START_DELAY = 700;

  function tick() {
    var word = words[wordIndex];

    if (!deleting) {
      charIndex++;
      el.textContent = word.slice(0, charIndex);
      if (charIndex === word.length) {
        deleting = true;
        setTimeout(tick, BACK_DELAY);
        return;
      }
      setTimeout(tick, TYPE_SPEED);
    } else {
      charIndex--;
      el.textContent = word.slice(0, charIndex);
      if (charIndex === 0) {
        deleting = false;
        wordIndex = (wordIndex + 1) % words.length;
      }
      setTimeout(tick, BACK_SPEED);
    }
  }

  setTimeout(tick, START_DELAY);
})();

// Hero "here" links -> matching nav pill item: hovering a "here" link in the hero paragraph glows
// the nav item it points to (see .dkh-prism in extra.css), so the connection between the inline
// mention and the actual nav destination is visually obvious. Matched by slug rather than exact
// resolved URL: the target pages (about.md, gallery.md, etc.) don't exist yet, so mkdocs can't
// compute a real URL for those nav entries and falls back to the raw declared path from
// mkdocs.yml's nav: list ("about.md", "epilogue/index.md") instead of the eventual "about/",
// "epilogue/" — slug-matching (strip .md / trailing "index" / slashes) works against both that
// placeholder form and the real one once those pages exist, so this doesn't need revisiting later.
(function () {
  var sourceLinks = document.querySelectorAll(".dkh-hero__sub a[href]");
  var navLinks = document.querySelectorAll(".dkh-nav__link[href]");
  if (!sourceLinks.length || !navLinks.length) return;

  function slugOf(href) {
    return href
      .replace(/^\.?\//, "")
      .replace(/\.md$/, "")
      .replace(/\/index$/, "")
      .replace(/\/$/, "")
      .toLowerCase();
  }

  sourceLinks.forEach(function (link) {
    var targetSlug = slugOf(link.getAttribute("href"));
    var match = null;
    navLinks.forEach(function (navLink) {
      if (slugOf(navLink.getAttribute("href")) === targetSlug) match = navLink;
    });
    if (!match) return;

    link.addEventListener("mouseenter", function () {
      match.classList.add("dkh-prism");
    });
    link.addEventListener("mouseleave", function () {
      match.classList.remove("dkh-prism");
    });
  });
})();

// "Next" box countdowns: each .dkh-countdown carries a data-target ISO date-time WITH an explicit
// UTC offset (e.g. "...+01:00") — a date-time string with no offset parses as the VIEWER's own
// local time per the Date spec, so every visitor would see a different countdown to what's meant
// to be the same real-world moment. An explicit offset fixes the target to one moment for
// everyone. Re-renders every 30s (not just once on load) now that it shows minutes, not just days.
(function () {
  var MS_PER_MINUTE = 60 * 1000;
  var MS_PER_HOUR = 60 * MS_PER_MINUTE;
  var MS_PER_DAY = 24 * MS_PER_HOUR;

  function render() {
    document.querySelectorAll(".dkh-countdown[data-target]").forEach(function (el) {
      var valueEl = el.querySelector(".dkh-countdown__value");
      if (!valueEl) return;

      var target = new Date(el.getAttribute("data-target"));
      var diff = target - new Date();

      if (isNaN(diff)) {
        valueEl.textContent = "—";
        return;
      }
      if (diff <= 0) {
        valueEl.textContent = diff > -MS_PER_MINUTE ? "now" : "passed";
        return;
      }

      var days = Math.floor(diff / MS_PER_DAY);
      var hours = Math.floor((diff % MS_PER_DAY) / MS_PER_HOUR);
      var minutes = Math.floor((diff % MS_PER_HOUR) / MS_PER_MINUTE);

      var parts = [];
      if (days > 0) parts.push(days + "d");
      if (days > 0 || hours > 0) parts.push(hours + "h");
      parts.push(minutes + "m");
      valueEl.textContent = parts.join(" ");
    });
  }

  render();
  setInterval(render, 30000);
})();
