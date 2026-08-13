const state = {
  scripts: [],
  diagnostics: [],
  selectedId: null,
  filters: blankFilters(),
  windows: [],
  z: 1,
};
const facets = ["group", "space", "section", "tags"];
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
      state.windows.map(({ controller: _c, runId: _r, ...win }) => ({
        ...win,
        status: win.status === "running" ? "interrupted" : win.status,
      })),
    ),
  );
}

async function boot() {
  state.filters = { ...blankFilters(), ...load("script-runner.filters.v2", {}) };
  const response = await fetch("/api/catalog", { cache: "no-store" });
  const catalog = await response.json();
  state.scripts = catalog.scripts;
  state.diagnostics = catalog.diagnostics;
  document.title = catalog.config.title;
  $("app-title").textContent = catalog.config.title;
  $("app-favicon").href = catalog.config.favicon;
  const widths = catalog.config.columnWidths;
  document.documentElement.style.setProperty("--facet-w", `${widths.facets}px`);
  document.documentElement.style.setProperty("--scripts-w", `${widths.scripts}px`);
  document.documentElement.style.setProperty("--workspace-w", `${widths.workspace}px`);
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
  const values = new Set();
  for (const script of state.scripts) {
    const items = facet === "tags" ? script.tags : [script[facet]];
    for (const item of items) if (item) values.add(item);
  }
  return [...values].sort((a, b) => a.localeCompare(b));
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
    for (const value of valuesFor(facet)) {
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
      label.append(input, document.createTextNode(value));
      section.append(label);
    }
    root.append(section);
  }
}

function visibleScripts() {
  const search = state.filters.search.toLowerCase();
  return state.scripts.filter((script) => {
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
  });
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
  for (const script of scripts) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "script-row";
    row.role = "option";
    row.dataset.scriptId = script.id;
    row.setAttribute("aria-selected", String(script.id === state.selectedId));
    row.style.setProperty("--script-color", script.color);
    const image = icon(script.icon, "");
    image.classList.add("script-icon");
    const name = document.createElement("span");
    name.className = "script-name";
    name.textContent = script.name;
    const description = document.createElement("span");
    description.className = "script-description";
    description.textContent = script.description;
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
    row.append(image, name, description, meta);
    row.addEventListener("click", () => {
      state.selectedId = script.id;
      renderScripts();
    });
    row.addEventListener("dblclick", () => launch(script));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        launch(script);
      }
    });
    root.append(row);
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
function launch(script) {
  let win = newest(script.id);
  if (script.instances === "focus" && win) return focus(win.id);
  if (script.instances === "rerun" && win) {
    focus(win.id);
    return run(win);
  }
  const count = state.windows.length;
  win = {
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
  run(win);
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
    const output = document.createElement("pre");
    output.className = "window-output";
    output.dataset.outputFor = win.id;
    output.innerHTML = ansi(win.output);
    root.append(bar, output);
    root.addEventListener("pointerdown", () => focus(win.id), { once: true });
    drag(bar, root, win);
    observeSize(root, win);
    layer.append(root);
  }
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
    focus(win.id);
    const sx = event.clientX, sy = event.clientY, ox = win.x, oy = win.y;
    handle.setPointerCapture(event.pointerId);
    const move = (e) => {
      win.x = Math.max(0, Math.min(layer.clientWidth - 80, ox + e.clientX - sx));
      win.y = Math.max(0, Math.min(layer.clientHeight - 38, oy + e.clientY - sy));
      root.style.left = `${win.x}px`;
      root.style.top = `${win.y}px`;
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      saveWindows();
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up, { once: true });
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
function updateOutput(win) {
  const output = document.querySelector(`[data-output-for="${win.id}"]`);
  if (output) {
    output.innerHTML = ansi(win.output);
    output.scrollTop = output.scrollHeight;
  }
}
function updateWindow(win) {
  const root = document.querySelector(`[data-window-id="${win.id}"]`);
  if (root) root.querySelector(".window-status").textContent = win.status;
  updateOutput(win);
}
function ansi(text) {
  const escape = (value) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const colors = {
    2: "dim",
    31: "red",
    32: "green",
    33: "yellow",
    34: "blue",
    35: "magenta",
    36: "cyan",
  };
  let active = "";
  let out = "";
  let last = 0;
  const ansiPattern = new RegExp(`${String.fromCharCode(27)}\\[([0-9;]*)m`, "g");
  for (const match of text.matchAll(ansiPattern)) {
    out += escape(text.slice(last, match.index));
    const code = Number(match[1].split(";").at(-1) || 0);
    if (active) out += "</span>";
    active = colors[code] || "";
    if (active) out += `<span class="ansi-${active}">`;
    last = match.index + match[0].length;
  }
  return out + escape(text.slice(last)) + (active ? "</span>" : "");
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
boot().catch((error) => {
  $("diagnostics").hidden = false;
  $("diagnostics").textContent = error.message || error;
});
