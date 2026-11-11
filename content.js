(() => {
  if (window.__readwellLoaded || !document.body) return;
  window.__readwellLoaded = true;

  const { withDefaults } = globalThis.LG_CONFIG;
  // This script runs in every frame (manifest: all_frames). Readers like
  // Pearson's Bronte viewer put the book text in an iframe.
  const isTop = window === window.top;
  const engine = globalThis.Readwell.createEngine({
    root: document.body,
    scope: "body",
    fontUrl: (p) => browser.runtime.getURL(p),
    topFrame: isTop,
  });

  // Site rules use the top page's host; the background tells us what it is.
  let host = location.hostname;
  let settings = withDefaults();
  let autoEnable = false;
  let siteRules = {};
  let override = null; // per-tab choice from the popup or shortcut

  function shouldRun() {
    if (override !== null) return override;
    if (siteRules[host] === "always") return true;
    if (siteRules[host] === "never") return false;
    return autoEnable;
  }

  function sync() {
    if (shouldRun()) engine.isOn() ? engine.update(settings) : engine.start(settings);
    else engine.stop();
  }

  // Dark Reader can switch on, off, or change theme at any time, and it
  // loads its stylesheets asynchronously. When it does, the page's text
  // color changes, and the gradient was built from the old one, so we
  // recolor. It marks <html> with data-darkreader-mode/-scheme and inserts
  // <style class="darkreader"> elements.
  let themeTimer = 0;
  const onThemeChange = () => {
    clearTimeout(themeTimer);
    themeTimer = setTimeout(() => engine.refresh(), 150);
  };
  const isDarkReaderStyle = (n) => n.nodeType === 1 && n.classList.contains("darkreader");
  new MutationObserver(onThemeChange).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-darkreader-mode", "data-darkreader-scheme"],
  });
  if (document.head) {
    new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some(isDarkReaderStyle))) onThemeChange();
    }).observe(document.head, { childList: true });
  }
  // The OS / browser dark-mode switch can also flip a site's own theme.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onThemeChange);

  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "toggle") { override = !engine.isOn(); sync(); }
    else if (msg.type === "set") { override = !!msg.enabled; sync(); }
    return Promise.resolve({ enabled: engine.isOn(), host });
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.settings) settings = withDefaults(changes.settings.newValue);
    if (changes.autoEnable) autoEnable = !!changes.autoEnable.newValue;
    if (changes.siteRules) { siteRules = changes.siteRules.newValue || {}; override = null; }
    sync();
  });

  Promise.all([
    browser.storage.local.get({ settings: null, autoEnable: false, siteRules: {} }),
    browser.runtime.sendMessage({ type: "hello" }).catch(() => null),
  ]).then(([st, hello]) => {
    settings = withDefaults(st.settings);
    autoEnable = st.autoEnable;
    siteRules = st.siteRules;
    if (hello) {
      host = hello.host || host;
      override = hello.override; // the tab's on/off choice survives iframe reloads
    }
    sync();
  });
})();
