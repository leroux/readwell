const { THEMES, PRESETS, EVIDENCE, presetValues, withDefaults } = LG_CONFIG;
const $ = (id) => document.getElementById(id);

(async () => {
  const st = await browser.storage.local.get({
    settings: null, activePreset: "classic", customPresets: [], autoEnable: false, siteRules: {},
  });
  let settings = withDefaults(st.settings);
  const save = (extra = {}) => browser.storage.local.set({ settings, ...extra });

  // Presets: built-in + custom, plus a "Custom" entry when settings were tweaked.
  const all = [
    ...PRESETS.map((p) => ({ id: p.id, name: `${p.name} (${EVIDENCE[p.evidence].label.toLowerCase()})`, values: presetValues(p) })),
    ...st.customPresets.map((p) => ({ id: p.id, name: "★ " + p.name, values: withDefaults(p.values) })),
  ];
  $("preset").add(new Option("Custom (modified)", ""));
  for (const p of all) $("preset").add(new Option(p.name, p.id));
  $("preset").value = st.activePreset || "";

  for (const [k, t] of Object.entries(THEMES)) $("theme").add(new Option(t.label, k));
  const syncQuick = () => { $("theme").value = settings.theme; $("intensity").value = settings.intensity; };
  syncQuick();
  $("autoEnable").checked = st.autoEnable;

  $("preset").onchange = (e) => {
    const p = all.find((x) => x.id === e.target.value);
    if (!p) return;
    settings = { ...p.values };
    syncQuick();
    save({ activePreset: p.id });
  };
  const tweak = (key, v) => {
    settings = { ...settings, [key]: v, gradOn: true };
    $("preset").value = "";
    save({ activePreset: "" });
  };
  $("theme").onchange = (e) => tweak("theme", e.target.value);
  $("intensity").oninput = (e) => tweak("intensity", +e.target.value);
  $("autoEnable").onchange = (e) => browser.storage.local.set({ autoEnable: e.target.checked });
  $("options").onclick = () => { browser.runtime.openOptionsPage(); window.close(); };

  // Per-tab status and site rule
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  // Ask the top frame only; iframes (e.g. an embedded reader) follow it.
  const status = () => browser.tabs.sendMessage(tab.id, { type: "status" }, { frameId: 0 });
  try {
    const res = await status();
    const host = new URL(tab.url).hostname;
    $("enabled").checked = res.enabled;
    $("site").value = st.siteRules[host] || "";
    $("enabled").onchange = (e) =>
      browser.runtime.sendMessage({ type: "setTab", tabId: tab.id, enabled: e.target.checked });
    $("site").onchange = async (e) => {
      const { siteRules } = await browser.storage.local.get({ siteRules: {} });
      if (e.target.value) siteRules[host] = e.target.value; else delete siteRules[host];
      await browser.storage.local.set({ siteRules });
      $("enabled").checked = (await status()).enabled;
    };
  } catch (_) {
    $("enabled").disabled = $("site").disabled = true;
    $("unavailable").style.display = "block";
  }
})();
