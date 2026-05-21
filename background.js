"use strict";

const api = globalThis.browser || globalThis.chrome;
const badgeState = {
  activeIds: new Set(),
  clearTimer: null
};
const BADGE_CLEAR_DELAY_MS = 1600;
const BADGE_COLOR_ACTIVE = "#245bdb";
const BADGE_COLOR_DONE = "#117447";

function callApi(method, details) {
  return new Promise((resolve, reject) => {
    const result = method(details);
    if (result && typeof result.then === "function") {
      result.then(resolve, reject);
      return;
    }
    resolve(result);
  });
}

function clearPendingBadgeTimer() {
  if (badgeState.clearTimer) {
    clearTimeout(badgeState.clearTimer);
    badgeState.clearTimer = null;
  }
}

async function setBadge(text, color) {
  if (!api.action) {
    return;
  }

  try {
    await Promise.all([
      callApi(api.action.setBadgeText.bind(api.action), { text }),
      callApi(api.action.setBadgeBackgroundColor.bind(api.action), { color })
    ]);
  } catch (error) {
    console.error(error);
  }
}

async function clearBadge() {
  if (!api.action) {
    return;
  }

  try {
    await callApi(api.action.setBadgeText.bind(api.action), { text: "" });
  } catch (error) {
    console.error(error);
  }
}

function badgeTextForActiveCount(count) {
  if (count <= 0) {
    return "";
  }

  return count > 9 ? "9+" : String(count);
}

function refreshActiveBadge() {
  clearPendingBadgeTimer();
  const activeCount = badgeState.activeIds.size;

  if (activeCount > 0) {
    setBadge(badgeTextForActiveCount(activeCount), BADGE_COLOR_ACTIVE);
    return;
  }

  setBadge("✓", BADGE_COLOR_DONE);
  badgeState.clearTimer = setTimeout(clearBadge, BADGE_CLEAR_DELAY_MS);
}

api.downloads.onCreated.addListener((downloadItem) => {
  if (downloadItem && downloadItem.id !== undefined) {
    badgeState.activeIds.add(downloadItem.id);
  }

  refreshActiveBadge();
});

api.downloads.onChanged.addListener((downloadDelta) => {
  if (!downloadDelta || !downloadDelta.state || downloadDelta.id === undefined) {
    return;
  }

  const nextState = downloadDelta.state.current;
  if (nextState === "complete" || nextState === "interrupted") {
    badgeState.activeIds.delete(downloadDelta.id);
    refreshActiveBadge();
  }
});


