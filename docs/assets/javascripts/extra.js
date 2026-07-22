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

// "Next" box countdowns: each .dkh-countdown carries a data-target ISO date; fill in "X days" (set
// once on load — the site has no need for a live-ticking clock here).
(function () {
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  document.querySelectorAll(".dkh-countdown[data-target]").forEach(function (el) {
    var valueEl = el.querySelector(".dkh-countdown__value");
    if (!valueEl) return;

    var target = new Date(el.getAttribute("data-target"));
    var days = Math.ceil((target - new Date()) / MS_PER_DAY);

    if (isNaN(days)) {
      valueEl.textContent = "—";
    } else if (days > 0) {
      valueEl.textContent = days + (days === 1 ? " day" : " days");
    } else if (days === 0) {
      valueEl.textContent = "today";
    } else {
      valueEl.textContent = "passed";
    }
  });
})();
