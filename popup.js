"use strict";

const api = globalThis.browser || globalThis.chrome;

const state = {
  downloads: [],
  visibleDownloads: []
};

const elements = {
  summary: document.getElementById("summary"),
  refreshButton: document.getElementById("refreshButton"),
  copyLatestPathButton: document.getElementById("copyLatestPathButton"),
  copyAllPathsButton: document.getElementById("copyAllPathsButton"),
  copyTsvButton: document.getElementById("copyTsvButton"),
  copyJsonButton: document.getElementById("copyJsonButton"),
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

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.className = `status ${kind}`.trim();
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

function setCopyButtonsEnabled(enabled) {
  elements.copyLatestPathButton.disabled = !enabled;
  elements.copyAllPathsButton.disabled = !enabled;
  elements.copyTsvButton.disabled = !enabled;
  elements.copyJsonButton.disabled = !enabled;
}

function rowToTsv(item) {
  return [
    item.id,
    item.state || "",
    item.startTime || "",
    item.filename || "",
    item.url || "",
    item.finalUrl || ""
  ].map((value) => String(value).replaceAll("\t", " ").replaceAll("\n", " ")).join("\t");
}

function rowToObject(item) {
  return {
    id: item.id,
    state: item.state,
    startTime: item.startTime,
    endTime: item.endTime,
    filename: item.filename,
    url: item.url,
    finalUrl: item.finalUrl,
    exists: item.exists,
    fileSize: item.fileSize,
    totalBytes: item.totalBytes,
    mime: item.mime
  };
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
  updateVisibleDownloads();
  updateSummary();
  setCopyButtonsEnabled(state.visibleDownloads.length > 0);
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
    const title = row.querySelector(".download-title");
    const badge = row.querySelector(".download-state");
    const meta = row.querySelector(".download-meta");
    const path = row.querySelector(".download-path");
    const url = row.querySelector(".download-url");
    const copyPath = row.querySelector(".copy-path");
    const copyUrl = row.querySelector(".copy-url");
    const copyRow = row.querySelector(".copy-row");
    const showFile = row.querySelector(".show-file");

    const sizeText = formatBytes(item.fileSize || item.totalBytes);
    const timeText = formatDate(item.startTime);
    const metaParts = [timeText, sizeText, item.mime].filter(Boolean);

    title.textContent = baseName(item.filename);
    title.title = baseName(item.filename);
    badge.textContent = stateLabel(item.state);
    badge.classList.add(item.state || "");
    meta.textContent = metaParts.join(" ・ ");
    path.textContent = item.filename || "(保存先パスなし)";
    path.title = item.filename || "";
    url.textContent = item.finalUrl || item.url || "";
    url.title = item.finalUrl || item.url || "";

    copyPath.disabled = !item.filename;
    copyUrl.disabled = !(item.finalUrl || item.url);
    showFile.disabled = item.state !== "complete" || !item.filename;

    copyPath.addEventListener("click", () => {
      copyText(item.filename, "パスをコピーしました。");
    });

    copyUrl.addEventListener("click", () => {
      copyText(item.finalUrl || item.url, "URLをコピーしました。");
    });

    copyRow.addEventListener("click", () => {
      copyText(rowToTsv(item), "行をTSVでコピーしました。");
    });

    showFile.addEventListener("click", async () => {
      try {
        await downloadsShow(item.id);
        setStatus("ファイルの場所を開きました。", "success");
      } catch (error) {
        console.error(error);
        setStatus(`開けませんでした: ${error.message}`, "error");
      }
    });

    fragment.append(row);
  }

  elements.downloadList.append(fragment);
}

async function loadDownloads() {
  setStatus("読み込み中...");
  setCopyButtonsEnabled(false);

  const limit = Number.parseInt(elements.limitSelect.value, 10);
  const query = {
    limit,
    orderBy: ["-startTime"]
  };

  try {
    state.downloads = await downloadsSearch(query);
    renderDownloads();
    setStatus("読み込みました。", "success");
  } catch (error) {
    console.error(error);
    state.downloads = [];
    renderDownloads();
    setStatus(`読み込みに失敗しました: ${error.message}`, "error");
  }
}

function bindEvents() {
  elements.refreshButton.addEventListener("click", loadDownloads);
  elements.limitSelect.addEventListener("change", loadDownloads);
  elements.stateSelect.addEventListener("change", renderDownloads);
  elements.searchInput.addEventListener("input", renderDownloads);

  elements.copyLatestPathButton.addEventListener("click", () => {
    const latest = state.visibleDownloads.find((item) => item.filename);
    copyText(latest && latest.filename, "最新のパスをコピーしました。");
  });

  elements.copyAllPathsButton.addEventListener("click", () => {
    const paths = state.visibleDownloads
      .map((item) => item.filename)
      .filter(Boolean)
      .join("\n");
    copyText(paths, "表示中のパスをコピーしました。");
  });

  elements.copyTsvButton.addEventListener("click", () => {
    const header = "id\tstate\tstartTime\tfilename\turl\tfinalUrl";
    const rows = state.visibleDownloads.map(rowToTsv);
    copyText([header, ...rows].join("\n"), "表示中の一覧をTSVでコピーしました。");
  });

  elements.copyJsonButton.addEventListener("click", () => {
    const json = JSON.stringify(state.visibleDownloads.map(rowToObject), null, 2);
    copyText(json, "表示中の一覧をJSONでコピーしました。");
  });
}

bindEvents();
loadDownloads();
