/* ============================================================
   ElectroSim — UI helper factory
   Declarative control creation for simulation panels.
   ============================================================ */
(function (global) {
  "use strict";

  // Create a high-DPI canvas inside a container, returns {canvas, ctx, w, h, resize, toWorld...}
  function createCanvas(container, opts) {
    opts = opts || {};
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let w = 0, h = 0, dpr = 1, cssW = 0, cssH = 0;

    function resize() {
      const nextW = container.clientWidth || 600;
      const nextH = container.clientHeight || 460;
      const nextDpr = window.devicePixelRatio || 1;
      if (nextW === cssW && nextH === cssH && nextDpr === dpr) return;
      cssW = nextW;
      cssH = nextH;
      dpr = nextDpr;
      w = Math.round(cssW * dpr);
      h = Math.round(cssH * dpr);
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = cssW + "px";
      canvas.style.height = cssH + "px";
    }
    resize();
    window.addEventListener("resize", resize);
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    return {
      canvas, ctx, container,
      get w() { return w; },
      get h() { return h; },
      get cssW() { return cssW; },
      get cssH() { return cssH; },
      get dpr() { return dpr; },
      resize,
      destroy() {
        resizeObserver.disconnect();
        window.removeEventListener("resize", resize);
        canvas.remove();
      },
    };
  }

  // Build a control panel DOM from a definition list
  function buildControls(container, defs) {
    const frag = document.createDocumentFragment();
    const handle = {};
    let group, groupName;
    for (const item of defs) {
      if (!group || (item.group !== "none" && item.group !== groupName)) {
        groupName = item.group;
        if (groupName !== "none") {
          const h = document.createElement("h3");
          h.textContent = groupName;
          frag.appendChild(h);
        }
        group = document.createElement("div");
        group.className = "control-group";
        frag.appendChild(group);
      }

      group.appendChild(renderControl(item, handle));
    }
    container.appendChild(frag);
    return handle;
  }

  let sliderId = 0;
  function renderControl(item, handle) {
    const wrap = document.createElement("div");
    switch (item.type) {
      case "number": {
        wrap.className = "control";
        const label = document.createElement("label");
        label.textContent = item.label;
        const input = document.createElement("input");
        input.className = "sim-input";
        input.type = "number";
        input.step = item.step || "any";
        input.value = item.value;
        if (item.min != null) input.min = item.min;
        if (item.max != null) input.max = item.max;
        input.setAttribute("aria-label", item.label);
        input.addEventListener("input", () => {
          if (input.validity.valid && Number.isFinite(input.valueAsNumber)) item.onChange(input.valueAsNumber);
        });
        wrap.append(label, input);
        handle[item.key] = input;
        break;
      }
      case "slider": {
        wrap.className = "control";
        const row = document.createElement("div");
        row.className = "control-row";
        const label = document.createElement("label");
        label.textContent = item.label;
        const val = document.createElement("span");
        val.className = "value";

        const isLog = !!item.log;
        // For log sliders the input range is 0..100 (percent) mapped exponentially.
        const lo = item.min, hi = item.max;
        const toInput = isLog
          ? (v) => (Math.log(v / lo) / Math.log(hi / lo)) * 100
          : (v) => v;
        const fromInput = isLog
          ? (p) => lo * Math.pow(hi / lo, p / 100)
          : (p) => p;

        const input = document.createElement("input");
        input.type = "range";
        input.id = "sim-slider-" + ++sliderId;
        label.htmlFor = input.id;
        input.min = isLog ? 0 : lo;
        input.max = isLog ? 100 : hi;
        input.step = isLog ? "any" : (item.step || "any");
        input.value = toInput(item.value);

        function updateLabel(v) {
          const displayValue = String(item.format ? item.format(v) : v);
          val.textContent = displayValue;
          input.setAttribute("aria-valuetext", displayValue);
        }
        updateLabel(item.value);

        input.addEventListener("input", () => {
          const v = fromInput(parseFloat(input.value));
          updateLabel(v);
          if (item.onChange) item.onChange(v);
        });
        row.append(label, val);
        wrap.append(row, input);
        if (handle) handle[item.key] = {
          element: wrap,
          get value() { return fromInput(parseFloat(input.value)); },
          set value(v) {
            input.value = toInput(v);
            updateLabel(v);
          },
        };
        break;
      }
      case "segmented": {
        wrap.className = "control";
        const label = document.createElement("label");
        label.textContent = item.label;
        const seg = document.createElement("div");
        seg.className = "segmented";
        const buttons = {};
        item.options.forEach((opt, idx) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = opt.label;
          if (idx === (item.value || 0)) b.classList.add("active");
          b.addEventListener("click", () => {
            Object.values(buttons).forEach((x) => x.classList.remove("active"));
            b.classList.add("active");
            if (item.onChange) item.onChange(opt.value);
          });
          buttons[opt.value] = b;
          seg.appendChild(b);
        });
        wrap.append(label, seg);
        if (handle) {
          handle[item.key] = {
            set value(v) {
              Object.entries(buttons).forEach(([k, b]) => b.classList.toggle("active", String(k) === String(v)));
            },
            get value() {
              for (const [k, b] of Object.entries(buttons)) if (b.classList.contains("active")) return k;
              return null;
            },
          };
        }
        break;
      }
      case "buttons": {
        wrap.className = "control";
        const label = document.createElement("label");
        label.textContent = item.label;
        const row = document.createElement("div");
        row.className = "btn-row";
        for (const b of item.buttons) {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "btn " + (b.primary ? "btn-primary " : "") + (b.size || "");
          btn.textContent = b.label;
          btn.addEventListener("click", b.onClick);
          row.appendChild(btn);
          if (handle && b.key) handle[b.key] = btn;
        }
        wrap.append(label, row);
        break;
      }
      case "readouts": {
        wrap.className = "readouts";
        const out = {};
        for (const r of item.readouts) {
          const ro = document.createElement("div");
          ro.className = "readout";
          const lbl = document.createElement("div");
          lbl.className = "readout-label";
          lbl.textContent = r.label;
          const val = document.createElement("div");
          val.className = "readout-value";
          const number = document.createElement("span");
          number.className = "num";
          number.textContent = "—";
          const unit = document.createElement("span");
          unit.className = "readout-unit";
          unit.dataset.baseUnit = r.unit || "";
          unit.textContent = r.unit || "";
          val.append(number, " ", unit);
          ro.append(lbl, val);
          wrap.appendChild(ro);
          out[r.key] = number;
        }
        if (handle) handle[item.key || "readouts"] = out;
        break;
      }
      case "formula": {
        wrap.className = "control";
        const f = document.createElement("div");
        f.className = "formula";
        f.innerHTML = item.html;
        wrap.appendChild(f);
        break;
      }
      case "hint": {
        wrap.className = "control";
        const h = document.createElement("p");
        h.className = "hint";
        h.textContent = item.text;
        wrap.appendChild(h);
        break;
      }
      case "color": {
        wrap.className = "control";
        const row = document.createElement("div");
        row.className = "control-row";
        const label = document.createElement("label");
        label.textContent = item.label;
        const input = document.createElement("input");
        input.type = "color";
        input.value = item.value || "#3b6ef6";
        input.style.cssText = "width:34px;height:26px;border:1px solid var(--border);border-radius:6px;background:transparent;cursor:pointer;padding:2px;";
        input.addEventListener("input", () => item.onChange && item.onChange(input.value));
        row.append(label, input);
        wrap.append(row);
        if (handle) handle[item.key] = { get value() { return input.value; } };
        break;
      }
    }
    return wrap;
  }

  function setReadout(el, value, digits) {
    if (!el) return;
    const formatted = typeof value === "number" ? fmt(value, digits) : String(value).trimEnd();
    const unit = el.nextElementSibling;
    const baseUnit = unit?.dataset.baseUnit;
    // fmtSI returns the prefix after a space. Keep it with its unit when the row wraps.
    const scaled = baseUnit && formatted.match(/^(.+) ([GMkmµnpf])$/);
    const displayValue = scaled ? scaled[1] : formatted;
    if (el.textContent !== displayValue) el.textContent = displayValue;
    if (baseUnit) {
      const displayUnit = scaled ? scaled[2] + baseUnit : baseUnit;
      if (unit.textContent !== displayUnit) unit.textContent = displayUnit;
    }
  }

  function canvasPalette(element) {
    const style = getComputedStyle(element);
    return {
      ink: style.getPropertyValue("--text").trim(),
      muted: style.getPropertyValue("--text-dim").trim(),
      grid: style.getPropertyValue("--border-strong").trim(),
      surface: style.getPropertyValue("--bg-elevated").trim(),
      accent: style.getPropertyValue("--accent").trim(),
      current: style.getPropertyValue("--red").trim(),
    };
  }

  // Fit a diagram's drawing coordinates inside a canvas region.
  function fitDiagram(ctx, x, y, width, height, designWidth, designHeight) {
    const scale = Math.min(width / designWidth, height / designHeight);
    ctx.translate(x + (width - scale * designWidth) / 2, y + (height - scale * designHeight) / 2);
    ctx.scale(scale, scale);
  }

  function addRealCases(container, moduleId, apply, loadOnSelect = true) {
    const examples = global.RealCases[moduleId];
    const panel = document.createElement("section");
    panel.className = "real-case";
    const label = document.createElement("label");
    label.textContent = "Caso real";
    const select = document.createElement("select");
    select.className = "sim-input";
    select.id = "real-case-" + moduleId;
    label.htmlFor = select.id;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecciona una situación";
    select.appendChild(placeholder);
    examples.forEach((example, i) => {
      const option = document.createElement("option");
      option.value = i;
      option.textContent = example.name;
      select.appendChild(option);
    });
    const reload = document.createElement("button");
    reload.className = "btn btn-sm";
    reload.type = "button";
    reload.textContent = loadOnSelect ? "Restablecer caso" : "Cargar caso";
    reload.disabled = true;
    const details = document.createElement("div");
    details.className = "real-case-details";
    details.hidden = true;
    const description = document.createElement("p");
    const title = document.createElement("h4");
    title.textContent = "Referencia con los valores iniciales";
    const references = document.createElement("dl");
    const note = document.createElement("p");
    note.className = "hint";
    note.textContent = loadOnSelect
      ? "Valores ilustrativos y modelos ideales. Puedes modificar los parámetros y comparar las lecturas con esta referencia."
      : "Valores ilustrativos y componentes ideales. Cargar el caso reemplaza el esquema actual.";
    details.append(description, title, references, note);
    panel.append(label, select, reload, details);
    container.prepend(panel);

    function showReference() {
      reload.disabled = select.value === "";
      details.hidden = select.value === "";
      if (select.value === "") return;
      const example = examples[Number(select.value)];
      description.textContent = example.description;
      references.replaceChildren();
      for (const { label, value, unit } of example.references) {
        const term = document.createElement("dt");
        term.textContent = label;
        const reading = document.createElement("dd");
        reading.textContent = Number(value.toPrecision(6)).toLocaleString("es-PE", { maximumSignificantDigits: 6 }) + " " + unit;
        references.append(term, reading);
      }
    }
    function load() {
      if (select.value !== "") apply(examples[Number(select.value)].params);
    }
    select.addEventListener("change", () => {
      showReference();
      if (loadOnSelect) load();
    });
    reload.addEventListener("click", load);
    return () => {
      select.value = "";
      showReference();
    };
  }

  // Convert canvas coordinates <-> world coordinates given a viewport
  function makeViewport(canvasObj, opts) {
    opts = opts || {};
    const scale = opts.scale || 1; // px per world unit
    return {
      scale,
      // world (0,0) at center of canvas
      toScreen(p) {
        return [canvasObj.cssW / 2 + p[0] * scale, canvasObj.cssH / 2 - p[1] * scale];
      },
      toWorld(px, py) {
        return [(px - canvasObj.cssW / 2) / scale, (canvasObj.cssH / 2 - py) / scale];
      },
    };
  }

  global.createCanvas = createCanvas;
  global.buildControls = buildControls;
  global.setReadout = setReadout;
  global.canvasPalette = canvasPalette;
  global.fitDiagram = fitDiagram;
  global.addRealCases = addRealCases;
  global.makeViewport = makeViewport;
})(window);
