/* ============================================================
   ElectroSim — application shell
   Navigation, theme, module mounting.
   ============================================================ */
(function () {
  "use strict";

  const nav = document.getElementById("nav");
  const content = document.getElementById("content");
  const placeholder = document.getElementById("placeholder");
  const moduleTitle = document.getElementById("moduleTitle");
  const moduleSubtitle = document.getElementById("moduleSubtitle");
  const themeToggle = document.getElementById("themeToggle");
  const themeLabel = document.getElementById("themeLabel");
  const homeBtn = document.getElementById("homeBtn");

  const modules = window.SimModules || [];

  const UNIT_META = {
    1: "Campo eléctrico",
    2: "Capacitores y dieléctricos",
    3: "Corriente y circuitos",
    4: "Campo magnético",
  };

  const unitButtons = new Map([[null, homeBtn]]);
  const unitSections = new Map();

  function buildDirectory() {
    const placeholderGrid = document.getElementById("placeholderGrid");

    for (const [key, title] of Object.entries(UNIT_META)) {
      const unit = Number(key);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nav-item";
      button.textContent = title;
      button.addEventListener("click", () => showWelcome(unit));
      nav.appendChild(button);
      unitButtons.set(unit, button);

      const section = document.createElement("section");
      section.className = "unit-section";
      const heading = document.createElement("h2");
      heading.textContent = title;
      const cards = document.createElement("div");
      cards.className = "module-cards";
      section.append(heading, cards);
      const unitMods = modules.filter((m) => m.unit === unit);
      for (const m of unitMods) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "quick-card";
        card.innerHTML = `<span class="qc-icon" aria-hidden="true">${m.icon}</span><span class="qc-title">${m.title}</span><span class="qc-sub">${m.subtitle}</span>`;
        card.addEventListener("click", () => selectModule(m.id));
        cards.appendChild(card);
      }
      placeholderGrid.appendChild(section);
      unitSections.set(unit, { section, heading });
    }
  }

  function markActive(unit) {
    for (const [key, button] of unitButtons) {
      if (unit === key) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }

  let currentCleanup = null;
  function unmount() {
    if (currentCleanup) {
      try { currentCleanup(); } catch (error) { console.error("Error al cerrar el módulo", error); }
      currentCleanup = null;
    }
    content.replaceChildren();
    content.scrollTop = 0;
  }

  function selectModule(id) {
    const mod = modules.find((m) => m.id === id);
    if (!mod) return;

    unmount();
    moduleTitle.textContent = mod.title;
    moduleSubtitle.textContent = mod.subtitle;
    markActive(mod.unit);

    try {
      currentCleanup = mod.mount(content) || null;
    } catch (e) {
      console.error("Error mounting module", id, e);
      content.innerHTML = '<div style="padding:30px;color:var(--text-dim);">Error al cargar el módulo. Revisa la consola.</div>';
    }

    moduleTitle.focus({ preventScroll: true });
  }

  function showWelcome(unit = null) {
    unmount();
    for (const [key, { section, heading }] of unitSections) {
      section.hidden = unit !== null && unit !== key;
      heading.hidden = unit !== null;
    }
    placeholder.querySelector(".help-guide").hidden = unit !== null;
    content.appendChild(placeholder);
    moduleTitle.textContent = UNIT_META[unit] || "Inicio";
    moduleSubtitle.textContent = unit === null ? "Elige un simulador de las cuatro unidades de Física II." : "";
    markActive(unit);
  }

  // Theme
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeLabel.textContent = theme === "dark" ? "Tema claro" : "Tema oscuro";
    themeToggle.querySelector(".theme-icon").textContent = theme === "dark" ? "☀️" : "🌙";
    try { localStorage.setItem("electrosim-theme", theme); } catch (e) {}
  }
  themeToggle.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(cur === "dark" ? "light" : "dark");
  });
  homeBtn.addEventListener("click", () => showWelcome());

  // Init
  window.__mono = "JetBrains Mono, monospace";
  let savedTheme = "light";
  try { savedTheme = localStorage.getItem("electrosim-theme") || "light"; } catch (e) {}
  applyTheme(savedTheme);
  buildDirectory();
  showWelcome();

  // expose for debugging
  window.ElectroSim = { modules, selectModule, showWelcome };
})();
