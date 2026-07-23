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
      if (Math.random() < DOUBLE_BLINK_CHANCE) {
        doBlink(function () {
          doBlink(scheduleNext);
        });
      } else {
        doBlink(scheduleNext);
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

  var words = ["neuroscientist.", "strategist.", "writer.", "photographer.", "human."];
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
