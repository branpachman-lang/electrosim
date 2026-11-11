/* Circuit editor and live measurements. */
(function (global) {
  "use strict";
  const columns = 13, rows = 9, gap = 50, inset = 24, limit = 40;
  const width = 2 * inset + gap * (columns - 1), height = 2 * inset + gap * (rows - 1);
  const key = "electrosim-circuit-v1";
  const types = {
    R: { name: "Resistencia", unit: "Ω", value: 1000, min: 0.01, max: 1e8 },
    C: { name: "Capacitor", unit: "µF", value: 1000, min: 0.001, max: 1e6, factor: 1e-6 },
    V: { name: "Fuente V", unit: "V", value: 9, min: -1000, max: 1000 },
    I: { name: "Fuente I", unit: "mA", value: 10, min: -10000, max: 10000, factor: 1e-3 },
    S: { name: "Interruptor" },
    W: { name: "Cable" },
    AM: { name: "Amperímetro" },
    VM: { name: "Voltímetro" },
  };
  const node = (x, y) => y * columns + x;
  const point = (n) => [inset + n % columns * gap, inset + Math.floor(n / columns) * gap];
  const validNode = (n) => Number.isInteger(n) && n >= 0 && n < columns * rows;
  const symbols = {
    R: '<path d="M-18 0h3l3-8 6 16 6-16 6 16 6-16 3 8h3"/>',
    C: '<path d="M-18 0h14m8 0h14M-4-12v24M4-12v24"/>',
    V: '<circle r="15"/><path d="M-18 0h3m30 0h3M-11 0h8m-4-4v8M4 0h7"/>',
    I: '<circle r="15"/><path d="M-18 0h3m30 0h3M-8 0H8m-5-5 5 5-5 5"/>',
    W: '<path d="M-18 0h36"/>',
  };
  function validPart(part) {
    if (!part || typeof part.type !== "string" || !Object.hasOwn(types, part.type) ||
      !Number.isSafeInteger(part.id) || part.id < 1 ||
      !validNode(part.a) || !validNode(part.b) || part.a === part.b) return false;
    const info = types[part.type];
    const value = part.value / (info.factor || 1);
    if (part.type === "S") return typeof part.closed === "boolean";
    return !info.unit || (Number.isFinite(value) && value >= info.min * (info.min > 0 ? 1 - 1e-12 : 1) &&
      value <= info.max * (1 + 1e-12) && (part.type !== "C" || (Number.isFinite(part.initial) && Math.abs(part.initial) <= 1000)));
  }

  function validParts(parts) {
    return Array.isArray(parts) && parts.length <= limit && parts.every(validPart) &&
      new Set(parts.map((part) => part.id)).size === parts.length;
  }

  function example(name) {
    const parts = [];
    const part = (type, x1, y1, x2, y2, value) =>
      parts.push({ id: parts.length + 1, type, a: node(x1, y1), b: node(x2, y2), value: value ?? 0,
        initial: 0, closed: true });
    if (name === "discharge") {
      part("C", 2, 2, 2, 6, 220e-6);
      parts[0].initial = 12;
      part("W", 2, 2, 8, 2);
      part("R", 8, 2, 8, 6, 1000);
      part("W", 8, 6, 2, 6);
      return parts;
    }
    const isRC = name === "rc" || name === "sensor";
    part("V", 2, 2, 2, 6, isRC ? 5 : 12);
    if (isRC) {
      part("R", 2, 2, 8, 2, name === "sensor" ? 10000 : 1000);
      part("C", 8, 2, 8, 6, name === "sensor" ? 100e-6 : 0.001);
      part("W", 8, 6, 2, 6);
    } else if (name === "divider") {
      part("AM", 2, 2, 4, 2);
      part("R", 4, 2, 7, 2, 1000);
      part("R", 7, 2, 7, 6, 1000);
      part("W", 7, 2, 10, 2);
      part("VM", 10, 2, 10, 6);
      part("W", 10, 6, 7, 6);
      part("W", 7, 6, 2, 6);
    } else if (name === "meters") {
      part("AM", 2, 2, 5, 2);
      part("R", 5, 2, 9, 2, 120);
      part("W", 5, 2, 5, 4);
      part("VM", 5, 4, 9, 4);
      part("W", 9, 2, 9, 4);
      part("W", 9, 4, 9, 6);
      part("W", 9, 6, 2, 6);
    } else if (name === "series") {
      part("R", 2, 2, 6, 2, 100);
      part("R", 6, 2, 10, 2, 200);
      part("W", 10, 2, 10, 6);
      part("W", 10, 6, 2, 6);
    } else {
      if (name === "mixed") part("R", 2, 2, 6, 2, 100);
      else part("W", 2, 2, 6, 2);
      part("R", 6, 2, 6, 6, 200);
      part("R", 10, 2, 10, 6, 300);
      part("W", 6, 2, 10, 2);
      part("W", 10, 6, 6, 6);
      part("W", 6, 6, 2, 6);
    }
    return parts;
  }

  function load() {
    try {
      const parts = JSON.parse(localStorage.getItem(key));
      if (validParts(parts)) return parts;
    } catch (error) { /* The workshop also runs without browser storage. */ }
    return example("rc");
  }

  const registry = global.SimModules = global.SimModules || [];
  registry.push({
    id: "circuit-lab", unit: 3, icon: "🔧", title: "Taller de circuitos",
    subtitle: "Construye un circuito, mide sus ramas y observa la respuesta transitoria",
    mount(container) {
      const root = document.createElement("div");
      root.className = "circuit-lab";
      root.innerHTML = `
        <div class="lab-workspace">
        <div class="panel lab-toolbar">
          <div class="lab-tools" aria-label="Herramientas">
            <button class="btn btn-sm" data-tool="select">Seleccionar</button>
            <button class="btn btn-sm btn-danger" data-tool="remove">Quitar</button>
            ${Object.entries(types).map(([type, info]) => `<button class="btn btn-sm" data-tool="${type}">${info.name}</button>`).join("")}
          </div>
          <div class="lab-tools">
            <select class="sim-input" data-example aria-label="Circuito de ejemplo">
              <option value="rc">Carga de capacitor RC</option><option value="series">Resistencias en serie</option>
              <option value="parallel">Resistencias en paralelo</option><option value="mixed">Circuito mixto</option>
              <option value="meters">Amperímetro y voltímetro</option>
              <option value="empty">Circuito vacío</option>
            </select>
            <button class="btn btn-sm" data-load>Cargar</button>
            <button class="btn btn-sm" data-export>Exportar</button>
            <button class="btn btn-sm" data-import>Importar</button>
            <input type="file" accept=".json,application/json" data-file hidden>
          </div>
        </div>
        <div class="sim-grid lab-grid">
          <div class="panel lab-board">
            <div class="lab-board-head">
              <h2>Esquema</h2>
              <div class="lab-tools"><span data-count></span>
                <button type="button" class="btn btn-sm btn-danger" data-delete>Quitar seleccionado</button>
              </div>
            </div>
            <svg class="lab-schematic" viewBox="0 0 ${width} ${height}" tabindex="0" aria-label="Esquema. Usa las flechas para moverte y Enter para elegir un punto."></svg>
            <p class="hint" data-help aria-live="polite"></p>
          </div>
          <aside class="panel controls lab-inspector">
            <div class="lab-board-head"><h2>Componente</h2><span data-name></span></div>
            <label class="control" data-value-row><span data-unit></span><input class="sim-input" type="number" step="any" data-value></label>
            <label class="control" data-initial-row>Voltaje inicial (V)<input class="sim-input" type="number" min="-1000" max="1000" step="any" data-initial></label>
            <label data-switch-row><input type="checkbox" data-switch> Interruptor cerrado</label>
            <div class="btn-row" data-edit-actions>
              <button class="btn btn-sm" data-reverse>Invertir A ↔ B</button>
              <button class="btn btn-sm" data-reconnect="a">Mover A</button>
              <button class="btn btn-sm" data-reconnect="b">Mover B</button>
            </div>
            <div class="lab-measure">
              <h3>Simulación</h3>
              <div class="btn-row">
                <button class="btn btn-primary btn-sm" data-run>▶ Simular</button>
                <button class="btn btn-sm" data-step>Un paso</button>
                <button class="btn btn-sm" data-reset>Reiniciar tiempo</button>
              </div>
              <label class="control">Paso de integración (s)<input class="sim-input" type="number" min="0.000001" max="60" step="any" value="0.01" data-dt></label>
              <p class="hint" data-status role="status"></p>
            </div>
          </aside>
        </div>
        </div>
        <div class="panel lab-results">
          <div class="lab-board-head"><h2>Mediciones por componente</h2><span data-time></span></div>
          <p class="hint">Voltaje = V(A) − V(B). La corriente positiva va de A a B. Una potencia negativa indica que la rama entrega energía.</p>
          <div class="lab-table-scroll"><table><thead><tr><th>Rama</th><th>Valor</th><th>Voltaje</th><th>Corriente</th><th>Potencia</th></tr></thead><tbody></tbody></table></div>
        </div>
        <div class="panel lab-results">
          <div class="lab-board-head"><h2 data-chart-title>Osciloscopio</h2>
            <select class="sim-input" data-metric aria-label="Magnitud del osciloscopio">
              <option value="volts">Voltaje</option><option value="amps">Corriente</option><option value="watts">Potencia</option>
            </select>
          </div>
          <svg class="lab-chart" viewBox="0 0 600 178" role="img" aria-label="Gráfica de la magnitud seleccionada frente al tiempo"></svg>
        </div>`;
      container.appendChild(root);
      const get = (name) => root.querySelector("[data-" + name + "]");
      const board = root.querySelector(".lab-schematic"), table = root.querySelector("tbody");
      const chart = root.querySelector(".lab-chart"), status = get("status");
      let parts = load();
      let nextId = Math.max(0, ...parts.map((part) => part.id)) + 1;
      let selected = parts.find((part) => part.type === "C")?.id ?? parts[0]?.id;
      let tool = "select", anchor = null, reconnect = null, keyboardNode = null;
      let result, previous, time, samples, running = false, error = "", switchChanged = false;
      let raf, lastFrame, budget = 0;
      let tableKey = null;

      const selectedPart = () => parts.find((part) => part.id === selected);
      const name = (part) => part.type + part.id;
      const amount = (value, unit) => value == null ? "—" : fmtSI(value, 3).trimEnd() +
        (value === 0 || Math.abs(value) >= 1 && Math.abs(value) < 1000 ? " " : "") + unit;
      const displayValue = (part) => {
        const info = types[part.type];
        if (info.unit) return Number((part.value / (info.factor || 1)).toPrecision(7)) + " " + info.unit;
        return part.type === "S" ? (part.closed ? "Cerrado" : "Abierto") : "Ideal";
      };

      function drawBoard() {
        const dots = Array.from({ length: columns * rows }, (_, n) => {
          const [x, y] = point(n);
          return `<circle cx="${x}" cy="${y}" r="${n === anchor ? 5 : 2}" class="${n === anchor ? "lab-anchor" : "lab-dot"}"/>`;
        }).join("");
        const shapes = parts.map((part) => {
          const [x1, y1] = point(part.a), [x2, y2] = point(part.b);
          const length = Math.hypot(x2 - x1, y2 - y1), angle = Math.atan2(y2 - y1, x2 - x1);
          const x = (x1 + x2) / 2, y = (y1 + y2) / 2;
          const degrees = angle * 180 / Math.PI;
          const symbol = part.type === "S"
            ? `<path d="M-18 0h6m24 0h6M-12 0L12 ${part.closed ? 0 : -9}"/><circle cx="-12" r="1.7"/><circle cx="12" r="1.7"/>`
            : symbols[part.type] ?? `<path d="M-18 0h3m30 0h3"/><circle r="15"/>
              <text transform="rotate(${-degrees})" y="4" text-anchor="middle">${part.type[0]}</text>`;
          const offset = x < 95 ? 21 : -22;
          const vertical = Math.abs(Math.sin(angle)) > 0.65;
          return `<g data-part="${part.id}" class="lab-part ${part.id === selected ? "chosen" : ""}">
            <path class="lab-hit" d="M${x1} ${y1}L${x2} ${y2}"/>
            <g transform="translate(${x} ${y}) rotate(${degrees})">
              <path d="M${-length / 2} 0H-18M18 0H${length / 2}"/>${symbol}
            </g>
            ${part.type === "W" && part.id !== selected ? "" : `<text x="${x + (vertical ? offset : 0)}" y="${y + (vertical ? 4 : -17)}"
              text-anchor="${vertical ? (offset < 0 ? "end" : "start") : "middle"}">${name(part)} · ${displayValue(part)}</text>`}
          </g>`;
        }).join("");
        const terminals = [...new Set(parts.flatMap((part) => [part.a, part.b]))].map((n) => {
          const [x, y] = point(n);
          return `<circle cx="${x}" cy="${y}" r="3.4" class="lab-terminal"/>`;
        }).join("");
        const part = selectedPart();
        const labels = part ? [part.a, part.b].map((n, i) => {
          const [x, y] = point(n);
          return `<text class="lab-polarity" x="${x + 7}" y="${y - 8}">${i === 0 ? "A" : "B"}</text>`;
        }).join("") : "";
        const cursor = keyboardNode === null ? "" : (() => {
          const [x, y] = point(keyboardNode);
          return `<circle cx="${x}" cy="${y}" r="9" class="lab-cursor"/>`;
        })();
        board.innerHTML = dots + shapes + terminals + labels + cursor;
        get("count").textContent = parts.length + " / " + limit + " componentes";
        board.classList.toggle("is-removing", tool === "remove");
        get("delete").disabled = !part;
        get("delete").textContent = part ? "Quitar " + name(part) : "Quitar seleccionado";
        root.querySelectorAll("[data-tool]").forEach((button) => {
          const active = button.dataset.tool === tool && !reconnect;
          button.classList.toggle("btn-primary", active && tool !== "remove");
          button.setAttribute("aria-pressed", active);
        });
        const instrument = tool === "AM" ? " Coloca el amperímetro ideal en serie."
          : tool === "VM" ? " Coloca el voltímetro ideal en paralelo." : "";
        const help = reconnect ? "Toca el nuevo punto para el terminal " + reconnect.toUpperCase() + "."
          : tool === "remove" ? "Toca un componente o cable para quitarlo. Pulsa Esc para salir de este modo."
          : tool === "select" ? "Elige un componente en el esquema o en la tabla para editarlo o quitarlo."
            : anchor === null ? "Toca el primer punto (A)." + (instrument || " Las ramas se conectan si comparten un terminal.")
              : "Toca el segundo punto (B). Un cruce entre segmentos no crea una unión.";
        if (get("help").textContent !== help) get("help").textContent = help;
      }

      function drawInspector() {
        const part = selectedPart();
        const info = part && types[part.type];
        get("name").textContent = part ? name(part) + " · " + info.name : "Sin selección";
        get("value-row").hidden = !info?.unit;
        get("initial-row").hidden = part?.type !== "C";
        get("switch-row").hidden = part?.type !== "S";
        get("edit-actions").hidden = !part;
        if (info?.unit) {
          get("unit").textContent = "Valor (" + info.unit + ")";
          get("value").min = info.min;
          get("value").max = info.max;
          get("value").value = Number((part.value / (info.factor || 1)).toPrecision(12));
        }
        if (part?.type === "C") get("initial").value = part.initial;
        if (part?.type === "S") get("switch").checked = part.closed;
      }

      function drawMeasurements() {
        get("time").textContent = "t = " + fmt(time, 4) + " s";
        const message = error || (time === 0
          ? "Vista DC. Al simular, cada capacitor parte de su voltaje inicial."
          : switchChanged ? "Conexión modificada. Avanza un paso para actualizar las lecturas." : "Análisis transitorio");
        if (status.textContent !== message) status.textContent = message;
        status.classList.toggle("lab-error", Boolean(error));
        const runLabel = running ? "⏸ Pausar" : "▶ Simular";
        if (get("run").textContent !== runLabel) get("run").textContent = runLabel;
        const nextTableKey = parts.map(name).join(",");
        if (tableKey !== nextTableKey) {
          tableKey = nextTableKey;
          table.innerHTML = parts.length ? parts.map((part) => `
            <tr><td><button type="button" class="lab-row-select" data-part="${part.id}">${name(part)} · ${types[part.type].name}</button></td>
            <td></td><td></td><td></td><td></td></tr>`).join("")
            : '<tr><td colspan="5">Añade un componente o carga un ejemplo.</td></tr>';
        }
        parts.forEach((part, i) => {
          const row = table.rows[i];
          row.classList.toggle("chosen", selected === part.id);
          const data = result?.results.get(part.id);
          const values = [displayValue(part), amount(data?.volts, "V"), amount(data?.amps, "A"), amount(data?.watts, "W")];
          values.forEach((value, j) => {
            if (row.cells[j + 1].textContent !== value) row.cells[j + 1].textContent = value;
          });
        });
      }

      function drawChart() {
        const part = selectedPart();
        const metric = get("metric").value, unit = { volts: "V", amps: "A", watts: "W" }[metric];
        get("chart-title").textContent = "Osciloscopio" + (part ? " · " + name(part) : "");
        const series = samples.filter((sample) => sample[metric] !== null);
        if (series.length < 2) {
          chart.innerHTML = '<text x="300" y="88" text-anchor="middle">Selecciona una rama y simula para ver su evolución.</text>';
          return;
        }
        const first = series[0].time, last = series.at(-1).time;
        const values = series.map((sample) => sample[metric]);
        let min = Math.min(0, ...values), max = Math.max(0, ...values);
        if (max === min) { min -= 1; max += 1; }
        const x = (t) => 86 + 484 * (t - first) / (last - first);
        const y = (v) => 140 - 118 * (v - min) / (max - min);
        const ticks = [min, (min + max) / 2, max].map((v) =>
          `<path class="lab-gridline" d="M86 ${y(v)}H570"/><text x="77" y="${y(v) + 4}" text-anchor="end">${amount(v, unit)}</text>`).join("");
        chart.innerHTML = ticks + `<polyline points="${series.map((p) => x(p.time) + "," + y(p[metric])).join(" ")}"/>
          <text x="86" y="163">${fmt(first, 3)} s</text><text x="570" y="163" text-anchor="end">${fmt(last, 3)} s</text>`;
      }

      function calculate(dt) {
        try {
          result = solveCircuit(parts, { dt, previous });
          if (dt) {
            switchChanged = false;
            const part = selectedPart();
            if (time === 0 && part?.type === "C") {
              samples.push({ time: 0, volts: part.initial, amps: null, watts: null });
            }
            time += dt;
            previous = result.capacitorVoltages;
            const reading = result.results.get(selected);
            if (reading) samples.push({ ...reading, time });
            if (samples.length > 320) samples.splice(0, samples.length - 320);
          }
          error = "";
          return true;
        } catch (failure) {
          result = null;
          error = failure.message;
          running = false;
          return false;
        }
      }

      function reset() {
        time = 0;
        switchChanged = false;
        previous = new Map();
        samples = [];
        running = false;
        budget = 0;
        calculate(0);
        drawMeasurements();
        drawChart();
      }

      function updateCircuit({ redrawInspector = true, restart = true } = {}) {
        try { localStorage.setItem(key, JSON.stringify(parts)); } catch (error) { /* Optional storage. */ }
        drawBoard();
        if (redrawInspector) drawInspector();
        if (restart) reset();
        else {
          if (time === 0) calculate(0);
          drawMeasurements();
        }
      }

      function choose(id) {
        if (selected !== id) {
          selected = id;
          samples = [];
        }
        tool = "select"; anchor = null; reconnect = null;
        drawBoard(); drawInspector(); drawMeasurements(); drawChart();
      }

      function removePart(id) {
        const index = parts.findIndex((part) => part.id === id);
        if (index === -1) return;
        parts.splice(index, 1);
        if (selected === id) selected = parts[Math.min(index, parts.length - 1)]?.id;
        anchor = null;
        reconnect = null;
        updateCircuit();
      }

      root.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => {
        tool = button.dataset.tool;
        anchor = null; reconnect = null;
        drawBoard();
      }));
      function placeTerminal(terminal) {
        const part = selectedPart();
        if (reconnect && part) {
          if (terminal !== part[reconnect === "a" ? "b" : "a"]) part[reconnect] = terminal;
          reconnect = null;
        } else if (parts.length >= limit) {
          get("help").textContent = "Se alcanzó el límite. Elimina un componente para añadir otro.";
          return;
        } else if (anchor === null || anchor === terminal) {
          anchor = anchor === terminal ? null : terminal;
          drawBoard();
          return;
        } else {
          const info = types[tool];
          if (!Number.isSafeInteger(nextId)) nextId = 1;
          while (parts.some((part) => part.id === nextId)) nextId++;
          parts.push({ id: nextId++, type: tool, a: anchor, b: terminal,
            value: (info.value ?? 0) * (info.factor || 1), initial: 0, closed: true });
          selected = parts.at(-1).id;
          anchor = null;
        }
        updateCircuit();
      }
      board.addEventListener("click", (event) => {
        keyboardNode = null;
        if (tool === "remove" || (tool === "select" && !reconnect)) {
          const hit = event.target.closest("[data-part]");
          if (hit) {
            const id = Number(hit.dataset.part);
            if (tool === "remove") removePart(id);
            else choose(id);
          }
          return;
        }
        const transform = board.getScreenCTM();
        if (!transform) return;
        const { x, y } = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
        const col = Math.round((x - inset) / gap), row = Math.round((y - inset) / gap);
        if (col >= 0 && col < columns && row >= 0 && row < rows) placeTerminal(node(col, row));
      });
      board.addEventListener("keydown", (event) => {
        if (tool === "remove" || (tool === "select" && !reconnect)) return;
        const offsets = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
        if (Object.hasOwn(offsets, event.key)) {
          const [dx, dy] = offsets[event.key];
          const origin = keyboardNode ?? anchor ?? node(6, 4);
          const x = Math.max(0, Math.min(columns - 1, origin % columns + dx));
          const y = Math.max(0, Math.min(rows - 1, Math.floor(origin / columns) + dy));
          keyboardNode = node(x, y);
          drawBoard();
        } else if (event.key === "Enter" || event.key === " ") {
          placeTerminal(keyboardNode ?? node(6, 4));
        } else return;
        event.preventDefault();
      });
      table.addEventListener("click", (event) => {
        const button = event.target.closest("[data-part]");
        if (button) {
          choose(Number(button.dataset.part));
          table.querySelector(`[data-part="${selected}"]`)?.focus();
        }
      });
      root.querySelectorAll("[data-reconnect]").forEach((button) => button.addEventListener("click", () => {
        tool = "select"; anchor = null; reconnect = button.dataset.reconnect;
        drawBoard();
      }));
      root.addEventListener("keydown", (event) => {
        if (event.key === "Escape") choose(selected);
        if (event.key === "Delete" && (event.target === board || table.contains(event.target)) && selectedPart()) {
          event.preventDefault();
          removePart(selected);
          board.focus();
        }
      });
      get("reverse").addEventListener("click", () => {
        const part = selectedPart();
        [part.a, part.b] = [part.b, part.a];
        updateCircuit();
      });
      get("delete").addEventListener("click", () => removePart(selected));
      for (const field of ["value", "initial"]) {
        get(field).addEventListener("change", (event) => {
          const input = event.currentTarget, part = selectedPart();
          if (!input.validity.valid || !Number.isFinite(input.valueAsNumber)) { drawInspector(); return; }
          part[field] = input.valueAsNumber * (field === "value" ? types[part.type].factor || 1 : 1);
          updateCircuit({ redrawInspector: false });
        });
      }
      get("switch").addEventListener("change", (event) => {
        selectedPart().closed = event.currentTarget.checked;
        switchChanged = time > 0;
        updateCircuit({ restart: false, redrawInspector: false });
      });
      function replaceParts(replacement) {
        parts = replacement;
        nextId = Math.max(0, ...parts.map((part) => part.id)) + 1;
        selected = parts.find((part) => part.type === "C")?.id ?? parts[0]?.id;
        tool = "select"; anchor = null; reconnect = null; keyboardNode = null;
        updateCircuit();
      }
      const clearRealCase = addRealCases(root.querySelector(".lab-inspector"), "circuit-lab", ({ circuit }) => {
        get("dt").value = 0.001;
        get("metric").value = "volts";
        replaceParts(example(circuit));
      }, false);
      get("load").addEventListener("click", () => {
        const chosen = get("example").value;
        replaceParts(chosen === "empty" ? [] : example(chosen));
        clearRealCase();
      });
      get("export").addEventListener("click", () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, parts }, null, 2)], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "circuito-electrosim.json";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      get("import").addEventListener("click", () => get("file").click());
      get("file").addEventListener("change", async (event) => {
        const input = event.currentTarget, file = input.files[0];
        input.value = "";
        if (!file) return;
        try {
          if (file.size > 64 * 1024) throw new Error();
          const data = JSON.parse(await file.text());
          if (data?.version !== 1 || !validParts(data.parts)) throw new Error();
          replaceParts(data.parts);
          clearRealCase();
        } catch (failure) {
          get("help").textContent = "No se pudo abrir el archivo. Selecciona un circuito exportado desde ElectroSim.";
        }
      });
      function stepSize() {
        const input = get("dt");
        if (input.validity.valid && input.valueAsNumber > 0) return input.valueAsNumber;
        input.reportValidity();
        return 0;
      }
      get("dt").required = true;
      get("run").addEventListener("click", () => {
        running = !running && parts.length > 0 && Boolean(stepSize());
        budget = 0;
        drawMeasurements();
      });
      get("step").addEventListener("click", () => {
        running = false;
        const dt = stepSize();
        if (dt && parts.length) calculate(dt);
        drawMeasurements();
        drawChart();
      });
      get("reset").addEventListener("click", reset);
      get("metric").addEventListener("change", drawChart);

      function frame(now) {
        if (running) {
          const dt = stepSize();
          if (!dt) running = false;
          budget = Math.min(budget + Math.min((now - (lastFrame ?? now)) / 1000, 0.15), dt * 24);
          let updated = false;
          while (running && budget >= dt) {
            budget -= dt;
            updated = true;
            calculate(dt);
          }
          if (updated || !running) { drawMeasurements(); drawChart(); }
        }
        lastFrame = now;
        raf = requestAnimationFrame(frame);
      }

      drawBoard();
      drawInspector();
      reset();
      raf = requestAnimationFrame(frame);
      return () => { cancelAnimationFrame(raf); root.remove(); };
    },
  });
})(window);
