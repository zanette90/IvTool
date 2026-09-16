const TIMEOUT_MS = 120000;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === "heartbeat" && sender.tab) {
    chrome.storage.local.set({ ["beat_" + sender.tab.id]: Date.now() });
  }
});

chrome.alarms.create("watchdog", { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "watchdog") return;
  chrome.storage.local.get(null, (items) => {
    const agora = Date.now();
    for (const key in items) {
      if (!key.startsWith("beat_")) continue;
      const idade = agora - items[key];
      if (idade > TIMEOUT_MS) {
        const tabId = Number(key.slice(5));
        chrome.tabs.reload(tabId).catch((e) => console.log("erro reload:", e));
        chrome.storage.local.remove(key);
      }
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove("beat_" + tabId);
});
