// Readwell engine: applies all reading aids to one root element.
// Used by content.js (root = document.body) and options.js (root = preview box).
globalThis.Readwell = (() => {
  const { THEMES, FONTS, withDefaults } = globalThis.LG_CONFIG;

  const EXCLUDE =
    "script,style,noscript,template,textarea,input,select,option,button," +
    "code,pre,kbd,samp,var,svg,math,canvas,iframe,[contenteditable]," +
    "[contenteditable] *,.lg-w,.lg-overlay";
  const HEADINGS = "h1,h2,h3,h4,h5,h6";
  // Typography overrides skip code and icon fonts.
  const TYPO_NOT =
    ':not(code,pre,kbd,samp,code *,pre *,svg,svg *,math,math *,[class*="icon"],' +
    '[class*="fa-"],.material-icons,.material-symbols-outlined,.lg-overlay)';

  // ---------- color helpers ----------
  const hex = (h) => {
    const n = parseInt(h.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const parseRGB = (str) => {
    const m = str.match(/[\d.]+/g);
    return m ? [+m[0], +m[1], +m[2]] : [0, 0, 0];
  };
  const lerp = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * t);
  const css = (c) => `rgb(${c.map(Math.round).join(",")})`;
  const lum = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const clamp = (v) => Math.min(1, Math.max(0, v));
  const smooth = (t) => t * t * (3 - 2 * t);

  // ---------- perceptual color (OKLab) + WCAG contrast ----------
  // Gradients are mixed in OKLab, where equal steps look equal to the eye,
  // instead of raw RGB numbers.
  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const toSrgb = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  function toLab(rgb) {
    const [r, g, b] = rgb.map(toLin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }
  function fromLab([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map((c) => Math.min(255, Math.max(0, toSrgb(Math.min(1, Math.max(0, c))))));
  }
  const labCss = (lab) => css(fromLab(lab));
  // WCAG 2 relative luminance and contrast ratio.
  const relLum = (rgb) => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (y1, y2) => (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);
  const MIN_CONTRAST = 4.5; // WCAG AA for body text

  // Darken (light background) or lighten (dark background) a color until it
  // reaches MIN_CONTRAST against the background. Hue and saturation are kept.
  function ensureContrast(lab, bgY) {
    const dir = bgY > 0.18 ? -1 : 1;
    let [L, a, b] = lab;
    for (let i = 0; i < 60 && contrast(relLum(fromLab([L, a, b])), bgY) < MIN_CONTRAST; i++) {
      L = clamp(L + dir * 0.015);
    }
    return [L, a, b];
  }

  // Dark Reader (dynamic mode) rewrites inline colors by adding a
  // [data-darkreader-inline-*] attribute and a stylesheet rule with
  // !important. An inline !important declaration still beats that rule, so
  // every color we set inline goes through these helpers.
  const paint = (el, prop, value) => el.style.setProperty(prop, value, "important");
  const unpaint = (el, ...props) => props.forEach((p) => el.style.removeProperty(p));

  // topFrame: false inside an iframe. Only the top frame draws the tint,
  // because its full-screen overlay already covers any iframes.
  function createEngine({ root, scope, fontUrl = (p) => p, topFrame = true }) {
    const doc = root.ownerDocument;
    const win = doc.defaultView;
    const isPage = root === doc.body;

    let s = null;          // current settings
    let on = false;
    let wordsOn = false;
    let structKey = "";    // settings that need a full re-wrap when changed
    let wrapOn = false;    // wrap words in spans (vs. only tagging blocks)

    const blockWords = new Map();
    const blockIndex = new Map();
    const pending = new Set();
    const wordText = new WeakMap();
    let blockCounter = 0;
    let io = null, ro = null, mo = null, scanTimer = 0;

    const styleEl = doc.createElement("style");
    styleEl.className = "lg-style";

    // ---------- styles ----------
    function buildCSS() {
      let out = `
        .lg-w.lg-c{-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
        .lg-w.lg-c::selection,.lg-w.lg-c *::selection{-webkit-text-fill-color:currentColor}
        .lg-b{font-weight:${s.bionicWeight}}
        .lg-overlay{position:fixed;pointer-events:none;z-index:2147483646;display:none}
      `;
      const font = FONTS[s.font];
      if (font && font.family) {
        font.files.forEach((f, i) => {
          out += `@font-face{font-family:"${font.family}";src:url("${fontUrl("fonts/" + f + ".woff2")}") format("woff2");font-weight:${i ? 700 : 400};font-display:swap}`;
        });
      }
      const family = font && (font.family ? `"${font.family}", sans-serif` : font.stack);
      // Only reading text (blocks tagged .lg-t by scan()), never the site's
      // menus, toolbars, or settings panels.
      const all = `${scope} .lg-t, ${scope} .lg-t *${TYPO_NOT}`;
      const rules = [];
      if (family) rules.push(`font-family:${family} !important`);
      if (s.letterSpacing) rules.push(`letter-spacing:${s.letterSpacing}em !important`);
      if (s.wordSpacing) rules.push(`word-spacing:${s.wordSpacing}em !important`);
      if (s.lineHeight) rules.push(`line-height:${s.lineHeight} !important`);
      if (rules.length) out += `${all}{${rules.join(";")}}`;
      // Dyslexia style guides: left-aligned text (justified text leaves
      // uneven gaps), and bold rather than italics for emphasis (italics read
      // worse in Rello & Baeza-Yates 2013).
      if (s.alignLeft) out += `${scope} .lg-t{text-align:start !important}`;
      if (s.noItalics) out += `${scope} .lg-t :is(em,i,cite,dfn)${TYPO_NOT}{font-style:normal !important;font-weight:bolder !important}`;
      if (s.maxWidth) out += `${scope} :is(p,li,blockquote,dd,dt,figcaption).lg-t{max-width:${s.maxWidth}ch !important}`;
      return out;
    }

    // ---------- block discovery ----------
    let displayCache = new WeakMap();
    function isInline(el) {
      let d = displayCache.get(el);
      if (d === undefined) {
        d = win.getComputedStyle(el).display;
        displayCache.set(el, d);
      }
      return d === "inline" || d === "contents";
    }
    function blockOf(node) {
      let el = node.parentElement;
      while (el && el !== root && isInline(el)) el = el.parentElement;
      return el;
    }
    function rejectText(n) {
      if (!n.nodeValue.trim()) return true;
      const p = n.parentElement;
      if (!p || p.closest(EXCLUDE)) return true;
      if (s.skipHeadings && p.closest(HEADINGS)) return true;
      return false;
    }

    function scan(start) {
      if (!start || !start.isConnected) return;
      const walker = doc.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (rejectText(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      const found = new Set();
      for (let n; (n = walker.nextNode()); ) {
        const b = blockOf(n);
        if (b) found.add(b);
      }
      for (const b of found) {
        if (pending.has(b)) continue;
        if (blockWords.has(b)) { wrapBlock(b); colorBlock(b); continue; }
        const isHeading = b.matches(HEADINGS);
        if ((b.textContent || "").trim().length < s.minChars && !isHeading) continue;
        b.classList.add("lg-t"); // reading text -> gets typography settings
        if (!wrapOn || (isHeading && (b.textContent || "").trim().length < s.minChars)) continue;
        blockIndex.set(b, blockCounter++);
        pending.add(b);
        io.observe(b);
      }
      if (pending.size) queueSweep(600);
    }

    // ---------- words ----------
    // Bionic-style bolding. Bionic Reading's default ("fixation") bolds the
    // first half of a word, plus one letter if its length is odd:
    // ceil(length / 2), i.e. bionicRatio 50. Each letter run is bolded on its
    // own, so "comparable-worth" -> compa|rable-wor|th. "Saccade"
    // (bionicEvery) bolds only every Nth word.
    function renderWord(span, index) {
      const text = wordText.get(span);
      if (!s.bionicOn || index % s.bionicEvery !== 0) { span.textContent = text; return; }
      span.textContent = "";
      let last = 0;
      for (const m of text.matchAll(/\p{L}[\p{L}\p{M}'’]*/gu)) {
        const run = m[0];
        const n = Math.max(1, Math.ceil(run.length * (s.bionicRatio / 100)));
        const b = doc.createElement("b");
        b.className = "lg-b";
        b.textContent = run.slice(0, n);
        span.append(text.slice(last, m.index), b, run.slice(n));
        last = m.index + run.length;
      }
      span.append(text.slice(last));
    }

    function wrapBlock(block) {
      const words = (blockWords.get(block) || []).filter((w) => w.isConnected);
      const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          !rejectText(n) && blockOf(n) === block ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
      });
      const nodes = [];
      for (let n; (n = walker.nextNode()); ) nodes.push(n);
      // In a flex/grid container every child element becomes its own item
      // and the whitespace between them is dropped, so loose text there
      // gets one inline wrapper to stay a single item.
      const flexy = /flex|grid/.test(win.getComputedStyle(block).display);
      for (const node of nodes) {
        const frag = doc.createDocumentFragment();
        for (const part of node.nodeValue.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(part)); continue; }
          const span = doc.createElement("span");
          span.className = "lg-w";
          wordText.set(span, part);
          renderWord(span, words.length);
          frag.appendChild(span);
          words.push(span);
        }
        if (flexy && node.parentElement === block) {
          const run = doc.createElement("span");
          run.className = "lg-run";
          run.appendChild(frag);
          node.replaceWith(run);
        } else {
          node.replaceWith(frag);
        }
      }
      words.sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
      blockWords.set(block, words);
      if (mo) mo.takeRecords(); // ignore our own DOM changes
    }

    // ---------- gradient ----------
    function themeColors(neutral) {
      let key = s.theme;
      if (key === "auto") key = lum(neutral) > 0.5 ? "nightWarm" : "bright";
      if (key === "custom") return [hex(s.colorA), hex(s.colorB)];
      const t = THEMES[key] || THEMES.bright;
      return [hex(t.a), hex(t.b)];
    }

    // Start/end colors for a line. Every line starts with the color the
    // previous line ended with, so the eye can follow it to the next line.
    function lineGradient(i, N, A, B) {
      switch (s.pattern) {
        case "single":     return i % 2 ? [A, N] : [N, A];
        case "continuous": return i % 2 ? [B, A] : [A, B];
        case "triad":      return [[N, A], [A, B], [B, N]][i % 3];
        default:           return [[N, A], [A, N], [N, B], [B, N]][i % 4];
      }
    }

    // "ends" shape: keep the neutral color in the middle and use the accent
    // only near the line edges.
    function shapeT(f, from, N) {
      if (s.shape !== "ends") return f;
      if (from === N) return smooth(clamp((f - 0.55) / 0.45));
      return smooth(clamp(f / 0.45));
    }

    // The color actually behind a block: the nearest ancestor with a
    // non-transparent background. With none, guess from the text color.
    function backgroundOf(el, textRgb) {
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const bg = win.getComputedStyle(e).backgroundColor;
        const m = bg.match(/[\d.]+/g);
        if (m && (m.length < 4 || +m[3] > 0.5)) return [+m[0], +m[1], +m[2]];
      }
      return lum(textRgb) > 0.5 ? [0, 0, 0] : [255, 255, 255];
    }

    function clearColor(w) {
      if (!w.classList.contains("lg-c")) return;
      w.classList.remove("lg-c");
      unpaint(w, "background-image", "color");
    }

    function colorBlock(block) {
      const words = (blockWords.get(block) || []).filter((w) => w.isConnected);
      if (!words.length) return;
      if (!s.gradOn) { words.forEach(clearColor); return; }

      const cs = win.getComputedStyle(block);
      const box = block.getBoundingClientRect();
      const left = box.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
      const right = box.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
      const width = Math.max(1, right - left);
      const rtl = cs.direction === "rtl";
      const textRgb = s.neutralMode === "custom" ? hex(s.neutralColor) : parseRGB(cs.color);
      const bgY = relLum(backgroundOf(block, textRgb));
      const N = toLab(textRgb);
      // Intensity lowers saturation but keeps the accent's brightness, so a
      // subtler gradient isn't a muddier one. Both accents are then held to
      // WCAG AA contrast. In-between colors sit between two readable colors
      // in lightness, so in practice they stay readable too.
      const k = s.intensity / 100;
      const accent = (rgb) => {
        const [L, a, b] = toLab(rgb);
        return ensureContrast([L, a * k, b * k], bgY);
      };
      const [rawA, rawB] = themeColors(textRgb);
      const A = accent(rawA), B = accent(rawB);
      const offset = s.paraStart === "alternate" ? (blockIndex.get(block) || 0) % 2 * 2 : 0;

      const rects = words.map((w) => w.getBoundingClientRect()); // read all first
      let line = -1, prevTop = -Infinity, prevH = 0;
      for (let i = 0; i < words.length; i++) {
        const r = rects[i], w = words[i];
        if (!r.width && !r.height) continue;
        if (r.top - prevTop > prevH / 2) { line++; prevTop = r.top; prevH = r.height; }
        if (s.skipLinks && w.parentElement.closest("a")) { clearColor(w); continue; }

        const [from, to] = lineGradient(line + offset, N, A, B);
        let f0 = clamp((r.left - left) / width), f1 = clamp((r.right - left) / width);
        if (rtl) [f0, f1] = [1 - f0, 1 - f1];
        const c0 = lerp(from, to, shapeT(f0, from, N));
        const c1 = lerp(from, to, shapeT(f1, from, N));
        paint(w, "background-image", `linear-gradient(to ${rtl ? "left" : "right"}, ${labCss(c0)}, ${labCss(c1)})`);
        paint(w, "color", labCss(lerp(c0, c1, 0.5)));
        w.classList.add("lg-c");
      }
    }

    const queued = new Set();
    let raf = 0;
    function queueColor(b) {
      queued.add(b);
      if (!raf) raf = win.requestAnimationFrame(() => {
        raf = 0;
        const list = [...queued];
        queued.clear();
        list.forEach(colorBlock);
      });
    }

    function activate(b) {
      if (!pending.delete(b)) return;
      io.unobserve(b);
      wrapBlock(b);
      ro.observe(b); // fires right away -> first paint
    }

    // Backup for the IntersectionObserver, which may not fire inside
    // cross-origin iframes (e.g. Pearson's Bronte reader): measure against
    // this frame's own viewport and activate whatever is on or near screen.
    let sweepTimer = 0;
    function sweep() {
      sweepTimer = 0;
      if (!wordsOn) return;
      const vh = win.innerHeight;
      for (const b of [...pending]) {
        if (!b.isConnected) { pending.delete(b); continue; }
        const r = b.getBoundingClientRect();
        if ((r.width || r.height) && r.bottom > -vh && r.top < vh * 2) activate(b);
      }
    }
    const queueSweep = (delay = 250) => { if (!sweepTimer) sweepTimer = setTimeout(sweep, delay); };
    win.addEventListener("scroll", () => wordsOn && queueSweep(), { passive: true, capture: true });

    function startWords() {
      wordsOn = true;
      io = new win.IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) activate(e.target);
      }, { rootMargin: "100% 0px" });
      ro = new win.ResizeObserver((entries) => entries.forEach((e) => queueColor(e.target)));
      const dirty = new Set();
      mo = new win.MutationObserver((records) => {
        for (const r of records)
          for (const n of r.addedNodes) dirty.add(n.nodeType === 3 ? n.parentElement : n);
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
          const list = [...dirty];
          dirty.clear();
          list.forEach((n) => n && n.nodeType === 1 && scan(n));
        }, 300);
      });
      mo.observe(root, { childList: true, subtree: true });
      scan(root);
    }

    function stopWords() {
      wordsOn = false;
      io && io.disconnect(); ro && ro.disconnect(); mo && mo.disconnect();
      io = ro = mo = null;
      clearTimeout(scanTimer);
      pending.clear();
      const parents = new Set();
      for (const w of root.querySelectorAll("span.lg-w")) {
        parents.add(w.parentNode);
        w.replaceWith(doc.createTextNode(wordText.get(w) ?? w.textContent));
      }
      for (const run of root.querySelectorAll("span.lg-run")) {
        parents.add(run.parentNode);
        run.replaceWith(...run.childNodes);
      }
      parents.forEach((p) => p && p.isConnected && p.normalize());
      root.querySelectorAll(".lg-t").forEach((b) => b.classList.remove("lg-t"));
      blockWords.clear();
      blockIndex.clear();
      blockCounter = 0;
    }

    // ---------- overlays: ruler + tint ----------
    let band = null, maskTop = null, maskBot = null, tint = null;
    let mouse = null, overlayRaf = 0;

    function overlay() {
      const d = doc.createElement("div");
      d.className = "lg-overlay";
      (isPage ? doc.documentElement : doc.body).appendChild(d);
      return d;
    }
    function area() {
      const vw = win.innerWidth, vh = win.innerHeight;
      if (isPage) return { left: 0, top: 0, right: vw, bottom: vh };
      const r = root.getBoundingClientRect();
      return { left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(vw, r.right), bottom: Math.min(vh, r.bottom) };
    }
    const place = (el, l, t, w, h) =>
      Object.assign(el.style, { display: h > 0 && w > 0 ? "block" : "none", left: l + "px", top: t + "px", width: w + "px", height: h + "px" });

    function drawOverlays() {
      overlayRaf = 0;
      const a = area();
      const dark = lum(parseRGB(win.getComputedStyle(root).color)) > 0.5; // light text = dark page
      if (tint) {
        place(tint, a.left, a.top, a.right - a.left, a.bottom - a.top);
        paint(tint, "background-color", s.tintColor);
        Object.assign(tint.style, { opacity: s.tintOpacity / 100, mixBlendMode: overlayBlend("tint", dark) });
      }
      if (!band) return;
      [band, maskTop, maskBot].forEach((e) => (e.style.display = "none"));
      if (!mouse || mouse.x < a.left || mouse.x > a.right || mouse.y < a.top || mouse.y > a.bottom) return;

      // Snap to the line under the cursor when we have word spans.
      const el = doc.elementFromPoint(mouse.x, mouse.y);
      // Over an iframe: that frame's own engine draws the ruler.
      if (el && (el.tagName === "IFRAME" || el.tagName === "FRAME")) return;
      const word = el && el.closest && el.closest(".lg-w");
      let top, h;
      if (word && root.contains(word)) {
        const r = word.getBoundingClientRect();
        const pad = r.height * 0.15;
        top = r.top - pad; h = r.height + pad * 2;
      } else {
        const cs = el ? win.getComputedStyle(el) : null;
        h = cs ? (parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3) : 24;
        top = mouse.y - h / 2;
      }
      const extra = (s.rulerLines - 1) * h;
      top -= extra / 2; h += extra;
      const w = a.right - a.left, op = s.rulerOpacity / 100;

      if (s.rulerMode === "highlight") {
        place(band, a.left, top, w, h);
        paint(band, "background-color", s.rulerColor);
        Object.assign(band.style, { opacity: op, mixBlendMode: overlayBlend("highlight", dark) });
      } else if (s.rulerMode === "underline") {
        place(band, a.left, top + h - 3, w, 3);
        paint(band, "background-color", s.rulerColor);
        Object.assign(band.style, { opacity: Math.max(op, 0.6), mixBlendMode: "normal" });
      } else if (s.rulerMode === "mask") {
        const dim = `rgba(0,0,0,${op})`;
        place(maskTop, a.left, a.top, w, top - a.top);
        place(maskBot, a.left, top + h, w, a.bottom - top - h);
        paint(maskTop, "background-color", dim);
        paint(maskBot, "background-color", dim);
      }
    }
    // How a color overlay mixes with the page underneath.
    //   kind: "tint" (full-screen color wash) | "highlight" (ruler band)
    //   dark: true when the page shows light text on a dark background
    //         (a dark site, or Dark Reader is on)
    // Returns a CSS mix-blend-mode value: "multiply", "screen", "overlay",
    // "soft-light", "color", "normal", ...
    function overlayBlend(kind, dark) {
      // TODO(you): pick blend modes for dark pages. "multiply" can only make
      // things darker, so on a near-black background the band and tint
      // nearly disappear.
      return "multiply";
    }

    const requestDraw = () => { if (!overlayRaf) overlayRaf = win.requestAnimationFrame(drawOverlays); };
    const onMove = (e) => { mouse = { x: e.clientX, y: e.clientY }; requestDraw(); };
    const onLeave = () => { mouse = null; requestDraw(); };
    // Moving into an iframe stops our mousemove events, so hide the ruler
    // instead of leaving it stuck at the frame's edge.
    const onOut = (e) => {
      const t = e.relatedTarget;
      if (!t || t.tagName === "IFRAME" || t.tagName === "FRAME") onLeave();
    };

    function setupOverlays() {
      const wantRuler = s.rulerMode !== "off";
      if (wantRuler && !band) {
        band = overlay(); maskTop = overlay(); maskBot = overlay();
        doc.addEventListener("mousemove", onMove, { passive: true });
        doc.addEventListener("mouseleave", onLeave);
        doc.addEventListener("mouseout", onOut);
      } else if (!wantRuler && band) {
        [band, maskTop, maskBot].forEach((e) => e.remove());
        band = maskTop = maskBot = null;
        doc.removeEventListener("mousemove", onMove);
        doc.removeEventListener("mouseleave", onLeave);
        doc.removeEventListener("mouseout", onOut);
      }
      const wantTint = s.tintOn && topFrame;
      if (wantTint && !tint) tint = overlay();
      else if (!wantTint && tint) { tint.remove(); tint = null; }
      requestDraw();
    }
    win.addEventListener("scroll", () => on && requestDraw(), { passive: true, capture: true });
    win.addEventListener("resize", () => on && requestDraw());

    // ---------- public API ----------
    function apply(next) {
      const prev = s;
      s = withDefaults(next);
      if (!on) return;
      styleEl.textContent = buildCSS();
      if (!styleEl.isConnected) (doc.head || doc.documentElement).appendChild(styleEl);

      // wrapOn: split text into word spans (gradient / bolding need them).
      // needScan: find reading-text blocks at all; typography needs that too.
      wrapOn = s.gradOn || s.bionicOn;
      const typoOn = s.font !== "page" ||
        !!(s.letterSpacing || s.wordSpacing || s.lineHeight || s.maxWidth || s.alignLeft || s.noItalics);
      const needScan = wrapOn || typoOn;
      const key = [needScan, wrapOn, s.skipHeadings, s.minChars].join("|");
      if (wordsOn && key !== structKey) stopWords();
      structKey = key;
      if (needScan && !wordsOn) startWords();
      else if (wordsOn) {
        if (prev && (prev.bionicOn !== s.bionicOn || prev.bionicRatio !== s.bionicRatio ||
                     prev.bionicEvery !== s.bionicEvery)) {
          blockWords.forEach((ws) => ws.forEach((w, i) => w.isConnected && renderWord(w, i)));
          if (mo) mo.takeRecords();
        }
        // Font/spacing changes resize blocks -> ResizeObserver recolors.
        // Color-only changes don't, so recolor directly.
        blockWords.forEach((_, b) => queueColor(b));
      }
      setupOverlays();
    }

    return {
      start(settings) { on = true; apply(settings); },
      update(settings) { apply(settings); },
      stop() {
        if (!on) return;
        on = false;
        if (wordsOn) stopWords();
        structKey = "";
        styleEl.remove();
        s = { ...s, rulerMode: "off", tintOn: false };
        setupOverlays();
      },
      // Recolor everything from the page's current colors (used when the
      // page's theme changes underneath us, e.g. Dark Reader toggled).
      refresh() {
        if (!on) return;
        displayCache = new WeakMap();
        blockWords.forEach((_, b) => queueColor(b));
        requestDraw();
      },
      isOn: () => on,
    };
  }

  return { createEngine };
})();
