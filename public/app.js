import { renderOutput } from "/ansi.js";
import { highlight } from "/highlight.js";

const state = {
  scripts: [],
  diagnostics: [],
  selectedId: null,
  filters: blankFilters(),
  windows: [],
  z: 1,
  detail: "tags",
  groupBy: "group",
  minimizeSnapshot: null,
};
const facets = ["group", "space", "section", "tags"];
const details = ["title", "desc", "tags"];
const detailLabels = { title: "title", desc: "title + desc", tags: "title + tags" };
const $ = (id) => document.getElementById(id);
const layer = $("window-layer");

function blankFilters() {
  return { search: "", group: [], space: [], section: [], tags: [] };
}
function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function saveFilters() {
  localStorage.setItem("script-runner.filters.v2", JSON.stringify(state.filters));
}
function saveWindows() {
  localStorage.setItem(
    "script-runner.windows.v2",
    JSON.stringify(
      state.windows.map((
        { controller: _c, runId: _r, files: _f, loadingFiles: _l, notice: _n, ...win },
      ) => ({
        ...win,
        status: win.status === "running" ? "interrupted" : win.status,
      })),
    ),
  );
}

async function boot() {
  state.filters = { ...blankFilters(), ...load("script-runner.filters.v2", {}) };
  const savedDetail = load("script-runner.detail.v1", "tags");
  state.detail = details.includes(savedDetail) ? savedDetail : "tags";
  syncDetail();
  const response = await fetch("/api/catalog", { cache: "no-store" });
  const catalog = await response.json();
  state.scripts = catalog.scripts;
  state.diagnostics = catalog.diagnostics;
  document.title = catalog.config.title;
  $("app-title").textContent = catalog.config.title;
  $("app-favicon").href = catalog.config.favicon;
  applyTheme(catalog.config.theme ?? "system");
  state.groupBy = catalog.config.groupBy ?? "group";
  const widths = catalog.config.columnWidths;
  document.documentElement.style.setProperty("--facet-w", `${widths.facets}px`);
  document.documentElement.style.setProperty("--scripts-w", `${widths.scripts}px`);
  // The variable is the workspace's *minimum*: at 0 the column simply absorbs
  // the remaining space instead of forcing the whole page to scroll sideways.
  document.documentElement.style.setProperty(
    "--workspace-w",
    widths.workspace === "auto" ? "0px" : `${widths.workspace}px`,
  );
  $("script-search").value = state.filters.search;
  restoreWindows();
  renderFacets();
  renderScripts();
  renderWindows();
  if (state.diagnostics.length) {
    $("diagnostics").hidden = false;
    $("diagnostics").textContent = state.diagnostics.map((d) => `${d.file}: ${d.message}`).join(
      "\n",
    );
  }
}

function valuesFor(facet) {
  const counts = new Map();
  for (const script of state.scripts) {
    const items = facet === "tags" ? script.tags : [script[facet]];
    for (const item of items) {
      if (item) counts.set(item, (counts.get(item) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderFacets() {
  const root = $("facet-controls");
  root.replaceChildren();
  for (const facet of facets) {
    const section = document.createElement("section");
    section.className = "facet";
    section.dataset.facet = facet;
    const heading = document.createElement("h2");
    heading.textContent = facet;
    section.append(heading);
    for (const [value, count] of valuesFor(facet)) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = value;
      input.checked = state.filters[facet].includes(value);
      input.addEventListener("change", () => {
        state.filters[facet] = input.checked
          ? [...state.filters[facet], value]
          : state.filters[facet].filter((v) => v !== value);
        saveFilters();
        renderScripts();
      });
      const n = document.createElement("span");
      n.className = "facet-count";
      n.textContent = String(count);
      label.append(input, document.createTextNode(value), n);
      section.append(label);
    }
    root.append(section);
  }
}

function visibleScripts() {
  const search = state.filters.search.toLowerCase();
  return groupScripts(state.scripts.filter((script) => {
    const text = [
      script.name,
      script.description,
      script.language,
      script.group,
      script.space,
      script.section,
      ...script.tags,
    ].join(" ").toLowerCase();
    if (search && !text.includes(search)) return false;
    return facets.every((facet) => {
      const chosen = state.filters[facet];
      if (!chosen.length) return true;
      const values = facet === "tags" ? script.tags : [script[facet]];
      return chosen.some((value) => values.includes(value));
    });
  }));
}

/**
 * Resolves the configured theme against the OS once, then keeps listening when
 * it is "system" — macOS switches appearance at sunset and mid-session, and a
 * window that only checked at load would sit in the wrong palette until reload.
 */
function applyTheme(theme) {
  const light = globalThis.matchMedia?.("(prefers-color-scheme: light)");
  const paint = () => {
    document.documentElement.dataset.theme = theme === "system"
      ? (light?.matches ? "light" : "dark")
      : theme;
  };
  paint();
  if (theme === "system") light?.addEventListener("change", paint);
}

function icon(name, label = "") {
  const span = document.createElement("span");
  span.className = "iconify";
  span.dataset.icon = name || "mdi:console";
  span.setAttribute("aria-label", label);
  span.textContent = "›";
  return span;
}
function renderScripts() {
  const scripts = visibleScripts();
  const root = $("script-list");
  root.replaceChildren();
  $("script-count").textContent = `${scripts.length}/${state.scripts.length}`;
  let heading = null;
  for (const script of scripts) {
    // The catalog arrives sorted by name; groupScripts only re-cuts it, so the
    // order inside each heading is still the order the list would have had.
    const label = groupLabel(script);
    if (label !== heading) {
      heading = label;
      root.append(groupHeading(label, scripts.filter((item) => groupLabel(item) === label).length));
    }
    const row = document.createElement("div");
    row.className = "script-row";
    row.role = "option";
    row.tabIndex = 0;
    row.dataset.scriptId = script.id;
    row.setAttribute("aria-selected", String(script.id === state.selectedId));
    row.style.setProperty("--script-color", script.color);
    const image = icon(script.icon, "");
    image.classList.add("script-icon");
    const name = document.createElement("span");
    name.className = "script-name";
    name.textContent = script.name;
    const play = document.createElement("button");
    play.type = "button";
    play.className = "script-run";
    play.title = `Run ${script.name}`;
    play.setAttribute("aria-label", `Run ${script.name}`);
    play.append(icon("mdi:play"));
    play.addEventListener("click", (event) => {
      event.stopPropagation();
      selectScript(script.id);
      launch(script);
    });
    row.append(image, name, play);
    if (state.detail !== "title") {
      const description = document.createElement("span");
      description.className = "script-description";
      description.textContent = script.description;
      row.append(description);
    }
    if (state.detail === "tags") {
      const meta = document.createElement("span");
      meta.className = "script-meta";
      for (
        const value of [script.language, script.group, script.space, script.section, ...script.tags]
          .filter(Boolean)
      ) {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = value;
        meta.append(pill);
      }
      row.append(meta);
    }
    row.addEventListener("click", () => openScript(script));
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      // Enter opens the window; the modifier runs it, matching the play button.
      if (event.metaKey || event.ctrlKey) launch(script);
      else openScript(script);
    });
    root.append(row);
  }
}

/** The value of whichever marker field the config groups by, or null when flat. */
function groupLabel(script) {
  if (state.groupBy === "none") return null;
  return script[state.groupBy]?.trim() || "ungrouped";
}

function groupScripts(scripts) {
  if (state.groupBy === "none") return scripts;
  const labels = [...new Set(scripts.map(groupLabel))];
  // "ungrouped" is a fallback, not a name, so it sorts last however it reads.
  labels.sort((left, right) =>
    Number(left === "ungrouped") - Number(right === "ungrouped") || left.localeCompare(right)
  );
  return labels.flatMap((label) => scripts.filter((script) => groupLabel(script) === label));
}

function groupHeading(label, count) {
  const node = document.createElement("h2");
  node.className = "script-group";
  const text = document.createElement("span");
  text.textContent = label;
  const total = document.createElement("span");
  total.className = "script-group-count";
  total.textContent = String(count);
  node.append(text, total);
  return node;
}

function selectScript(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  for (const node of $("script-list").querySelectorAll(".script-row")) {
    node.setAttribute("aria-selected", String(node.dataset.scriptId === id));
  }
}

function restoreWindows() {
  const saved = load("script-runner.windows.v2", []);
  state.windows = saved.filter((win) => state.scripts.some((s) => s.id === win.scriptId)).map((
    win,
  ) => ({
    ...win,
    status: win.status === "running" ? "interrupted" : win.status,
    output: win.output ?? "",
  }));
  state.z = Math.max(1, ...state.windows.map((win) => win.z || 1));
}
function newest(scriptId) {
  return [...state.windows].filter((win) => win.scriptId === scriptId).sort((a, b) =>
    b.createdAt - a.createdAt
  )[0];
}
/** One click opens the script's window. Running it is the play button's job. */
function openScript(script) {
  selectScript(script.id);
  const existing = newest(script.id);
  if (existing) return focus(existing.id);
  openWindow(script);
}

function launch(script) {
  const win = newest(script.id);
  if (script.instances === "focus" && win) return focus(win.id);
  if (script.instances === "rerun" && win) {
    focus(win.id);
    return run(win);
  }
  if (win?.status === "idle") {
    focus(win.id);
    return run(win);
  }
  run(openWindow(script));
}

function openWindow(script) {
  const count = state.windows.length;
  const win = {
    id: crypto.randomUUID(),
    scriptId: script.id,
    x: 24 + (count % 8) * 28,
    y: 24 + (count % 6) * 28,
    width: script.terminal.width,
    height: script.terminal.height,
    z: ++state.z,
    minimized: false,
    maximized: false,
    status: "idle",
    output: "",
    createdAt: Date.now(),
  };
  state.windows.push(win);
  renderWindows();
  saveWindows();
  return win;
}
function focus(id) {
  const win = state.windows.find((item) => item.id === id);
  if (!win) return;
  win.z = ++state.z;
  renderWindows();
  saveWindows();
}

function renderWindows() {
  layer.querySelectorAll(".run-window").forEach((node) => node.remove());
  $("workspace-empty").hidden = state.windows.length > 0;
  const allMinimized = state.windows.length > 0 && state.windows.every((win) => win.minimized);
  $("minimize-all").disabled = state.windows.length === 0;
  $("minimize-all").textContent = allMinimized ? "restore all" : "minimize all";
  $("close-all").disabled = state.windows.length === 0;
  for (const win of state.windows) {
    const script = state.scripts.find((item) => item.id === win.scriptId);
    if (!script) continue;
    const root = document.createElement("article");
    root.className = "run-window";
    root.dataset.windowId = win.id;
    root.style.cssText =
      `left:${win.x}px;top:${win.y}px;width:${win.width}px;height:${win.height}px;z-index:${win.z}`;
    root.classList.toggle("is-minimized", win.minimized);
    root.classList.toggle("is-maximized", win.maximized);
    const bar = document.createElement("header");
    bar.className = "window-titlebar";
    const image = icon(script.icon);
    image.style.color = script.color;
    const name = document.createElement("span");
    name.className = "window-name";
    name.textContent = script.name;
    const status = document.createElement("span");
    status.className = "window-status";
    status.textContent = win.status;
    bar.append(
      image,
      name,
      status,
      action(
        "mdi:open-in-new",
        `Open ${activeFile(win, script)} in the editor`,
        () => openInEditor(win, activeFile(win, script)),
      ),
      action("mdi:play", "Rerun", () => run(win)),
      action("mdi:stop", "Stop", () => stop(win)),
      action("mdi:eraser", "Clear", () => {
        win.output = "";
        updateOutput(win);
        saveWindows();
      }),
      action("mdi:minus", "Minimize", () => {
        win.minimized = !win.minimized;
        renderWindows();
        saveWindows();
      }),
      action("mdi:arrow-expand", "Maximize", () => {
        win.maximized = !win.maximized;
        win.minimized = false;
        renderWindows();
        saveWindows();
      }),
      action("mdi:close", "Close", () => closeWindow(win)),
    );
    const tabs = document.createElement("nav");
    tabs.className = "file-tabs";
    tabs.role = "tablist";
    tabs.setAttribute("aria-label", "Output and script files");
    renderTabs(win, tabs, script);
    const output = document.createElement("pre");
    output.className = "window-output";
    output.dataset.outputFor = win.id;
    paint(win, output);
    root.append(bar, tabs, output);
    if (!win.files) void loadFiles(win);
    root.addEventListener("pointerdown", () => raiseWindow(win, root));
    drag(bar, root, win);
    observeSize(root, win);
    layer.append(root);
  }
}
function raiseWindow(win, root) {
  if (win.z === state.z) return;
  win.z = ++state.z;
  root.style.zIndex = String(win.z);
  saveWindows();
}
function action(iconName, label, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "window-action";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.append(icon(iconName));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    handler();
  });
  return button;
}
function drag(handle, root, win) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button") || win.maximized) return;
    event.preventDefault();
    raiseWindow(win, root);
    const sx = event.clientX, sy = event.clientY, ox = win.x, oy = win.y;
    const move = (e) => {
      win.x = Math.max(0, Math.min(layer.clientWidth - 80, ox + e.clientX - sx));
      win.y = Math.max(0, Math.min(layer.clientHeight - 38, oy + e.clientY - sy));
      root.style.left = `${win.x}px`;
      root.style.top = `${win.y}px`;
    };
    const up = () => {
      globalThis.removeEventListener("pointermove", move);
      globalThis.removeEventListener("pointerup", up);
      globalThis.removeEventListener("pointercancel", up);
      saveWindows();
    };
    globalThis.addEventListener("pointermove", move);
    globalThis.addEventListener("pointerup", up, { once: true });
    globalThis.addEventListener("pointercancel", up, { once: true });
  });
}
function observeSize(root, win) {
  new ResizeObserver(() => {
    if (!win.minimized && !win.maximized) {
      win.width = root.offsetWidth;
      win.height = root.offsetHeight;
    }
  }).observe(root);
}

async function run(win) {
  await stop(win);
  win.output = "";
  win.status = "running";
  win.startedAt = Date.now();
  updateWindow(win);
  saveWindows();
  const controller = new AbortController();
  win.controller = controller;
  try {
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scriptId: win.scriptId }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error((await response.json()).error || `Run failed (${response.status})`);
    }
    win.runId = response.headers.get("x-run-id");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      win.output += decoder.decode(value, { stream: true });
      updateOutput(win);
    }
    const match = win.output.match(/── exit (\d+) ──/);
    win.status = match?.[1] === "0" ? "done" : "error";
  } catch (error) {
    if (win.status !== "stopped") {
      win.status = "error";
      win.output += `\n${error.message || error}\n`;
    }
  } finally {
    delete win.controller;
    delete win.runId;
    updateWindow(win);
    saveWindows();
  }
}
async function stop(win) {
  if (win.status !== "running") return;
  win.status = "stopped";
  win.controller?.abort();
  if (win.runId) await fetch(`/api/runs/${win.runId}`, { method: "DELETE" }).catch(() => {});
  updateWindow(win);
}
async function closeWindow(win) {
  await stop(win);
  state.windows = state.windows.filter((item) => item.id !== win.id);
  renderWindows();
  saveWindows();
}
function minimizeAllWindows() {
  const snapshot = state.minimizeSnapshot;
  const restore = state.windows.length > 0 && state.windows.every((win) => win.minimized);
  if (restore) {
    for (const win of state.windows) {
      const prev = snapshot?.get(win.id);
      win.minimized = prev ? prev.minimized : false;
      win.maximized = prev ? prev.maximized : win.maximized;
    }
    state.minimizeSnapshot = null;
  } else {
    state.minimizeSnapshot = new Map(
      state.windows.map((win) => [win.id, { minimized: win.minimized, maximized: win.maximized }]),
    );
    for (const win of state.windows) {
      win.minimized = true;
      win.maximized = false;
    }
  }
  renderWindows();
  saveWindows();
}
async function closeAllWindows() {
  await Promise.all(state.windows.map((win) => stop(win)));
  state.windows = [];
  renderWindows();
  saveWindows();
}
function updateOutput(win) {
  const output = document.querySelector(`[data-output-for="${win.id}"]`);
  if (!output) return;
  // A reader looking at a file should not have it yanked away mid-run.
  if (win.view && win.view !== "output") return;
  // Only stick to the bottom when the reader is already there.
  const pinned = output.scrollHeight - output.scrollTop - output.clientHeight < 24;
  paint(win, output);
  if (pinned) output.scrollTop = output.scrollHeight;
}

/** `output` first — it is the run, not a file — then one tab per file. */
function renderTabs(win, tabs, script) {
  tabs.replaceChildren(
    tab(
      "output",
      !win.view || win.view === "output",
      () => showView(win, "output"),
      () => openInEditor(win, script.entry),
    ),
  );
  for (const file of win.files ?? []) {
    tabs.append(
      tab(
        file.name,
        win.view === file.name,
        () => showView(win, file.name),
        () => openInEditor(win, file.name),
      ),
    );
  }
  if (!win.notice) return;
  const notice = document.createElement("span");
  notice.className = "tab-notice";
  notice.textContent = win.notice;
  tabs.append(notice);
}

function tab(label, selected, handler, openHandler) {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "tab";
  button.textContent = label;
  button.title = `${label} — double-click to open in the editor`;
  button.setAttribute("aria-selected", String(selected));
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.detail > 1) return;
    handler();
  });
  button.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    openHandler();
  });
  return button;
}

/** The file the window is showing, or the entry when it is showing the run. */
function activeFile(win, script) {
  return win.view && win.view !== "output" ? win.view : script.entry;
}

async function openInEditor(win, name) {
  const path = win.scriptId.split("/").map(encodeURIComponent).join("/");
  win.notice = "";
  try {
    const response = await fetch(`/api/scripts/${path}/open`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file: name }),
    });
    if (!response.ok) throw new Error((await response.json()).error ?? "Could not open the editor");
  } catch (error) {
    win.notice = error.message || String(error);
    // The message is worth reading but not worth keeping on screen.
    setTimeout(() => {
      if (!win.notice) return;
      win.notice = "";
      renderWindows();
    }, 6000);
  }
  renderWindows();
}

function showView(win, view) {
  if (win.view === view) return;
  win.view = view;
  renderWindows();
  saveWindows();
}

function paint(win, output) {
  const file = (win.files ?? []).find((item) => item.name === win.view);
  const reading = Boolean(win.view) && win.view !== "output";
  output.classList.toggle("is-source", reading);
  output.classList.toggle("is-running", !reading && win.status === "running");
  if (file) {
    const code = document.createElement("code");
    code.append(highlight(file.text, file.name));
    output.replaceChildren(code);
    return;
  }
  // A view naming a file that is still loading, or no longer exists.
  if (reading) return output.replaceChildren(hint(win.files ? "File not found." : "Reading…"));
  output.replaceChildren(outputBody(win));
}

/** An opened-but-never-run window would otherwise be a blank black rectangle. */
function outputBody(win) {
  if (win.output) return renderOutput(win.output);
  return hint(win.status === "running" ? "" : "Press the play button to run this script.");
}

function hint(text) {
  const node = document.createElement("span");
  node.className = "output-hint";
  node.textContent = text;
  return node;
}

async function loadFiles(win) {
  if (win.files || win.loadingFiles) return;
  win.loadingFiles = true;
  const path = win.scriptId.split("/").map(encodeURIComponent).join("/");
  try {
    const response = await fetch(`/api/scripts/${path}/files`);
    win.files = response.ok ? (await response.json()).files ?? [] : [];
  } catch {
    win.files = [];
  }
  delete win.loadingFiles;
  renderWindows();
}
function updateWindow(win) {
  const root = document.querySelector(`[data-window-id="${win.id}"]`);
  if (root) root.querySelector(".window-status").textContent = win.status;
  updateOutput(win);
}
function syncDetail() {
  $("script-column").dataset.detail = state.detail;
  $("script-detail").textContent = detailLabels[state.detail];
  $("script-detail").title = "Cycle list detail";
  $("script-detail").setAttribute(
    "aria-label",
    `List detail: ${detailLabels[state.detail]}. Click to cycle.`,
  );
}

$("script-search").addEventListener("input", (event) => {
  state.filters.search = event.target.value;
  saveFilters();
  renderScripts();
});
$("clear-filters").addEventListener("click", () => {
  state.filters = blankFilters();
  $("script-search").value = "";
  saveFilters();
  renderFacets();
  renderScripts();
});
$("script-detail").addEventListener("click", () => {
  state.detail = details[(details.indexOf(state.detail) + 1) % details.length];
  localStorage.setItem("script-runner.detail.v1", JSON.stringify(state.detail));
  syncDetail();
  renderScripts();
});
$("minimize-all").addEventListener("click", minimizeAllWindows);
$("close-all").addEventListener("click", closeAllWindows);
boot().catch((error) => {
  $("diagnostics").hidden = false;
  $("diagnostics").textContent = error.message || error;
});
