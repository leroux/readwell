// The per-tab on/off choice is shared by every frame in the tab: the page
// itself plus any iframes (e.g. Pearson's Bronte reader, which shows the book
// in an iframe and reloads it on every page turn). It lives in
// storage.session so it survives this background script being unloaded.
const KEY = (tabId) => "tab:" + tabId;
const hostOf = (url) => { try { return new URL(url).hostname; } catch (_) { return ""; } };

async function getOverride(tab) {
  const k = KEY(tab.id);
  const st = (await browser.storage.session.get(k))[k];
  // Forget the choice once the tab moves to a different site.
  return st && st.host === hostOf(tab.url) ? st.enabled : null;
}

async function setTab(tab, enabled) {
  await browser.storage.session.set({ [KEY(tab.id)]: { host: hostOf(tab.url), enabled } });
  // No frameId -> delivered to every frame in the tab.
  await browser.tabs.sendMessage(tab.id, { type: "set", enabled }).catch(() => {});
}

browser.runtime.onMessage.addListener((msg, sender) => {
  // A frame just loaded: tell it the tab's choice and the top page's host
  // (a frame's own location isn't the site the user is on).
  if (msg.type === "hello" && sender.tab) {
    return getOverride(sender.tab).then((override) => ({ override, host: hostOf(sender.tab.url) }));
  }
  if (msg.type === "setTab") {
    return browser.tabs.get(msg.tabId).then((tab) => setTab(tab, msg.enabled)).then(() => ({ ok: true }));
  }
});

// Keyboard shortcut: flip the state the top frame reports, in every frame.
browser.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-gradient") return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    const res = await browser.tabs.sendMessage(tab.id, { type: "status" }, { frameId: 0 });
    await setTab(tab, !res.enabled);
  } catch (_) {
    // Content scripts can't run on about:, addons.mozilla.org, etc.
  }
});

browser.tabs.onRemoved.addListener((tabId) => browser.storage.session.remove(KEY(tabId)));

// A new site rule takes over from any per-tab choice (content.js does the same).
browser.storage.onChanged.addListener(async (changes, area) => {
  if (area !== "local" || !changes.siteRules) return;
  const all = await browser.storage.session.get(null);
  await browser.storage.session.remove(Object.keys(all).filter((k) => k.startsWith("tab:")));
});
