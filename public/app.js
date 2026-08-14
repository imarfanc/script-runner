const els = {
  title: document.querySelector("#app-title"),
  favicon: document.querySelector("#app-favicon"),
  group: document.querySelector("#group-select"),
  message: document.querySelector("#message"),
  fileList: document.querySelector("#file-list"),
  browseFile: document.querySelector("#browse-file"),
  fileBrowse: document.querySelector("#file-browse"),
  sendAt: document.querySelector("#send-at"),
  schedule: document.querySelector("#schedule"),
  error: document.querySelector("#composer-error"),
  jobList: document.querySelector("#job-list"),
  jobLog: document.querySelector("#job-log"),
  jobsHint: document.querySelector("#jobs-hint"),
};

/** @type {{ groups: Array<{name:string,label:string}>, files: Array<{path:string,name:string,folder:string}>, jobs: Array<any> }} */
let state = { groups: [], files: [], jobs: [] };
let selectedFile = "";
let selectedJobId = "";
const defaultJobsHint = els.jobsHint?.textContent ?? "server sends even if this tab is closed";

function showError(message) {
  els.error.hidden = !message;
  els.error.textContent = message || "";
}

function setServerOnline(online) {
  if (!els.jobsHint) return;
  els.jobsHint.textContent = online ? defaultJobsHint : "server offline — reconnecting…";
}

function toLocalInputValue(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${
    pad(date.getHours())
  }:${pad(date.getMinutes())}`;
}

function defaultSendAt() {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  date.setSeconds(0, 0);
  return toLocalInputValue(date);
}

function localInputToIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function formatCountdown(iso) {
  const ms = Date.parse(iso) - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "due";
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function isImage(path) {
  return /\.(jpe?g|png|gif|webp)$/i.test(path);
}

function renderGroups() {
  const current = els.group.value;
  els.group.replaceChildren();
  for (const group of state.groups) {
    const option = document.createElement("option");
    option.value = group.name;
    option.textContent = group.label || group.name;
    els.group.append(option);
  }
  if (state.groups.some((group) => group.name === current)) {
    els.group.value = current;
  }
}

function selectFile(path) {
  selectedFile = path;
  for (const row of els.fileList.querySelectorAll(".file-row")) {
    row.setAttribute("aria-selected", row.dataset.path === path ? "true" : "false");
  }
}

function renderFiles() {
  const scrollTop = els.fileList.scrollTop;
  els.fileList.replaceChildren();

  const none = document.createElement("button");
  none.type = "button";
  none.className = "file-row";
  none.dataset.path = "";
  none.setAttribute("role", "option");
  none.setAttribute("aria-selected", selectedFile === "" ? "true" : "false");
  none.innerHTML =
    `<div class="file-meta"><strong>No attachment</strong><span>message only</span></div>`;
  none.addEventListener("click", () => selectFile(""));
  els.fileList.append(none);

  if (!state.files.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No files yet — use Browse… or add files under data/output.";
    els.fileList.append(empty);
    els.fileList.scrollTop = scrollTop;
    return;
  }

  for (const file of state.files) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "file-row";
    row.dataset.path = file.path;
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", selectedFile === file.path ? "true" : "false");

    if (isImage(file.path)) {
      const img = document.createElement("img");
      img.src = `/api/files/${encodeURIComponent(file.path).replace(/%2F/g, "/")}`;
      img.alt = file.name;
      row.append(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "file-meta";
      placeholder.innerHTML = "<strong>file</strong>";
      row.append(placeholder);
    }

    const meta = document.createElement("div");
    meta.className = "file-meta";
    meta.innerHTML = `<strong>${file.name}</strong><span>${file.folder || "."}</span>`;
    row.append(meta);

    row.addEventListener("click", () => selectFile(file.path));
    els.fileList.append(row);
  }

  els.fileList.scrollTop = scrollTop;
}

function renderJobs() {
  els.jobList.replaceChildren();
  if (!state.jobs.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No jobs yet.";
    els.jobList.append(empty);
    els.jobLog.textContent = "";
    return;
  }

  if (!state.jobs.some((job) => job.id === selectedJobId)) {
    selectedJobId = state.jobs[0]?.id ?? "";
  }

  for (const job of state.jobs) {
    const row = document.createElement("div");
    row.className = "job-row";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", selectedJobId === job.id ? "true" : "false");
    row.dataset.jobId = job.id;

    const meta = document.createElement("div");
    meta.className = "file-meta";
    const status = document.createElement("span");
    status.className = `job-status ${job.status}`;
    status.textContent = job.status;
    meta.append(status);

    const title = document.createElement("strong");
    title.textContent = job.groupName;
    meta.append(title);

    const when = document.createElement("span");
    when.textContent = formatWhen(job.sendAt);
    meta.append(when);

    if (job.status === "pending") {
      const countdown = document.createElement("span");
      countdown.className = "job-countdown";
      countdown.dataset.countdownFor = job.id;
      countdown.dataset.sendAt = job.sendAt;
      countdown.textContent = formatCountdown(job.sendAt);
      meta.append(countdown);
    }

    const file = document.createElement("span");
    file.textContent = job.file || "(no file)";
    meta.append(file);

    const actions = document.createElement("div");
    if (job.status === "pending") {
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "job-cancel";
      cancel.textContent = "cancel";
      cancel.addEventListener("click", async (event) => {
        event.stopPropagation();
        try {
          await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
          await refreshJobs();
        } catch {
          setServerOnline(false);
        }
      });
      actions.append(cancel);
    }

    row.append(meta, actions);
    row.addEventListener("click", () => {
      selectedJobId = job.id;
      renderJobs();
    });
    els.jobList.append(row);
  }

  const selected = state.jobs.find((job) => job.id === selectedJobId);
  els.jobLog.textContent = selected?.log || selected?.error || "";
}

function updateCountdowns() {
  for (const el of document.querySelectorAll("[data-countdown-for]")) {
    const sendAt = el.dataset.sendAt;
    if (!sendAt) continue;
    el.textContent = formatCountdown(sendAt);
  }
}

async function loadApp() {
  const response = await fetch("/api/app");
  if (!response.ok) throw new Error("Failed to load app data");
  const body = await response.json();
  state = {
    groups: body.groups ?? [],
    files: body.files ?? [],
    jobs: body.jobs ?? [],
  };
  setServerOnline(true);
  if (body.config?.title) {
    els.title.textContent = body.config.title;
    document.title = body.config.title;
  }
  if (body.config?.favicon) els.favicon.href = body.config.favicon;
  renderGroups();
  renderFiles();
  renderJobs();
}

async function refreshJobs() {
  try {
    const response = await fetch("/api/jobs");
    if (!response.ok) return;
    state.jobs = await response.json();
    setServerOnline(true);
    renderJobs();
  } catch {
    setServerOnline(false);
    updateCountdowns();
  }
}

els.browseFile.addEventListener("click", () => {
  els.fileBrowse.click();
});

els.fileBrowse.addEventListener("change", async () => {
  const file = els.fileBrowse.files?.[0];
  els.fileBrowse.value = "";
  if (!file) return;

  showError("");
  els.browseFile.disabled = true;
  try {
    const body = new FormData();
    body.set("file", file, file.name);
    const response = await fetch("/api/uploads", { method: "POST", body });
    const uploaded = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(uploaded.error || "Could not upload file.");
      return;
    }
    setServerOnline(true);
    state.files = [uploaded, ...state.files.filter((item) => item.path !== uploaded.path)];
    selectedFile = uploaded.path;
    renderFiles();
  } catch {
    setServerOnline(false);
    showError("Server offline — start with deno task dev.");
  } finally {
    els.browseFile.disabled = false;
  }
});

els.schedule.addEventListener("click", async () => {
  showError("");
  const groupName = els.group.value;
  const message = els.message.value;
  const sendAt = localInputToIso(els.sendAt.value);
  if (!groupName) return showError("Pick a group.");
  if (!message.trim() && !selectedFile) return showError("Enter a message or pick a file.");
  if (!sendAt) return showError("Pick a send time.");

  try {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        groupName,
        message,
        file: selectedFile,
        sendAt,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      showError(body.error || "Could not schedule send.");
      return;
    }
    setServerOnline(true);
    selectedJobId = body.id;
    els.message.value = "";
    await refreshJobs();
  } catch {
    setServerOnline(false);
    showError("Server offline — start with deno task dev.");
  }
});

els.sendAt.value = defaultSendAt();
els.sendAt.min = toLocalInputValue(new Date());

loadApp().catch((error) => {
  setServerOnline(false);
  showError(error.message || "Server offline — start with deno task dev.");
});
setInterval(() => {
  void refreshJobs();
}, 1000);
setInterval(updateCountdowns, 1000);
