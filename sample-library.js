const DATA_URL = "data/samples.mock.json";

// Phase-1 Library → Editor wiring (UI + state only)
// Contract: no audio decoding, no WaveSurfer calls, no preview changes.
const LIBRARY_ADD_EVENT = "library:add-to-editor";
const EDITOR_BIN_CHANGED_EVENT = "editor:bin-changed";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDuration(durationSec) {
  const total = Math.max(0, Math.floor(Number(durationSec) || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function normalizeForSearch(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidSample(sample) {
  if (!sample || typeof sample !== "object") return false;

  const requiredStringFields = [
    "id",
    "name",
    "category",
    "license",
    "uploader",
    "createdAt",
    "previewUrl",
    "variantGroup"
  ];

  for (const field of requiredStringFields) {
    if (typeof sample[field] !== "string" || sample[field].trim() === "") return false;
  }

  if (!Array.isArray(sample.tags) || sample.tags.some(t => typeof t !== "string")) return false;

  const numericFields = ["durationSec", "sampleRate", "channels"];
  for (const field of numericFields) {
    if (!Number.isFinite(Number(sample[field]))) return false;
  }

  if (typeof sample.loudness !== "string") return false;

  return true;
}

function getDom() {
  const grid = document.querySelector(".sample-grid");
  const searchInput = document.querySelector('.sample-library__search input[type="search"]');
  const chipEls = Array.from(document.querySelectorAll(".sample-library__chips .chip"));

  return { grid, searchInput, chipEls };
}

function renderSamples(gridEl, samples) {
  if (!gridEl) return;

  gridEl.textContent = "";

  if (!samples.length) {
    const empty = document.createElement("div");
    empty.setAttribute("role", "status");
    empty.textContent = "No samples found.";
    gridEl.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  for (const sample of samples) {
    const card = document.createElement("article");
    card.className = "sample-card";
    card.setAttribute("role", "listitem");
    card.setAttribute("data-preview-src", sample.previewUrl);

    // Metadata-only identity for Phase-1 editor bin.
    card.setAttribute("data-sample-id", sample.id);

    const tagsHtml = sample.tags
      .map(t => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");

    const metaText = `Uploader: ${sample.uploader} • License: ${sample.license} • Duration: ${formatDuration(sample.durationSec)} • ${sample.sampleRate} Hz • ${sample.channels} ch`;

    const isAdded = addedSampleIds.has(sample.id);
    const addLabel = isAdded ? "Added" : "Add";
    const addDisabledAttr = isAdded ? "disabled aria-disabled=\"true\"" : "aria-disabled=\"false\"";

    card.innerHTML = `
      <div class="sample-card__top">
        <h3 class="sample-card__name">${escapeHtml(sample.name)}</h3>
      </div>

      <div class="sample-card__tags" aria-label="Tags">
        ${tagsHtml}
      </div>

      <div class="sample-card__meta">
        ${escapeHtml(metaText)}
        <label style="margin-left: 10px; display: inline-flex; gap: 6px; align-items: center;">
          <input type="checkbox" aria-label="Loop preview" data-preview-loop />
          Loop
        </label>
      </div>

      <div class="sample-card__actions">
        <button type="button" data-preview-play>Play</button>
        <button type="button" class="secondary" data-preview-stop>Stop</button>
        <button
          type="button"
          class="add-btn"
          data-editor-add
          data-sample-id="${escapeHtml(sample.id)}"
          ${addDisabledAttr}
        >${addLabel}</button>
      </div>
    `;

    frag.appendChild(card);
  }

  gridEl.appendChild(frag);
}

function filterSamplesInOrder(samples, searchText, selectedCategories) {
  const q = normalizeForSearch(searchText);

  const hasSearch = q.length > 0;
  const hasCategories = selectedCategories.size > 0;

  const out = [];

  for (const sample of samples) {
    if (hasSearch) {
      const hayName = normalizeForSearch(sample.name);
      const hayTags = sample.tags.map(normalizeForSearch).join(" ");
      const matchesSearch = hayName.includes(q) || hayTags.includes(q);
      if (!matchesSearch) continue;
    }

    if (hasCategories) {
      const cat = normalizeForSearch(sample.category);
      if (!selectedCategories.has(cat)) continue;
    }

    out.push(sample);
  }

  return out;
}

function wireFilters({ searchInput, chipEls }, onChange) {
  if (searchInput) {
    searchInput.addEventListener("input", () => onChange());
  }

  chipEls.forEach(chip => {
    chip.addEventListener("click", () => {
      const pressed = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", pressed ? "false" : "true");
      onChange();
    });
  });
}

function readSelectedCategories(chipEls) {
  const selected = new Set();
  for (const chip of chipEls) {
    const pressed = chip.getAttribute("aria-pressed") === "true";
    if (!pressed) continue;

    const cat = normalizeForSearch(chip.textContent);
    if (cat) selected.add(cat);
  }
  return selected;
}

async function loadSamples() {
  const resp = await fetch(DATA_URL);
  if (!resp.ok) {
    throw new Error(`Failed to load sample data: ${resp.status} ${resp.statusText}`);
  }

  const json = await resp.json();
  if (!Array.isArray(json)) {
    throw new Error("Sample data must be a JSON array.");
  }

  const invalid = json.find(s => !isValidSample(s));
  if (invalid) {
    throw new Error("Sample data contains an invalid sample entry.");
  }

  return json;
}

// Top-level await ensures the sample cards exist before `sample-preview.js` boots.
const samples = await loadSamples();

// Fast lookup for ADD wiring.
const sampleById = new Map(samples.map(s => [s.id, s]));

// Local UI state: which samples are already in the editor bin.
// (Editor is the source of truth; we also update this on click.)
const addedSampleIds = new Set();

const dom = getDom();

if (!dom.grid) {
  // Sample Library not present; nothing to do.
} else {
  function setAddButtonState(btn, isAdded) {
    if (!btn) return;
    btn.disabled = Boolean(isAdded);
    btn.setAttribute("aria-disabled", isAdded ? "true" : "false");
    btn.textContent = isAdded ? "Added" : "Add";
  }

  function applyAddedStateToGrid() {
    if (!dom.grid) return;
    const buttons = Array.from(dom.grid.querySelectorAll("button[data-editor-add][data-sample-id]"));
    for (const btn of buttons) {
      const id = btn.getAttribute("data-sample-id") || "";
      setAddButtonState(btn, addedSampleIds.has(id));
    }
  }

  function update() {
    const selectedCategories = readSelectedCategories(dom.chipEls);
    const searchText = dom.searchInput?.value ?? "";
    const filtered = filterSamplesInOrder(samples, searchText, selectedCategories);
    renderSamples(dom.grid, filtered);

    // Preserve "Added" indicator across filter re-renders.
    applyAddedStateToGrid();
  }

  // Editor → Library: keep ADD buttons in sync without re-rendering.
  window.addEventListener(EDITOR_BIN_CHANGED_EVENT, e => {
    const ids = e?.detail?.ids;
    if (!Array.isArray(ids)) return;

    addedSampleIds.clear();
    for (const id of ids) {
      if (typeof id === "string" && id) addedSampleIds.add(id);
    }

    applyAddedStateToGrid();
  });

  // Library: emit "add to editor" intent (metadata only).
  dom.grid.addEventListener("click", evt => {
    const target = evt.target;
    if (!(target instanceof Element)) return;

    const btn = target.closest("button[data-editor-add][data-sample-id]");
    if (!btn) return;

    const sampleId = btn.getAttribute("data-sample-id") || "";
    if (!sampleId) return;

    // Duplicate add guard (UI-only): ignore and show "Added".
    if (addedSampleIds.has(sampleId)) {
      setAddButtonState(btn, true);
      return;
    }

    const sample = sampleById.get(sampleId);
    if (!sample) return;

    addedSampleIds.add(sampleId);
    setAddButtonState(btn, true);

    // Emit metadata only (no decode, no load, no preview coupling).
    window.dispatchEvent(
      new CustomEvent(LIBRARY_ADD_EVENT, {
        detail: {
          id: sample.id,
          name: sample.name,
          url: sample.previewUrl,
          durationSec: Number(sample.durationSec),
          sampleRate: Number(sample.sampleRate),
          channels: Number(sample.channels),
          loudnessText: String(sample.loudness ?? "")
        }
      })
    );
  });

  wireFilters(dom, update);
  update();
}
