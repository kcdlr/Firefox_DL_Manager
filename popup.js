"use strict";

const api = globalThis.browser || globalThis.chrome;

const state = {
  downloads: [],
  visibleDownloads: [],
  progressTimer: null,
  isRefreshing: false
};

const PROGRESS_POLL_INTERVAL_MS = 1000;

const elements = {
  summary: document.getElementById("summary"),
  versionInfo: document.getElementById("versionInfo"),
  refreshButton: document.getElementById("refreshButton"),
  closeButton: document.getElementById("closeButton"),
  limitSelect: document.getElementById("limitSelect"),
  stateSelect: document.getElementById("stateSelect"),
  searchInput: document.getElementById("searchInput"),
  status: document.getElementById("status"),
  downloadList: document.getElementById("downloadList"),
  rowTemplate: document.getElementById("downloadRowTemplate")
};

function downloadsSearch(query) {
  return new Promise((resolve, reject) => {
    const result = api.downloads.search(query);
    if (result && typeof result.then === "function") {
      result.then(resolve, reject);
      return;
    }
    resolve(result);
  });
}

function downloadsShow(downloadId) {
  return new Promise((resolve, reject) => {
    const result = api.downloads.show(downloadId);
    if (result && typeof result.then === "function") {
      result.then(resolve, reject);
      return;
    }
    resolve(result);
  });
}

function downloadsOpen(downloadId) {
  return new Promise((resolve, reject) => {
    const result = api.downloads.open(downloadId);
    if (result && typeof result.then === "function") {
      result.then(resolve, reject);
      return;
    }
    resolve(result);
  });
}

function downloadsCancel(downloadId) {
  return new Promise((resolve, reject) => {
    const result = api.downloads.cancel(downloadId);
    if (result && typeof result.then === "function") {
      result.then(resolve, reject);
      return;
    }
    resolve(result);
  });
}

function downloadsRemoveFile(downloadId) {
  return new Promise((resolve, reject) => {
    const result = api.downloads.removeFile(downloadId);
    if (result && typeof result.then === "function") {
      result.then(resolve, reject);
      return;
    }
    resolve(result);
  });
}

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.className = `status ${kind}`.trim();
}

function renderVersionInfo() {
  if (!api.runtime || typeof api.runtime.getManifest !== "function") {
    elements.versionInfo.textContent = "";
    return;
  }

  const manifest = api.runtime.getManifest();
  elements.versionInfo.textContent = manifest.version ? `v${manifest.version}` : "";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function positiveBytes(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function totalBytesFor(item) {
  return positiveBytes(item.totalBytes) || positiveBytes(item.fileSize);
}

function progressFor(item) {
  const totalBytes = totalBytesFor(item);
  const receivedBytes = item.state === "complete"
    ? totalBytes
    : positiveBytes(item.bytesReceived);
  const hasTotal = totalBytes > 0;
  const percent = hasTotal
    ? Math.min(100, Math.max(0, Math.round((receivedBytes / totalBytes) * 100)))
    : null;

  return {
    hasTotal,
    percent,
    receivedText: formatBytes(receivedBytes),
    totalText: formatBytes(totalBytes)
  };
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

function baseName(path) {
  if (!path) {
    return "(パスなし)";
  }

  const normalized = path.replaceAll("\\", "/");
  const name = normalized.split("/").filter(Boolean).pop();
  return name || path;
}

function stateLabel(downloadState) {
  const labels = {
    complete: "完了",
    interrupted: "失敗",
    in_progress: "進行中"
  };

  return labels[downloadState] || downloadState || "不明";
}

function visibleQueryText() {
  return elements.searchInput.value.trim().toLowerCase();
}

function matchesSearch(item, queryText) {
  if (!queryText) {
    return true;
  }

  const fields = [
    item.filename,
    item.url,
    item.finalUrl,
    item.referrer
  ].filter(Boolean);

  return fields.some((field) => field.toLowerCase().includes(queryText));
}

function updateVisibleDownloads() {
  const desiredState = elements.stateSelect.value;
  const queryText = visibleQueryText();

  state.visibleDownloads = state.downloads.filter((item) => {
    const stateMatches = desiredState === "all" || item.state === desiredState;
    return stateMatches && matchesSearch(item, queryText);
  });
}

function updateSummary() {
  const visible = state.visibleDownloads.length;
  const total = state.downloads.length;
  elements.summary.textContent = `${visible} / ${total} 件を表示`;
}

function canUseCompletedFile(item) {
  return item.state === "complete" && Boolean(item.filename) && item.exists !== false;
}

function hasActiveDownloads() {
  return state.downloads.some((item) => item.state === "in_progress");
}

function updateProgressPolling() {
  if (hasActiveDownloads()) {
    if (!state.progressTimer) {
      state.progressTimer = window.setInterval(() => {
        loadDownloads({ silent: true });
      }, PROGRESS_POLL_INTERVAL_MS);
    }
    return;
  }

  if (state.progressTimer) {
    window.clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
}

function renderProgress(container, item) {
  const fill = container.querySelector(".progress-fill");
  const text = container.querySelector(".progress-text");
  const shouldShow = item.state === "in_progress" || item.state === "complete" || item.state === "interrupted";

  container.className = "download-progress";
  container.removeAttribute("aria-hidden");
  container.setAttribute("role", "progressbar");
  container.setAttribute("aria-label", `${baseName(item.filename)} のダウンロード進捗`);
  container.setAttribute("aria-valuemin", "0");
  container.setAttribute("aria-valuemax", "100");

  if (!shouldShow) {
    container.classList.add("hidden");
    container.setAttribute("aria-hidden", "true");
    container.removeAttribute("role");
    container.removeAttribute("aria-valuenow");
    container.removeAttribute("aria-valuemin");
    container.removeAttribute("aria-valuemax");
    fill.style.width = "0%";
    text.textContent = "";
    return;
  }

  const progress = progressFor(item);
  container.classList.add(item.state || "");

  if (progress.hasTotal) {
    fill.style.width = `${progress.percent}%`;
    container.setAttribute("aria-valuenow", String(progress.percent));
    text.textContent = progress.receivedText && progress.totalText
      ? `${progress.percent}% ・ ${progress.receivedText} / ${progress.totalText}`
      : `${progress.percent}%`;
    return;
  }

  container.removeAttribute("aria-valuenow");

  if (item.state === "in_progress") {
    fill.style.width = "";
    container.classList.add("indeterminate");
    text.textContent = progress.receivedText ? `${progress.receivedText} 受信済み` : "進行中";
    return;
  }

  fill.style.width = item.state === "complete" ? "100%" : "0%";
  if (item.state === "complete") {
    container.setAttribute("aria-valuenow", "100");
    text.textContent = progress.totalText ? `100% ・ ${progress.totalText}` : "100%";
    return;
  }

  text.textContent = stateLabel(item.state);
}

function itemForContextEvent(event) {
  const eventTarget = event.target;
  const targetElement = eventTarget.nodeType === Node.ELEMENT_NODE
    ? eventTarget
    : eventTarget.parentElement;
  const row = targetElement ? targetElement.closest(".download-row") : null;
  if (!row || !elements.downloadList.contains(row)) {
    return null;
  }

  const downloadId = Number.parseInt(row.dataset.downloadId, 10);
  if (!Number.isFinite(downloadId)) {
    return null;
  }

  return state.downloads.find((item) => item.id === downloadId) || null;
}

function removeCustomContextMenu() {
  document.getElementById("customContextMenu")?.remove();
}

function menuAction(label, options) {
  return {
    label,
    disabled: Boolean(options.disabled),
    danger: Boolean(options.danger),
    handler: options.handler
  };
}

function createCustomContextMenuButton(action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = action.label;
  button.disabled = action.disabled;
  button.setAttribute("role", "menuitem");

  if (action.danger) {
    button.classList.add("danger");
  }

  button.addEventListener("click", async () => {
    removeCustomContextMenu();

    try {
      await action.handler();
    } catch (error) {
      console.error(error);
      setStatus(`操作に失敗しました: ${error.message}`, "error");
    }
  });

  return button;
}

function positionCustomContextMenu(menu, event) {
  const viewportPadding = 8;
  const menuRect = menu.getBoundingClientRect();
  const maxLeft = window.innerWidth - menuRect.width - viewportPadding;
  const maxTop = window.innerHeight - menuRect.height - viewportPadding;
  const left = Math.min(event.clientX, maxLeft);
  const top = Math.min(event.clientY, maxTop);

  menu.style.left = `${Math.max(viewportPadding, left)}px`;
  menu.style.top = `${Math.max(viewportPadding, top)}px`;
}

function showCustomContextMenu(event, item) {
  removeCustomContextMenu();

  const fileAvailable = canUseCompletedFile(item);
  const menu = document.createElement("div");
  menu.id = "customContextMenu";
  menu.className = "custom-context-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", `${baseName(item.filename)} の操作`);

  const actions = [
    menuAction("パスをコピー", {
      disabled: !item.filename,
      handler: () => copyText(item.filename, "パスをコピーしました。")
    }),
    menuAction("実行", {
      disabled: !fileAvailable,
      handler: () => openDownloadedFile(item)
    }),
    menuAction("削除", {
      disabled: !fileAvailable,
      danger: true,
      handler: () => deleteDownloadedFile(item)
    })
  ];

  for (const action of actions) {
    menu.append(createCustomContextMenuButton(action));
  }

  document.body.append(menu);
  positionCustomContextMenu(menu, event);
}

function handleCustomContextMenu(event) {
  const item = itemForContextEvent(event);

  if (!item) {
    removeCustomContextMenu();
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  showCustomContextMenu(event, item);
}

function closeCustomContextMenuOnDocumentClick(event) {
  const menu = document.getElementById("customContextMenu");

  if (!menu || menu.contains(event.target)) {
    return;
  }

  removeCustomContextMenu();
}

function closeCustomContextMenuOnEscape(event) {
  if (event.key === "Escape") {
    removeCustomContextMenu();
  }
}

async function openDownloadedFile(item) {
  if (!canUseCompletedFile(item)) {
    setStatus("実行できるファイルがありません。", "error");
    return;
  }

  try {
    await downloadsOpen(item.id);
    setStatus("ファイルを実行しました。", "success");
  } catch (error) {
    console.error(error);
    setStatus(`実行できませんでした: ${error.message}`, "error");
  }
}

async function deleteDownloadedFile(item) {
  if (!canUseCompletedFile(item)) {
    setStatus("削除できるファイルがありません。", "error");
    await loadDownloads({ silent: true });
    return;
  }

  const fileName = baseName(item.filename);
  if (!window.confirm(`${fileName} を削除しますか？`)) {
    return;
  }

  try {
    await downloadsRemoveFile(item.id);
    setStatus("ファイルを削除しました。", "success");
    await loadDownloads({ silent: true });
  } catch (error) {
    console.error(error);
    setStatus(`削除できませんでした: ${error.message}`, "error");
    await loadDownloads({ silent: true });
  }
}

async function copyText(text, successMessage) {
  if (!text) {
    setStatus("コピーできる内容がありません。", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMessage, "success");
  } catch (error) {
    console.error(error);
    setStatus(`コピーに失敗しました: ${error.message}`, "error");
  }
}

function renderDownloads() {
  removeCustomContextMenu();
  updateVisibleDownloads();
  updateSummary();
  elements.downloadList.textContent = "";

  if (state.visibleDownloads.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = state.downloads.length === 0
      ? "ダウンロード履歴が見つかりません。"
      : "条件に一致するダウンロードがありません。";
    elements.downloadList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of state.visibleDownloads) {
    const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.downloadId = String(item.id);
    const title = row.querySelector(".download-title");
    const badge = row.querySelector(".download-state");
    const cancelDownload = row.querySelector(".cancel-download");
    const meta = row.querySelector(".download-meta");
    const progress = row.querySelector(".download-progress");
    const path = row.querySelector(".download-path");
    const url = row.querySelector(".download-url");
    const copyPath = row.querySelector(".copy-path");
    const copyUrl = row.querySelector(".copy-url");
    const showFolder = row.querySelector(".show-folder");
    const openFile = row.querySelector(".open-file");

    const sizeText = formatBytes(item.fileSize || item.totalBytes);
    const timeText = formatDate(item.startTime);
    const metaParts = [timeText, sizeText, item.mime].filter(Boolean);

    title.textContent = baseName(item.filename);
    title.title = baseName(item.filename);
    badge.textContent = stateLabel(item.state);
    badge.classList.add(item.state || "");
    meta.textContent = metaParts.join(" ・ ");
    renderProgress(progress, item);
    path.textContent = item.filename || "(保存先パスなし)";
    path.title = item.filename || "";
    url.textContent = item.finalUrl || item.url || "";
    url.title = item.finalUrl || item.url || "";

    copyPath.disabled = !item.filename;
    copyUrl.disabled = !(item.finalUrl || item.url);
    showFolder.disabled = !canUseCompletedFile(item);
    openFile.disabled = !canUseCompletedFile(item);
    cancelDownload.hidden = item.state !== "in_progress";
    cancelDownload.disabled = item.state !== "in_progress";

    copyPath.addEventListener("click", () => {
      copyText(item.filename, "パスをコピーしました。");
    });

    copyUrl.addEventListener("click", () => {
      copyText(item.finalUrl || item.url, "URLをコピーしました。");
    });

    cancelDownload.addEventListener("click", async () => {
      cancelDownload.disabled = true;
      cancelDownload.textContent = "取消中";

      try {
        await downloadsCancel(item.id);
        setStatus("ダウンロードをキャンセルしました。", "success");
        await loadDownloads({ silent: true });
      } catch (error) {
        console.error(error);
        setStatus(`キャンセルできませんでした: ${error.message}`, "error");
        cancelDownload.disabled = false;
        cancelDownload.textContent = "キャンセル";
        await loadDownloads({ silent: true });
      }
    });

    showFolder.addEventListener("click", async () => {
      try {
        await downloadsShow(item.id);
        setStatus("ファイルの階層を開きました。", "success");
      } catch (error) {
        console.error(error);
        setStatus(`開けませんでした: ${error.message}`, "error");
      }
    });

    openFile.addEventListener("click", async () => {
      await openDownloadedFile(item);
    });

    fragment.append(row);
  }

  elements.downloadList.append(fragment);
}

async function loadDownloads(options = {}) {
  const { silent = false } = options;

  if (state.isRefreshing) {
    return;
  }

  state.isRefreshing = true;

  if (!silent) {
    setStatus("読み込み中...");
  }

  const limit = Number.parseInt(elements.limitSelect.value, 10);
  const query = {
    limit,
    orderBy: ["-startTime"]
  };

  try {
    state.downloads = await downloadsSearch(query);
    renderDownloads();
    updateProgressPolling();
    if (!silent) {
      setStatus("読み込みました。", "success");
    }
  } catch (error) {
    console.error(error);
    if (!silent) {
      state.downloads = [];
      renderDownloads();
      setStatus(`読み込みに失敗しました: ${error.message}`, "error");
    }
  } finally {
    state.isRefreshing = false;
  }
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", loadDownloads);
  elements.closeButton.addEventListener("click", () => window.close());
  elements.limitSelect.addEventListener("change", loadDownloads);
  elements.stateSelect.addEventListener("change", renderDownloads);
  elements.searchInput.addEventListener("input", renderDownloads);
  elements.downloadList.addEventListener("contextmenu", handleCustomContextMenu);
  document.addEventListener("click", closeCustomContextMenuOnDocumentClick);
  document.addEventListener("keydown", closeCustomContextMenuOnEscape);
  window.addEventListener("blur", removeCustomContextMenu);
  elements.downloadList.addEventListener("scroll", removeCustomContextMenu);
}

bindEvents();
renderVersionInfo();
loadDownloads();

window.addEventListener("unload", () => {
  if (state.progressTimer) {
    window.clearInterval(state.progressTimer);
  }
});
