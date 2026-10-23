(() => {
  "use strict";

  const STORAGE_KEY = "textSnippets.local.v1";

  const listEl = document.getElementById("snippet-list");
  const emptyEl = document.getElementById("empty");
  const searchEl = document.getElementById("search");
  const categoryFilterEl = document.getElementById("category-filter");
  const categoryOptionsEl = document.getElementById("category-options");
  const dialog = document.getElementById("editor");
  const form = document.getElementById("editor-form");
  const editorHeading = document.getElementById("editor-heading");
  const charCountEl = document.getElementById("char-count");
  const toastEl = document.getElementById("toast");
  const fields = form.elements;

  // Shared snippets come from snippets.json in the repo; local ones live in this browser.
  let sharedSnippets = [];
  let localSnippets = loadLocal();
  let editingId = null;

  function loadLocal() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(localSnippets));
    } catch {
      showToast("Could not save – browser storage is unavailable");
    }
  }

  function allSnippets() {
    return [
      ...sharedSnippets.map((s) => ({ ...s, local: false })),
      ...localSnippets.map((s) => ({ ...s, local: true })),
    ];
  }

  function newId() {
    return "local-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
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

  function render() {
    const query = searchEl.value.trim().toLowerCase();
    const category = categoryFilterEl.value;

    const snippets = allSnippets()
      .filter((s) => !category || s.category === category)
      .filter((s) => !query || `${s.title} ${s.text} ${s.category || ""}`.toLowerCase().includes(query))
      .sort((a, b) => (a.category || "~").localeCompare(b.category || "~") || a.title.localeCompare(b.title));

    listEl.replaceChildren(...snippets.map(renderSnippet));
    emptyEl.hidden = snippets.length > 0;
    emptyEl.textContent = allSnippets().length
      ? "No snippets match your search."
      : "No snippets yet. Click “+ Add snippet” to create one.";
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
    if (snippet.local) head.append(tag("Added in this browser", "local"));

    const actions = document.createElement("div");
    actions.className = "snippet-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "primary copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => copySnippet(snippet.text, copyBtn));
    actions.append(copyBtn);

    if (snippet.local) {
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
    text.textContent = snippet.text;

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
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2000);
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
    charCountEl.textContent = fields.text.value.length;
  }

  function saveFromForm() {
    const data = {
      title: fields.title.value.trim(),
      category: fields.category.value.trim(),
      text: fields.text.value.trim(),
    };
    if (!data.title || !data.text) return;

    if (editingId) {
      localSnippets = localSnippets.map((s) => (s.id === editingId ? { ...s, ...data } : s));
    } else {
      localSnippets.push({ id: newId(), ...data });
    }
    saveLocal();
    renderCategories();
    render();
    showToast(editingId ? "Snippet updated" : "Snippet added");
  }

  function deleteSnippet(snippet) {
    if (!confirm(`Delete “${snippet.title}”?`)) return;
    localSnippets = localSnippets.filter((s) => s.id !== snippet.id);
    saveLocal();
    renderCategories();
    render();
    showToast("Snippet deleted");
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
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("not a list");

      const existing = new Set(allSnippets().map((s) => `${s.title}\n${s.text}`));
      let added = 0;
      for (const item of parsed) {
        if (!item || typeof item.title !== "string" || typeof item.text !== "string") continue;
        const key = `${item.title.trim()}\n${item.text.trim()}`;
        if (existing.has(key)) continue;
        existing.add(key);
        localSnippets.push({
          id: newId(),
          title: item.title.trim(),
          category: typeof item.category === "string" ? item.category.trim() : "",
          text: item.text.trim(),
        });
        added++;
      }
      saveLocal();
      renderCategories();
      render();
      showToast(`Imported ${added} new snippet${added === 1 ? "" : "s"}`);
    } catch {
      showToast("Import failed – please choose a valid snippets .json file");
    }
  }

  async function loadShared() {
    try {
      const res = await fetch("snippets.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(res.statusText);
      const data = await res.json();
      sharedSnippets = Array.isArray(data) ? data.filter((s) => s && s.title && s.text) : [];
    } catch {
      showToast("Could not load the shared snippets");
    }
    renderCategories();
    render();
  }

  document.getElementById("add-btn").addEventListener("click", () => openEditor(null));
  document.getElementById("cancel-btn").addEventListener("click", () => dialog.close());
  document.getElementById("export-btn").addEventListener("click", exportSnippets);
  document.getElementById("import-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importSnippets(file);
    e.target.value = "";
  });
  form.addEventListener("submit", saveFromForm);
  fields.text.addEventListener("input", updateCharCount);
  searchEl.addEventListener("input", render);
  categoryFilterEl.addEventListener("change", render);

  render();
  loadShared();
})();
