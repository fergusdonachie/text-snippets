(() => {
  "use strict";

  // Snippets saved in this browser by earlier versions of the app, before the shared store existed.
  const LEGACY_STORAGE_KEY = "textSnippets.local.v1";
  // Added to the end of every message so patients know who it is from.
  const SIGN_OFF = "Annan North Surgery";

  const listEl = document.getElementById("snippet-list");
  const emptyEl = document.getElementById("empty");
  const searchEl = document.getElementById("search");
  const categoryFilterEl = document.getElementById("category-filter");
  const categoryOptionsEl = document.getElementById("category-options");
  const addBtn = document.getElementById("add-btn");
  const editNoteEl = document.getElementById("edit-note");
  const legacyBannerEl = document.getElementById("legacy-banner");
  const legacyTextEl = document.getElementById("legacy-text");
  const migrateBtn = document.getElementById("migrate-btn");
  const importLabel = document.getElementById("import-label");
  const dialog = document.getElementById("editor");
  const form = document.getElementById("editor-form");
  const editorHeading = document.getElementById("editor-heading");
  const charCountEl = document.getElementById("char-count");
  const saveBtn = document.getElementById("save-btn");
  const toastEl = document.getElementById("toast");
  const fields = form.elements;

  let snippets = [];
  let legacySnippets = loadLegacy();
  let editable = false;
  let loaded = false;
  let editingId = null;

  function loadLegacy() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed.filter((s) => s && s.title && s.text) : [];
    } catch {
      return [];
    }
  }

  function clearLegacy() {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // Nothing to clear if storage is unavailable.
    }
    legacySnippets = [];
  }

  function allSnippets() {
    return [
      ...snippets.map((s) => ({ ...s, local: false })),
      ...legacySnippets.map((s) => ({ ...s, local: true })),
    ];
  }

  function withSignOff(text) {
    const trimmed = text.trim();
    return trimmed.toLowerCase().endsWith(SIGN_OFF.toLowerCase()) ? trimmed : `${trimmed}\n${SIGN_OFF}`;
  }

  function categories() {
    const set = new Set(allSnippets().map((s) => s.category).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  function renderCategories() {
    const current = categoryFilterEl.value;
    const cats = categories();
    categoryFilterEl.replaceChildren(new Option("All categories", ""), ...cats.map((c) => new Option(c, c)));
    categoryFilterEl.value = cats.includes(current) ? current : "";
    categoryOptionsEl.replaceChildren(...cats.map((c) => new Option(c)));
  }

  function renderAll() {
    addBtn.hidden = !editable;
    editNoteEl.hidden = editable || !loaded;
    importLabel.hidden = !editable;

    legacyBannerEl.hidden = legacySnippets.length === 0;
    migrateBtn.hidden = !editable;
    const count = `${legacySnippets.length} snippet${legacySnippets.length === 1 ? " is" : "s are"}`;
    legacyTextEl.textContent = editable
      ? `${count} saved only in this browser. Move them to the shared list so the whole team can use them.`
      : `${count} saved only in this browser. Open this page on the NHS network to move them to the shared list.`;

    renderCategories();
    render();
  }

  function render() {
    const query = searchEl.value.trim().toLowerCase();
    const category = categoryFilterEl.value;

    const visible = allSnippets()
      .filter((s) => !category || s.category === category)
      .filter((s) => !query || `${s.title} ${s.text} ${s.category || ""}`.toLowerCase().includes(query))
      .sort((a, b) => (a.category || "~").localeCompare(b.category || "~") || a.title.localeCompare(b.title));

    listEl.replaceChildren(...visible.map(renderSnippet));
    emptyEl.hidden = !loaded || visible.length > 0;
    emptyEl.textContent = allSnippets().length
      ? "No snippets match your search."
      : "No snippets yet.";
  }

  function renderSnippet(snippet) {
    const li = document.createElement("li");
    li.className = "snippet";

    const head = document.createElement("div");
    head.className = "snippet-head";
    const title = document.createElement("h2");
    title.textContent = snippet.title;
    head.append(title);
    if (snippet.category) head.append(tag(snippet.category));
    if (snippet.local) head.append(tag("Saved in this browser only", "local"));

    const actions = document.createElement("div");
    actions.className = "snippet-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "primary copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => copySnippet(withSignOff(snippet.text), copyBtn));
    actions.append(copyBtn);

    if (editable && !snippet.local) {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "small";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => openEditor(snippet));

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "small danger";
      deleteBtn.textContent = "Delete";
      deleteBtn.addEventListener("click", () => deleteSnippet(snippet));

      actions.append(editBtn, deleteBtn);
    }

    const text = document.createElement("p");
    text.className = "snippet-text";
    text.textContent = withSignOff(snippet.text);

    li.append(head, text, actions);
    return li;
  }

  function tag(label, extraClass) {
    const span = document.createElement("span");
    span.className = "tag" + (extraClass ? " " + extraClass : "");
    span.textContent = label;
    return span;
  }

  async function copySnippet(text, button) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = fallbackCopy(text);
    }

    if (!ok) {
      showToast("Copy failed – please select the text and copy manually");
      return;
    }

    button.textContent = "Copied ✓";
    button.classList.add("copied");
    showToast("Copied to clipboard");
    setTimeout(() => {
      button.textContent = "Copy";
      button.classList.remove("copied");
    }, 1500);
  }

  // For older browsers or non-HTTPS contexts where the Clipboard API is unavailable.
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  let toastTimer;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2500);
  }

  async function api(method, body) {
    const res = await fetch("/api/snippets", {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403) {
        editable = false;
        renderAll();
      }
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function openEditor(snippet) {
    editingId = snippet ? snippet.id : null;
    editorHeading.textContent = snippet ? "Edit snippet" : "Add snippet";
    fields.title.value = snippet ? snippet.title : "";
    fields.category.value = snippet ? snippet.category || "" : categoryFilterEl.value;
    fields.text.value = snippet ? snippet.text : "";
    updateCharCount();
    dialog.showModal();
    fields.title.focus();
  }

  function updateCharCount() {
    charCountEl.textContent = withSignOff(fields.text.value).length;
  }

  async function saveFromForm(event) {
    event.preventDefault();
    const data = {
      title: fields.title.value.trim(),
      category: fields.category.value.trim(),
      text: fields.text.value.trim(),
    };
    if (!data.title || !data.text) return;

    saveBtn.disabled = true;
    try {
      if (editingId) {
        const { snippet } = await api("PUT", { id: editingId, ...data });
        snippets = snippets.map((s) => (s.id === editingId ? snippet : s));
      } else {
        const { snippet } = await api("POST", data);
        snippets.push(snippet);
      }
      dialog.close();
      renderAll();
      showToast(editingId ? "Snippet updated" : "Snippet added");
    } catch (err) {
      showToast(err.message);
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function deleteSnippet(snippet) {
    if (!confirm(`Delete “${snippet.title}” for everyone?`)) return;
    try {
      await api("DELETE", { id: snippet.id });
      snippets = snippets.filter((s) => s.id !== snippet.id);
      renderAll();
      showToast("Snippet deleted");
    } catch (err) {
      showToast(err.message);
    }
  }

  // Adds snippets to the shared list, skipping any whose title and text already exist there.
  async function addMany(items) {
    const existing = new Set(snippets.map((s) => `${s.title.trim()}\n${s.text.trim()}`));
    let added = 0;
    for (const item of items) {
      if (!item || typeof item.title !== "string" || typeof item.text !== "string") continue;
      const data = {
        title: item.title.trim(),
        category: typeof item.category === "string" ? item.category.trim() : "",
        text: item.text.trim(),
      };
      const key = `${data.title}\n${data.text}`;
      if (!data.title || !data.text || existing.has(key)) continue;
      const { snippet } = await api("POST", data);
      snippets.push(snippet);
      existing.add(key);
      added++;
    }
    return added;
  }

  async function migrateLegacy() {
    migrateBtn.disabled = true;
    try {
      const added = await addMany(legacySnippets);
      clearLegacy();
      showToast(`Moved ${added} snippet${added === 1 ? "" : "s"} to the shared list`);
    } catch (err) {
      showToast(err.message);
    } finally {
      migrateBtn.disabled = false;
      renderAll();
    }
  }

  function exportSnippets() {
    const data = allSnippets().map(({ id, title, category, text }) => ({ id, title, category, text }));
    const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "snippets.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importSnippets(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("not a list");
    } catch {
      showToast("Import failed – please choose a valid snippets .json file");
      return;
    }
    try {
      const added = await addMany(parsed);
      showToast(`Imported ${added} new snippet${added === 1 ? "" : "s"}`);
    } catch (err) {
      showToast(err.message);
    } finally {
      renderAll();
    }
  }

  async function load() {
    try {
      const data = await api("GET");
      snippets = Array.isArray(data.snippets) ? data.snippets : [];
      editable = Boolean(data.canEdit);
    } catch {
      // Shared store unavailable: fall back to the starter list, read-only.
      try {
        const res = await fetch("snippets.json", { cache: "no-cache" });
        const data = await res.json();
        snippets = Array.isArray(data) ? data.filter((s) => s && s.title && s.text) : [];
      } catch {
        showToast("Could not load snippets");
      }
      editable = false;
    }
    loaded = true;
    renderAll();
  }

  addBtn.addEventListener("click", () => openEditor(null));
  document.getElementById("cancel-btn").addEventListener("click", () => dialog.close());
  document.getElementById("export-btn").addEventListener("click", exportSnippets);
  document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importSnippets(file);
    e.target.value = "";
  });
  migrateBtn.addEventListener("click", migrateLegacy);
  form.addEventListener("submit", saveFromForm);
  fields.text.addEventListener("input", updateCharCount);
  searchEl.addEventListener("input", render);
  categoryFilterEl.addEventListener("change", render);

  renderAll();
  load();
})();
