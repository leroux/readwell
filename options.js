const { DEFAULTS, THEMES, FONTS, PRESETS, EVIDENCE, presetValues, withDefaults } = LG_CONFIG;
const $ = (id) => document.getElementById(id);
const opts = (obj) => Object.entries(obj).map(([v, o]) => [v, o.label]);

// Every control on the page comes from this list.
// show(s) hides a row when it doesn't apply to the current settings.
const SCHEMA = [
  { title: "Color gradient (BeeLine-style)", rows: [
    { key: "gradOn", type: "bool", label: "Color gradient",
      note: "Mixed evidence. The main independent study (Koornneef & Kraal 2022) found it helped only some beginning readers, and slowed others. Colors are kept at WCAG AA contrast (4.5:1) automatically." },
    { key: "theme", type: "select", label: "Color theme", options: opts(THEMES), show: (s) => s.gradOn },
    { key: "colorA", type: "color", label: "Custom color 1", show: (s) => s.gradOn && s.theme === "custom" },
    { key: "colorB", type: "color", label: "Custom color 2", show: (s) => s.gradOn && s.theme === "custom" },
    { key: "intensity", type: "range", label: "Intensity", min: 10, max: 100, step: 5, unit: "%", show: (s) => s.gradOn,
      note: "Lower means less saturated, not darker, so the colors stay clean." },
    { key: "pattern", type: "select", label: "Line pattern", show: (s) => s.gradOn, options: [
      ["alternate", "Alternating: text→1, 1→text, text→2, 2→text"],
      ["single", "One color: text→1, 1→text"],
      ["continuous", "No plain text: 1→2, 2→1"],
      ["triad", "Three-step: text→1, 1→2, 2→text"]] },
    { key: "shape", type: "select", label: "Gradient shape", show: (s) => s.gradOn, options: [
      ["full", "Full line (smooth fade)"], ["ends", "Ends only (color near line edges)"]] },
    { key: "paraStart", type: "select", label: "Paragraph start", show: (s) => s.gradOn, options: [
      ["same", "Every paragraph starts the same"], ["alternate", "Alternate between paragraphs"]] },
    { key: "neutralMode", type: "select", label: "Plain text color", show: (s) => s.gradOn, options: [
      ["page", "Use the page's text color"], ["custom", "Custom"]] },
    { key: "neutralColor", type: "color", label: "Custom text color", show: (s) => s.gradOn && s.neutralMode === "custom" },
    { key: "skipLinks", type: "bool", label: "Keep link colors", show: (s) => s.gradOn },
    { key: "skipHeadings", type: "bool", label: "Skip headings" },
    { key: "minChars", type: "range", label: "Ignore text shorter than", min: 0, max: 200, step: 10, unit: " chars",
      note: "Skips menus, buttons, and captions." },
  ]},
  { title: "Typography", rows: [
    { key: "font", type: "select", label: "Font", options: opts(FONTS),
      note: "OpenDyslexic was no faster or more accurate than Arial or Times (Wery & Diliberto 2017). Plain sans-serif fonts like Verdana and Arial read well (Rello & Baeza-Yates 2013)." },
    { key: "letterSpacing", type: "range", label: "Letter spacing", min: 0, max: 0.4, step: 0.01, unit: "em", zero: "Page",
      note: "Good evidence: extra letter spacing sped up reading for children with dyslexia (Zorzi et al. 2012; Masulli et al. 2018). WCAG uses 0.12em. Too much can make words fall apart." },
    { key: "wordSpacing", type: "range", label: "Word spacing", min: 0, max: 1, step: 0.02, unit: "em", zero: "Page",
      note: "Accessibility guidelines (WCAG) suggest 0.16em." },
    { key: "lineHeight", type: "range", label: "Line height", min: 0, max: 3, step: 0.05, zero: "Page",
      note: "1.5 is what WCAG and dyslexia style guides recommend." },
    { key: "maxWidth", type: "range", label: "Max line length", min: 0, max: 120, step: 5, unit: "ch", zero: "Page",
      note: "Dyslexia style guides suggest about 60–70 characters per line." },
    { key: "alignLeft", type: "bool", label: "Left-align text",
      note: "Turns off justified text, which leaves uneven gaps between words." },
    { key: "noItalics", type: "bool", label: "Bold instead of italics",
      note: "Italics read worse in Rello & Baeza-Yates (2013); style guides use bold for emphasis." },
  ]},
  { title: "Bionic-style bolding", rows: [
    { key: "bionicOn", type: "bool", label: "Bold word beginnings",
      note: "No benefit found. Controlled studies show no faster reading (Snell 2024), and a 90-reader eye-tracking study found no gain in speed, skipping or comprehension, with readers rating plain text more readable (Parker et al. 2026). Not yet tested with dyslexic readers." },
    { key: "bionicRatio", type: "range", label: "Bold portion (fixation)", min: 20, max: 70, step: 5, unit: "%", show: (s) => s.bionicOn,
      note: "50% matches Bionic Reading's default: half of each word, rounded up." },
    { key: "bionicEvery", type: "range", label: "Bold every Nth word (saccade)", min: 1, max: 4, step: 1, show: (s) => s.bionicOn },
    { key: "bionicWeight", type: "range", label: "Bold weight", min: 500, max: 900, step: 100, show: (s) => s.bionicOn },
  ]},
  { title: "Reading ruler", rows: [
    { key: "rulerMode", type: "select", label: "Ruler", options: [
      ["off", "Off"], ["highlight", "Highlight band"], ["underline", "Underline"], ["mask", "Dim everything else"]],
      note: "Little evidence: not well studied, but some people find it helps them keep their place." },
    { key: "rulerColor", type: "color", label: "Ruler color", show: (s) => s.rulerMode === "highlight" || s.rulerMode === "underline" },
    { key: "rulerOpacity", type: "range", label: "Strength", min: 5, max: 90, step: 5, unit: "%", show: (s) => s.rulerMode !== "off" },
    { key: "rulerLines", type: "range", label: "Lines tall", min: 1, max: 4, step: 1, show: (s) => s.rulerMode !== "off" },
  ]},
  { title: "Color tint overlay", rows: [
    { key: "tintOn", type: "bool", label: "Tint the page",
      note: "Style guides suggest cream backgrounds, but colored overlays made no difference to speed or errors in a 2021 study." },
    { key: "tintColor", type: "color", label: "Tint color", show: (s) => s.tintOn },
    { key: "tintOpacity", type: "range", label: "Tint strength", min: 5, max: 60, step: 1, unit: "%", show: (s) => s.tintOn },
  ]},
];

let settings = withDefaults();
let activePreset = "classic";
let customPresets = [];
const rows = []; // { def, row, input, val }

const preview = Readwell.createEngine({ root: $("preview"), scope: "#preview" });

// ---------- build controls ----------
function fmt(def, v) {
  if (def.zero && !v) return def.zero;
  return (def.unit === "em" ? (+v).toFixed(2) : v) + (def.unit || "");
}

function buildControls() {
  for (const sec of SCHEMA) {
    const card = document.createElement("section");
    card.className = "card";
    const h2 = document.createElement("h2");
    h2.textContent = sec.title;
    card.appendChild(h2);
    for (const def of sec.rows) {
      const row = document.createElement("div");
      row.className = "row";
      const id = "c-" + def.key;
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = def.label;
      row.appendChild(label);

      let input, val = null;
      if (def.type === "bool") {
        input = Object.assign(document.createElement("input"), { type: "checkbox" });
      } else if (def.type === "select") {
        input = document.createElement("select");
        for (const [v, text] of def.options) input.add(new Option(text, v));
      } else if (def.type === "color") {
        input = Object.assign(document.createElement("input"), { type: "color" });
      } else {
        val = document.createElement("span");
        val.className = "val";
        input = Object.assign(document.createElement("input"), { type: "range", min: def.min, max: def.max, step: def.step });
      }
      input.id = id;
      if (val) row.appendChild(val);
      row.appendChild(input);
      if (def.note) {
        const n = document.createElement("div");
        n.className = "note";
        n.textContent = def.note;
        row.appendChild(n);
      }
      input.addEventListener("input", () => {
        const v = def.type === "bool" ? input.checked : def.type === "range" ? +input.value : input.value;
        settings = { ...settings, [def.key]: v };
        activePreset = "";
        refresh();
        save();
      });
      card.appendChild(row);
      rows.push({ def, row, input, val });
    }
    $("controls").appendChild(card);
  }

  // Sites card
  const card = document.createElement("section");
  card.className = "card";
  card.innerHTML = `<h2>Where it runs</h2>
    <div class="row"><label for="autoEnable">Turn on for every page</label><input type="checkbox" id="autoEnable">
    <div class="note">Otherwise, turn it on per page from the toolbar button or Alt+Shift+B.</div></div>
    <div class="muted" style="margin-top:8px">Site rules (set from the toolbar popup):</div>
    <ul class="sites" id="sites"></ul>`;
  $("controls").appendChild(card);
  $("autoEnable").addEventListener("change", (e) => browser.storage.local.set({ autoEnable: e.target.checked }));
}

function refresh() {
  for (const { def, row, input, val } of rows) {
    const v = settings[def.key];
    if (def.type === "bool") input.checked = !!v; else input.value = v;
    if (val) val.textContent = fmt(def, v);
    row.classList.toggle("hidden", !!def.show && !def.show(settings));
  }
  renderPresets();
  preview.update(settings);
}

// ---------- presets ----------
function renderPresets() {
  const box = $("presets");
  box.textContent = "";
  const all = [
    ...PRESETS.map((p) => ({ ...p, values: presetValues(p), builtin: true })),
    ...customPresets.map((p) => ({ ...p, desc: "Your preset" })),
  ];
  for (const p of all) {
    const b = document.createElement("button");
    b.className = "preset" + (p.id === activePreset ? " active" : "");
    b.innerHTML = `<b></b><span></span>`;
    b.querySelector("b").textContent = p.name;
    b.querySelector("span").textContent = p.desc;
    if (p.evidence) {
      const ev = document.createElement("em");
      ev.className = "ev ev-" + p.evidence;
      ev.textContent = EVIDENCE[p.evidence].label;
      ev.title = EVIDENCE[p.evidence].note;
      b.appendChild(ev);
    }
    if (!p.builtin) {
      const del = document.createElement("span");
      del.className = "del";
      del.textContent = "×";
      del.title = "Delete preset";
      del.onclick = (e) => {
        e.stopPropagation();
        if (!confirm(`Delete preset "${p.name}"?`)) return;
        customPresets = customPresets.filter((c) => c.id !== p.id);
        if (activePreset === p.id) activePreset = "";
        browser.storage.local.set({ customPresets });
        save();
        refresh();
      };
      b.querySelector("b").appendChild(del);
    }
    b.onclick = () => {
      settings = withDefaults(p.values);
      activePreset = p.id;
      refresh();
      save();
    };
    box.appendChild(b);
  }
  const name = all.find((p) => p.id === activePreset)?.name;
  $("status").textContent = name ? `Using preset: ${name}` : "Custom settings (not saved as a preset yet)";
}

$("savePreset").onclick = () => {
  const name = prompt("Name for this preset:");
  if (!name) return;
  const id = "custom-" + Date.now();
  customPresets.push({ id, name, values: { ...settings } });
  activePreset = id;
  browser.storage.local.set({ customPresets });
  save();
  refresh();
};

$("reset").onclick = () => {
  settings = withDefaults();
  activePreset = "classic";
  refresh();
  save();
};

$("export").onclick = () => {
  const data = JSON.stringify({ settings, customPresets }, null, 2);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: "application/json" }));
  a.download = "readwell-settings.json";
  a.click();
  URL.revokeObjectURL(a.href);
};

$("import").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    settings = withDefaults(data.settings);
    if (Array.isArray(data.customPresets)) {
      customPresets = data.customPresets;
      browser.storage.local.set({ customPresets });
    }
    activePreset = "";
    refresh();
    save();
  } catch (err) {
    alert("That file isn't a Readwell settings export.");
  }
  e.target.value = "";
};

// ---------- storage ----------
let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => browser.storage.local.set({ settings, activePreset }), 150);
}

function renderSites(siteRules) {
  const ul = $("sites");
  ul.textContent = "";
  const hosts = Object.keys(siteRules || {});
  if (!hosts.length) { ul.innerHTML = `<li class="muted">No site rules yet.</li>`; return; }
  for (const h of hosts.sort()) {
    const li = document.createElement("li");
    li.textContent = `${h} — ${siteRules[h] === "always" ? "always on" : "never"}`;
    const rm = document.createElement("button");
    rm.textContent = "Remove";
    rm.onclick = async () => {
      const { siteRules: cur } = await browser.storage.local.get({ siteRules: {} });
      delete cur[h];
      browser.storage.local.set({ siteRules: cur });
    };
    li.appendChild(rm);
    ul.appendChild(li);
  }
}

browser.storage.onChanged.addListener((c, area) => {
  if (area !== "local") return;
  if (c.siteRules) renderSites(c.siteRules.newValue);
  if (c.autoEnable) $("autoEnable").checked = !!c.autoEnable.newValue;
  // Changes made from the popup while this page is open.
  if (c.settings && JSON.stringify(c.settings.newValue) !== JSON.stringify(settings)) {
    settings = withDefaults(c.settings.newValue);
    if (c.activePreset) activePreset = c.activePreset.newValue;
    refresh();
  }
});

$("pvWidth").addEventListener("input", (e) => ($("preview").style.maxWidth = e.target.value + "px"));
$("preview").style.maxWidth = "680px";

buildControls();
browser.storage.local
  .get({ settings: null, activePreset: "classic", customPresets: [], autoEnable: false, siteRules: {} })
  .then((st) => {
    settings = withDefaults(st.settings);
    activePreset = st.activePreset;
    customPresets = st.customPresets;
    $("autoEnable").checked = st.autoEnable;
    renderSites(st.siteRules);
    preview.start(settings);
    refresh();
  });
