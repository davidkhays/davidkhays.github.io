import { db, auth } from "./firebase-init.js";
import {
  doc,
  getDocs,
  setDoc,
  addDoc,
  collection,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

// ---- Static layout: areas + pot positions/sizes. Not stored in Firestore — this is the
// physical arrangement of real pots, which only changes when David rearranges them in person, so
// it's edited here in code rather than through the UI.
//
// Area 1 is a CSS grid (see .stage--area1 in style.css) on an 8-column track — double the visual
// 4-column resolution so a 3-pot row can sit on a half-column offset and land centered under the
// 4-pot rows below it. col/row are 1-indexed grid line starts.
//
// Area 2 is free-form absolute positioning (x/y are percentages of the stage) instead of grid —
// its cluster shapes (a stacked pair, a triangle, a 2x2) don't line up on a shared column grid
// with Area 1's rows, so this matches the reference sketch directly rather than fighting a grid
// to approximate it.
const AREAS = [
  { id: "area1", name: "Nursery 1" },
  { id: "area2", name: "Nursery 2" },
];

function row(areaId, size, gridRow, cols) {
  return cols.map((col) => ({ areaId, size, col, row: gridRow }));
}

// No ids here — assigned below, computed from reading order (top-to-bottom, then left-to-right,
// restarting at 1 per area) so a pot's Firestore id always exactly matches the "Pot #N" shown to
// the user, with no chance of the two drifting apart the way hand-assigned ids could.
const POT_LAYOUT_RAW = [
  // Area 1: 19 small pots, staggered rows of 3/4/4/4/4 (grid row 4 is an empty spacer row,
  // matching the visible gap in the reference photo between the two row-clusters). Row 1's 3
  // pots sit at columns 2/4/6 — centered under row 2-3-5-6's columns 1/3/5/7.
  ...row("area1", "small", 1, [2, 4, 6]),
  ...row("area1", "small", 2, [1, 3, 5, 7]),
  ...row("area1", "small", 3, [1, 3, 5, 7]),
  ...row("area1", "small", 5, [1, 3, 5, 7]),
  ...row("area1", "small", 6, [1, 3, 5, 7]),
  // Area 2 top cluster (5 small pots): 2 stacked directly on top of each other on the left,
  // 3 in a triangle on the right (one on top, centered over two below). The left pair sits at
  // col2 (not col1), inset one column from the stage's left edge — the triangle's base is
  // shifted to end at col8's inner line (not the true edge) to match that same one-column inset
  // on the right, instead of flush-hugging the edge the way a naive mirror of the medium pot's
  // own width would.
  { areaId: "area2", size: "small", col: 2, row: 1 },
  { areaId: "area2", size: "small", col: 2, row: 2 },
  { areaId: "area2", size: "small", col: 5, row: 1 },
  // p4/p5 justify toward each other (end/start instead of the default center) — they're already
  // grid-adjacent (touching cells), so this is what actually pulls the circles closer together
  // instead of just centering each one in its own cell with the gap that leaves.
  { areaId: "area2", size: "small", col: 4, row: 2, justify: "end" },
  { areaId: "area2", size: "small", col: 6, row: 2, justify: "start" },
  // Below: 4 medium pots in a 2x2 grid (grid row 3 is an empty spacer between the clusters;
  // grid row 6 is a second, smaller spacer between the medium pots' own top and bottom pairs).
  { areaId: "area2", size: "medium", col: 1, row: 4 },
  { areaId: "area2", size: "medium", col: 5, row: 4 },
  { areaId: "area2", size: "medium", col: 1, row: 7 },
  { areaId: "area2", size: "medium", col: 5, row: 7 },
];

// Assigns ids by array order within each area — e.g. "area1-p1".."area1-p19",
// "area2-p1".."area2-p9" — so a pot's Firestore id always matches exactly what's shown to the
// user as "Pot #N" (see potNumber() below). Array order (not a recomputed row/col sort) is what
// determines the number: Area 1's rows are already listed top-to-bottom, left-to-right above, and
// Area 2 is listed by cluster (left pair, then triangle, then the 2x2) rather than strict
// top-to-bottom position, per David's numbering.
const POT_LAYOUT = AREAS.flatMap((area) => {
  const pots = POT_LAYOUT_RAW.filter((p) => p.areaId === area.id);
  return pots.map((p, i) => ({ ...p, id: `${area.id}-p${i + 1}` }));
});

function potNumber(potId) {
  return potId.split("-p")[1];
}

const STATUS_COLORS = {
  thriving: "var(--thriving)",
  good: "var(--good)",
  watch: "var(--watch)",
  critical: "var(--critical)",
  dead: "var(--dead)",
};
const STATUS_OUTLINE_COLORS = {
  thriving: "var(--thriving-outline)",
  good: "var(--good-outline)",
  watch: "var(--watch-outline)",
  critical: "var(--critical-outline)",
  dead: "var(--dead-outline)",
};
const STATUS_LABELS = {
  thriving: "Thriving",
  good: "Good",
  watch: "Watch",
  critical: "Critical",
  dead: "Dead",
};
const DEFAULT_POT_DATA = { plantedDate: "", parentPod: "", soilType: "", status: "watch", notes: "", statusHistory: [] };
const PARENT_POD_ICONS = {
  Criollo: "assets/pods/criollo.png",
  Forastero: "assets/pods/forastero.png",
  Trinitario: "assets/pods/trinitario.png",
};
// Levels tracked on the status-history chart, worst to best won't matter here — order is
// top-to-bottom on the y-axis. "dead" is intentionally excluded (not one of the 4 chart levels).
const CHART_LEVELS = ["critical", "watch", "good", "thriving"];

let potData = {}; // potId -> Firestore fields, merged with defaults for pots with no doc yet
let currentAreaId = AREAS[0].id;
let isOwner = false;
let openPotId = null;
let openPotPhotos = [];
let photoIndex = 0;

// ---- Firestore data layer ----
async function loadPotData() {
  const snap = await getDocs(collection(db, "pots"));
  potData = {};
  snap.forEach((d) => {
    potData[d.id] = { ...DEFAULT_POT_DATA, ...d.data() };
  });
}
function getPot(potId) {
  return potData[potId] || { ...DEFAULT_POT_DATA };
}
async function savePotField(potId, changes) {
  potData[potId] = { ...getPot(potId), ...changes };
  await setDoc(doc(db, "pots", potId), changes, { merge: true });
}
async function loadPhotos(potId) {
  const q = query(collection(db, "pots", potId, "photos"), orderBy("uploadedAt", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function addPhoto(potId, dataUrl) {
  await addDoc(collection(db, "pots", potId, "photos"), {
    dataUrl,
    date: new Date().toISOString().slice(0, 10),
    uploadedAt: serverTimestamp(),
  });
}

// ---- Helpers ----
function daysSince(dateStr) {
  if (!dateStr) return null;
  // Tolerates "/" as well as "-" separators, and just hides the counter (rather than showing
  // "NaNd") for anything that still doesn't parse — a bad stored value shouldn't break the pot
  // card, just quietly show no day count until the date's corrected.
  const d = new Date(dateStr.replace(/\//g, "-") + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  return diff < 0 ? 0 : diff;
}
// Days under 42 (6 weeks) show as "Xd"; 42 up to 84 (12 weeks) show as weeks; 84+ show as
// months. Day-based thresholds (not rounded-weeks thresholds) so the switchover lands exactly
// where specified rather than a day early/late from rounding.
function formatAge(days) {
  if (days < 42) return `${days}d`;
  if (days < 84) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 28)}m`;
}
// Same thresholds as formatAge(), spelled out — used only in the popup header ("3 days old",
// "6 weeks old"), not the compact pot label.
function formatAgeLong(days) {
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days < 42) return plural(days, "day");
  if (days < 84) return plural(Math.round(days / 7), "week");
  return plural(Math.round(days / 28), "month");
}
function escapeHtml(s) {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// plantedDate is stored as ISO (YYYY-MM-DD, what daysSince()/<input type=date> would expect) but
// shown/typed as YYYY/MM/DD — a native <input type="date"> was the actual bug (its own picker
// closes the year segment early after 2 digits on some browsers), so Date Planted is a plain text
// input instead, with these two converting at the boundary.
function isoToDisplayDate(iso) {
  return iso ? iso.replace(/-/g, "/") : "";
}
function field(label, id, type, value, placeholder) {
  if (!isOwner) {
    const empty = !value;
    return `<div class="field"><label>${label}</label><div class="field-value${empty ? " field-value--empty" : ""}">${empty ? "Not set" : escapeHtml(value)}</div></div>`;
  }
  return `
    <div class="field">
      <label>${label}</label>
      <input type="${type}" id="${id}" value="${escapeHtml(value)}"${placeholder ? ` placeholder="${placeholder}"` : ""}>
    </div>`;
}
function selectField(label, id, value, options) {
  if (!isOwner) {
    const empty = !value;
    return `<div class="field"><label>${label}</label><div class="field-value${empty ? " field-value--empty" : ""}">${empty ? "Not set" : escapeHtml(value)}</div></div>`;
  }
  const optionTags = [`<option value="">Not set</option>`]
    .concat(options.map((o) => `<option value="${escapeHtml(o)}"${o === value ? " selected" : ""}>${escapeHtml(o)}</option>`))
    .join("");
  return `
    <div class="field">
      <label>${label}</label>
      <select id="${id}">${optionTags}</select>
    </div>`;
}
function dateField(label, id, isoValue) {
  if (!isOwner) {
    const empty = !isoValue;
    return `<div class="field"><label>${label}</label><div class="field-value${empty ? " field-value--empty" : ""}">${empty ? "Not set" : escapeHtml(isoToDisplayDate(isoValue))}</div></div>`;
  }
  const [y, m, d] = isoValue ? isoValue.split("-") : ["", "", ""];
  return `
    <div class="field">
      <label>${label}</label>
      <div class="date-parts" id="${id}">
        <input type="text" inputmode="numeric" maxlength="4" class="date-parts__y" placeholder="YYYY" value="${escapeHtml(y)}">
        <span class="date-parts__sep">/</span>
        <input type="text" inputmode="numeric" maxlength="2" class="date-parts__m" placeholder="MM" value="${escapeHtml(m)}">
        <span class="date-parts__sep">/</span>
        <input type="text" inputmode="numeric" maxlength="2" class="date-parts__d" placeholder="DD" value="${escapeHtml(d)}">
      </div>
    </div>`;
}
// Wires a dateField()'s three boxes: typing digits auto-advances to the next box on fill,
// backspacing on an empty box jumps back to the previous one AND deletes its last digit (so
// crossing a YYYY/MM/DD boundary feels like one continuous backspace, not a dead end), and saving
// happens on focusout of the whole group (via relatedTarget — only once focus actually leaves all
// three boxes, not on every individual box's blur while tabbing between them). An incomplete date
// just doesn't save yet — no blocking validation alert.
function wireDateParts(group) {
  if (!group) return;
  const yEl = group.querySelector(".date-parts__y");
  const mEl = group.querySelector(".date-parts__m");
  const dEl = group.querySelector(".date-parts__d");

  function digitsOnly(el, maxLen) {
    el.value = el.value.replace(/\D/g, "").slice(0, maxLen);
  }
  function backspaceToPrev(fromEl, toEl) {
    fromEl.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && fromEl.value === "") {
        e.preventDefault();
        toEl.value = toEl.value.slice(0, -1);
        toEl.focus();
        toEl.setSelectionRange(toEl.value.length, toEl.value.length);
      }
    });
  }

  yEl.oninput = () => {
    digitsOnly(yEl, 4);
    if (yEl.value.length === 4) mEl.focus();
  };
  mEl.oninput = () => {
    digitsOnly(mEl, 2);
    if (mEl.value.length === 2) dEl.focus();
  };
  dEl.oninput = () => digitsOnly(dEl, 2);

  backspaceToPrev(mEl, yEl);
  backspaceToPrev(dEl, mEl);

  group.addEventListener("focusout", (e) => {
    if (group.contains(e.relatedTarget)) return;
    const y = yEl.value;
    const m = mEl.value;
    const d = dEl.value;
    if (!y && !m && !d) {
      updatePot({ plantedDate: "" });
      return;
    }
    if (y.length === 4 && m.length === 2 && d.length === 2) {
      updatePot({ plantedDate: `${y}-${m}-${d}` });
    }
  });
}

// ---- Rendering ----
function renderAreaSelect() {
  const sel = document.getElementById("areaSelect");
  sel.innerHTML = AREAS.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  sel.value = currentAreaId;
}

function renderStage() {
  const stage = document.getElementById("stage");
  stage.className = `stage stage--${currentAreaId}`;
  const pots = POT_LAYOUT.filter((p) => p.areaId === currentAreaId);
  if (!pots.length) {
    stage.innerHTML = '<div class="empty-state">No pots in this area.</div>';
    return;
  }
  stage.innerHTML = pots
    .map((p) => {
      const data = getPot(p.id);
      const width = p.size === "medium" ? "40cqw" : "24.2cqw";
      const bg = STATUS_COLORS[data.status] || STATUS_COLORS.watch;
      const dead = data.status === "dead" ? "pot--dead" : "";
      const days = daysSince(data.plantedDate);
      const iconSrc = PARENT_POD_ICONS[data.parentPod];
      const posStyle =
        p.col !== undefined
          ? `grid-column:${p.col} / span ${p.size === "medium" ? 4 : 2}; grid-row:${p.row} / span ${p.size === "medium" ? 2 : 1};`
          : `position:absolute; left:${p.x}%; top:${p.y}%; transform:translate(-50%, -50%);`;
      const justifyStyle = p.justify ? `justify-self:${p.justify};` : "";
      return `
      <div class="pot ${dead}" style="${posStyle} ${justifyStyle} width:${width}; background:${bg};" data-pot="${p.id}">
        <div class="pot-body">
          ${iconSrc ? `<img class="pot-icon${data.parentPod === "Forastero" ? " pot-icon--forastero" : ""}" src="${iconSrc}" alt="" draggable="false">` : ""}
          ${days !== null ? `<span class="days">${formatAge(days)}</span>` : ""}
        </div>
      </div>`;
    })
    .join("");
  stage.querySelectorAll(".pot").forEach((el) => {
    el.addEventListener("click", () => openPot(el.getAttribute("data-pot")));
  });
}

async function openPot(potId) {
  openPotId = potId;
  openPotPhotos = await loadPhotos(potId);
  photoIndex = openPotPhotos.length ? openPotPhotos.length - 1 : 0;
  renderModal(getPot(potId));
  document.getElementById("overlay").classList.add("overlay--open");
  // Must happen AFTER the overlay is made visible above — setting scrollTop while an ancestor is
  // still display:none is a no-op (no layout box to scroll yet), which is why this silently
  // failed to reset the carried-over scroll position from whatever pot was open before.
  document.getElementById("modal").scrollTop = 0;
}

function renderModal(data) {
  const modal = document.getElementById("modal");
  const days = daysSince(data.plantedDate);
  const photos = openPotPhotos;
  const potLabel = `Seedling #${potNumber(openPotId)}`;

  modal.innerHTML = `
    <div class="modal-head">
      <h2>${potLabel}${days !== null ? ` &middot; ${formatAgeLong(days)} old` : ""}</h2>
      <button class="close-x" id="closeModal" aria-label="Close">&#10005;</button>
    </div>

    <div class="field">
      <label>Status</label>
      <div class="status-row">
        ${Object.keys(STATUS_COLORS)
          .map((s) => {
            const selected = data.status === s;
            const borderStyle = selected ? ` border-color:${STATUS_OUTLINE_COLORS[s]};` : "";
            return `
          <button type="button" class="status-chip ${selected ? "status-chip--selected" : ""}"
            data-status="${s}" style="background:${STATUS_COLORS[s]};color:${STATUS_OUTLINE_COLORS[s]};${borderStyle}"${isOwner ? "" : " disabled"}>${STATUS_LABELS[s]}</button>`;
          })
          .join("")}
      </div>
    </div>

    <div class="photo-box">
      <div class="photo-frame" id="photoFrame">
        ${photos.length ? `<img src="${photos[photoIndex].dataUrl}" alt="">` : `<span class="ph-empty">No photo yet</span>`}
        ${
          photos.length > 1
            ? `<button class="photo-nav photo-nav--prev" id="prevPhoto" aria-label="Previous photo">&#8249;</button>
               <button class="photo-nav photo-nav--next" id="nextPhoto" aria-label="Next photo">&#8250;</button>`
            : ""
        }
      </div>
      <div class="photo-meta">
        ${photos.length ? `Uploaded ${photos[photoIndex].date} &middot; ${photoIndex + 1} of ${photos.length}` : "No history yet"}
      </div>
      ${
        isOwner
          ? `<input type="file" accept="image/*" capture="environment" id="photoInput" style="display:none">
             <button class="upload-btn" id="uploadBtn" type="button">Upload New Photo</button>`
          : ""
      }
    </div>

    ${dateField("Date Planted", "f_planted", data.plantedDate)}
    ${selectField("Parent Pod (Suspected Cultivar)", "f_parent", data.parentPod, ["Criollo", "Forastero", "Trinitario"])}
    ${selectField("Potting soil", "f_soil", data.soilType, ["Vermiculite mix", "Black Gold® AP", "Niu Hawaiian Style"])}

    ${renderStatusChart(data.statusHistory)}

    ${
      isOwner
        ? `<div class="field"><label>Notes</label><textarea id="f_notes" placeholder="Anything worth remembering...">${escapeHtml(data.notes)}</textarea></div>`
        : data.notes
        ? `<div class="field"><label>Notes</label><div class="field-value">${escapeHtml(data.notes)}</div></div>`
        : ""
    }

    <div class="save-note" id="saveNote"></div>
  `;

  document.getElementById("closeModal").onclick = closeModal;

  if (isOwner) {
    wireDateParts(document.getElementById("f_planted"));
    document.getElementById("f_parent").onchange = (e) => updatePot({ parentPod: e.target.value });
    document.getElementById("f_soil").onchange = (e) => updatePot({ soilType: e.target.value });
    const notesEl = document.getElementById("f_notes");
    if (notesEl) {
      notesEl.onblur = (e) => updatePot({ notes: e.target.value });
      // Grows to fit whatever's typed instead of scrolling/cutting content off inside a fixed
      // box — resets to "auto" first so shrinking (e.g. after deleting text) is picked up too,
      // not just growth.
      const autoGrow = () => {
        notesEl.style.height = "auto";
        notesEl.style.height = notesEl.scrollHeight + "px";
      };
      notesEl.oninput = autoGrow;
      // Deferred to the next frame: this runs from openPot()'s initial renderModal() call, which
      // happens BEFORE the overlay gets its "open" (visible) class — measuring scrollHeight while
      // a display:none ancestor still applies returns 0/wrong, which is why existing long notes
      // opened cut off instead of already being sized correctly.
      requestAnimationFrame(autoGrow);
    }
    modal.querySelectorAll(".status-chip").forEach((chip) => {
      chip.onclick = () => updateStatus(chip.getAttribute("data-status"));
    });
    const uploadBtn = document.getElementById("uploadBtn");
    if (uploadBtn) uploadBtn.onclick = () => document.getElementById("photoInput").click();
    const photoInput = document.getElementById("photoInput");
    if (photoInput) photoInput.onchange = handlePhotoUpload;
  }

  const prevBtn = document.getElementById("prevPhoto");
  const nextBtn = document.getElementById("nextPhoto");
  if (prevBtn) prevBtn.onclick = () => { photoIndex = Math.max(0, photoIndex - 1); renderModal(getPot(openPotId)); };
  if (nextBtn) nextBtn.onclick = () => { photoIndex = Math.min(photos.length - 1, photoIndex + 1); renderModal(getPot(openPotId)); };
}

// Deliberately does NOT do a full renderModal() — that replaces the whole form's innerHTML,
// which would destroy and rebuild every field, including whatever the user has open next (e.g.
// this fires on the Date Planted field's blur, which happens the instant they click into the
// Parent Pod dropdown right after — a full rebuild would close that dropdown before they could
// pick anything). Only the header (day count, since plantedDate is the only field affecting it)
// is updated directly.
async function updatePot(changes) {
  const potId = openPotId;
  await savePotField(potId, changes);
  renderStage();
  if (potId === openPotId) {
    const headEl = document.querySelector(".modal-head h2");
    if (headEl) {
      const days = daysSince(getPot(potId).plantedDate);
      headEl.textContent = `Seedling #${potNumber(potId)}${days !== null ? ` · ${formatAgeLong(days)} old` : ""}`;
    }
  }
  const note = document.getElementById("saveNote");
  if (note) {
    note.textContent = "Saved";
    setTimeout(() => {
      if (document.getElementById("saveNote")) document.getElementById("saveNote").textContent = "";
    }, 1200);
  }
}

// Status changes append to statusHistory (never overwrite it) — that log is what the "Status
// Over Time" chart plots. A pot that's never had its status touched has an empty history (just
// one implicit point via the current `status` field), matching "to start, only one data point."
// Unlike updatePot() above, this DOES need a full renderModal() — the chip highlight and chart
// both have to update, and clicking a status chip (unlike blurring a text field) never happens
// while some other control is mid-interaction, so there's no dropdown to accidentally close.
async function updateStatus(newStatus) {
  const pot = getPot(openPotId);
  const today = new Date().toISOString().slice(0, 10);
  const history = pot.statusHistory.slice();
  const last = history[history.length - 1];
  if (!last || last.status !== newStatus || last.date !== today) {
    history.push({ date: today, status: newStatus });
  }
  await updatePot({ status: newStatus, statusHistory: history });
  renderModal(getPot(openPotId));
}

// Simple SVG line chart: x = each history entry in order (evenly spaced, not date-scaled — dates
// are usually sparse/manual here, so proportional spacing wouldn't add much), y = one of the 4
// tracked levels (CHART_LEVELS; "dead" isn't plotted). Single-letter labels down the left edge.
function renderStatusChart(history) {
  const points = (history || []).filter((h) => CHART_LEVELS.includes(h.status));
  if (!points.length) return "";

  const width = 260;
  const height = 70;
  const labelW = 16;
  const padY = 8;
  const plotW = width - labelW - 8;

  const yFor = (status) => {
    const t = CHART_LEVELS.indexOf(status) / (CHART_LEVELS.length - 1);
    return height - padY - t * (height - padY * 2);
  };
  const xFor = (i) => labelW + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2);

  const coords = points.map((p, i) => [xFor(i), yFor(p.status)]);
  const path = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const dots = coords
    .map(([x, y]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="var(--accent)"></circle>`)
    .join("");
  const labels = CHART_LEVELS.map(
    (s) => `<circle cx="4" cy="${yFor(s).toFixed(1)}" r="3.5" fill="${STATUS_COLORS[s]}" stroke="var(--fg-lighter)"></circle>`
  ).join("");

  return `
    <div class="field">
      <label>Status Over Time</label>
      <svg viewBox="0 0 ${width} ${height}" class="status-chart">
        ${labels}
        ${points.length > 1 ? `<path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"></path>` : ""}
        ${dots}
      </svg>
    </div>`;
}

function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const potId = openPotId;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = async () => {
      const maxDim = 900;
      let w = img.width;
      let h = img.height;
      if (w > h && w > maxDim) {
        h = h * (maxDim / w);
        w = maxDim;
      } else if (h > maxDim) {
        w = w * (maxDim / h);
        h = maxDim;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      await addPhoto(potId, dataUrl);
      openPotPhotos = await loadPhotos(potId);
      photoIndex = openPotPhotos.length - 1;
      renderModal(getPot(potId));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function closeModal() {
  document.getElementById("overlay").classList.remove("overlay--open");
  openPotId = null;
}

// ---- Auth (small, unobtrusive control — never a blocking gate; see CACAOFARM.md) ----
function renderAuthBox(user) {
  const box = document.getElementById("authBox");
  if (user) {
    box.innerHTML = `<button class="auth-box__link" id="signOutBtn" type="button">Sign out</button>`;
    document.getElementById("signOutBtn").onclick = () => signOut(auth);
  } else {
    box.innerHTML = `<button class="auth-box__link" id="signInToggle" type="button">Sign in</button>`;
    document.getElementById("signInToggle").onclick = showSignInForm;
  }
}

function showSignInForm() {
  const box = document.getElementById("authBox");
  box.innerHTML = `
    <form class="auth-box__form" id="signInForm">
      <input type="email" id="emailInput" placeholder="Email" autocomplete="username" required>
      <input type="password" id="passwordInput" placeholder="Password" autocomplete="current-password" required>
      <button class="auth-box__link" type="submit">✓</button>
    </form>
    <span class="auth-box__error" id="signInError"></span>
  `;
  document.getElementById("signInForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("emailInput").value;
    const password = document.getElementById("passwordInput").value;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      const errEl = document.getElementById("signInError");
      if (errEl) errEl.textContent = "Wrong email or password.";
    }
  });
}

onAuthStateChanged(auth, (user) => {
  isOwner = !!user;
  renderAuthBox(user);
  renderStage();
  if (openPotId) renderModal(getPot(openPotId));
});

document.getElementById("areaSelect").addEventListener("change", (e) => {
  currentAreaId = e.target.value;
  renderStage();
});
document.getElementById("overlay").addEventListener("click", (e) => {
  if (e.target.id === "overlay") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && openPotId) closeModal();
});

async function init() {
  renderAreaSelect();
  await loadPotData();
  renderStage();
}
init();
