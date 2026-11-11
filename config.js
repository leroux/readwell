// Shared by the content script, popup, and options page (loaded as a classic script).
globalThis.LG_CONFIG = (() => {
  const DEFAULTS = {
    // Gradient (BeeLine-style)
    gradOn: true,
    theme: "auto",
    colorA: "#1450e6",
    colorB: "#d72323",
    neutralMode: "page",     // "page" = use the site's own text color
    neutralColor: "#222222",
    intensity: 100,          // % of the way from neutral to the accent color
    pattern: "alternate",    // alternate | single | continuous | triad
    shape: "full",           // full | ends
    paraStart: "same",       // same | alternate
    skipLinks: false,
    skipHeadings: false,
    minChars: 30,

    // Bionic-style bolding
    bionicOn: false,
    bionicRatio: 50,         // Bionic Reading default: ceil(length / 2)
    bionicEvery: 1,          // "saccade": bold every Nth word
    bionicWeight: 700,

    // Typography
    font: "page",
    letterSpacing: 0,        // em
    wordSpacing: 0,          // em
    lineHeight: 0,           // 0 = page default
    maxWidth: 0,             // ch, 0 = page default
    alignLeft: false,        // undo justified text
    noItalics: false,        // italics -> bold

    // Reading ruler
    rulerMode: "off",        // off | highlight | underline | mask
    rulerColor: "#ffe066",
    rulerOpacity: 35,
    rulerLines: 1,

    // Color tint overlay
    tintOn: false,
    tintColor: "#fff1b8",
    tintOpacity: 20,
  };

  // a / b = accent colors. Neutral comes from the page unless overridden.
  const THEMES = {
    auto:       { label: "Auto (Bright, or Night Warm on dark sites)" },
    bright:     { label: "Bright (blue / red)",          a: "#1450e6", b: "#d72323" },
    blues:      { label: "Blues (blue / indigo)",        a: "#0060d6", b: "#5a3cbe" },
    gray:       { label: "Gray",                         a: "#8c8c8c", b: "#8c8c8c" },
    dark:       { label: "Dark (deep blue / deep red)",  a: "#0b2f8a", b: "#7a1010" },
    nightBlues: { label: "Night Blues (for dark sites)", a: "#6eafff", b: "#aa96ff" },
    nightWarm:  { label: "Night Warm (for dark sites)",  a: "#6eafff", b: "#ff7d7d" },
    pastel:     { label: "Pastel (teal / pink)",         a: "#3aa38c", b: "#c86ea8" },
    earth:      { label: "Earth (green / amber)",        a: "#2e7d32", b: "#b26a00" },
    custom:     { label: "Custom (pick below)" },
  };

  const FONTS = {
    page:         { label: "Page default" },
    atkinson:     { label: "Atkinson Hyperlegible (bundled)", family: "LG Atkinson", files: ["atkinson-hyperlegible-latin-400-normal", "atkinson-hyperlegible-latin-700-normal"] },
    lexend:       { label: "Lexend (bundled)",                family: "LG Lexend",   files: ["lexend-latin-400-normal", "lexend-latin-700-normal"] },
    opendyslexic: { label: "OpenDyslexic (bundled)",          family: "LG OpenDyslexic", files: ["opendyslexic-latin-400-normal", "opendyslexic-latin-700-normal"] },
    verdana:      { label: "Verdana",       stack: "Verdana, Geneva, sans-serif" },
    arial:        { label: "Arial",         stack: "Arial, Helvetica, sans-serif" },
    tahoma:       { label: "Tahoma",        stack: "Tahoma, Verdana, sans-serif" },
    comic:        { label: "Comic Sans",    stack: "'Comic Sans MS', 'Comic Neue', cursive" },
    georgia:      { label: "Georgia (serif)", stack: "Georgia, 'Times New Roman', serif" },
    system:       { label: "System UI",     stack: "system-ui, -apple-system, sans-serif" },
  };

  // How strong the reading research is for each preset's main idea.
  const EVIDENCE = {
    good:   { label: "Good evidence",   note: "Backed by controlled studies and dyslexia style guides." },
    mixed:  { label: "Mixed evidence",  note: "Some studies show a benefit, others don't." },
    little: { label: "Little evidence", note: "Not formally studied; some readers like it." },
    none:   { label: "No benefit found", note: "Studies tested it and found no improvement." },
  };

  // Presets only list the values they change; the rest come from DEFAULTS.
  // Typography values follow WCAG 1.4.12 text spacing (0.12em letters,
  // 0.16em words, 1.5 line height) and dyslexia style guides (sans-serif,
  // ~60-70 characters per line, left-aligned, bold instead of italics).
  const RESEARCH_TYPE = {
    font: "verdana", letterSpacing: 0.12, wordSpacing: 0.16, lineHeight: 1.5, maxWidth: 70,
    alignLeft: true, noItalics: true,
  };
  const PRESETS = [
    { id: "dyslexia", name: "Research-backed", evidence: "good",
      desc: "Only the aids with the best evidence: spacing, line length, Verdana, no gradient.",
      values: { ...RESEARCH_TYPE, gradOn: false } },
    { id: "research-grad", name: "Research + Gradient", evidence: "mixed",
      desc: "The research-backed text settings with the BeeLine gradient on top.",
      values: { ...RESEARCH_TYPE } },
    { id: "classic",  name: "BeeLine Classic", evidence: "mixed", desc: "Blue/red gradient, nothing else.", values: {} },
    { id: "blues",    name: "Calm Blues", evidence: "mixed", desc: "Softer two-blue gradient.", values: { theme: "blues", intensity: 80 } },
    { id: "gray",     name: "Subtle Gray", evidence: "mixed", desc: "Gray-only gradient, the quietest.", values: { theme: "gray" } },
    { id: "night",    name: "Night Blues", evidence: "mixed", desc: "Light accents for dark-mode sites.", values: { theme: "nightBlues" } },
    { id: "edges",    name: "Edge Cues", evidence: "little", desc: "Color only near line ends, where your eye jumps.", values: { shape: "ends" } },
    { id: "focus",    name: "Focus Ruler", evidence: "little", desc: "Gradient + dims everything except the line under your mouse.",
      values: { rulerMode: "mask", rulerOpacity: 45 } },
    { id: "warm",     name: "Cream Tint", evidence: "little", desc: "Gradient over a cream tint (style guides suggest cream; studies are mixed).",
      values: { tintOn: true } },
    { id: "opendys",  name: "OpenDyslexic", evidence: "none", desc: "No faster or more accurate than Arial in studies; try it if you like it.",
      values: { font: "opendyslexic", lineHeight: 1.5, maxWidth: 70, alignLeft: true } },
    { id: "bionic",   name: "Bionic-style", evidence: "none",
      desc: "Bionic Reading's default bolding, no gradient. No speed gain in controlled studies.",
      values: { gradOn: false, bionicOn: true } },
    { id: "all",      name: "Everything On", evidence: "little", desc: "Every aid at once, to compare. Hard to tell which one helps.",
      values: { ...RESEARCH_TYPE, font: "page", intensity: 80, bionicOn: true,
                rulerMode: "highlight", rulerOpacity: 25, tintOn: true, tintOpacity: 12 } },
  ];

  const presetValues = (preset) => ({ ...DEFAULTS, ...preset.values });
  const withDefaults = (s) => ({ ...DEFAULTS, ...(s || {}) });

  return { DEFAULTS, THEMES, FONTS, PRESETS, EVIDENCE, presetValues, withDefaults };
})();
