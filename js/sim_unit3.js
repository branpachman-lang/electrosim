/* ============================================================
   ElectroSim — Unidad 3: Corriente Eléctrica y Ley de Ohm
   Modules: circuit simulator, Ohm's law visualizer
   ============================================================ */
(function (global) {
  "use strict";
  const registry = global.SimModules = global.SimModules || [];

  function drawWire(ctx, points, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(...points[0]);
    for (const point of points.slice(1)) ctx.lineTo(...point);
    ctx.stroke();
  }

  function drawResistor(ctx, palette, x1, y1, x2, y2, label) {
    const x = (x1 + x2) / 2, y = (y1 + y2) / 2;
    const horizontal = y1 === y2;
    const w = horizontal ? 70 : 25, h = horizontal ? 27 : 59;
    const leads = horizontal
      ? [[[x1, y], [x - w / 2, y]], [[x + w / 2, y], [x2, y]]]
      : [[[x, y1], [x, y - h / 2]], [[x, y + h / 2], [x, y2]]];
    for (const lead of leads) drawWire(ctx, lead, palette.ink);
    ctx.fillStyle = palette.surface;
    ctx.strokeStyle = palette.ink;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 5);
    ctx.fill();
    ctx.stroke();
    text(ctx, label, horizontal ? x : x + 20, y + 4, palette.ink, horizontal ? "center" : "left");
  }

  function drawBattery(ctx, palette, x, top, bottom, voltage) {
    const y = (top + bottom) / 2;
    drawWire(ctx, [[x, top], [x, y - 5]], palette.ink);
    drawWire(ctx, [[x, y + 5], [x, bottom]], palette.ink);
    drawWire(ctx, [[x - 15, y - 5], [x + 15, y - 5]], palette.ink);
    drawWire(ctx, [[x - 8, y + 5], [x + 8, y + 5]], palette.ink);
    text(ctx, "+", x - 18, y - 7, palette.ink, "right");
    text(ctx, "−", x - 18, y + 15, palette.ink, "right");
    text(ctx, voltage + " V", x + 24, y + 5, palette.ink, "left");
  }

  function text(ctx, value, x, y, color, align = "center") {
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(value, x, y);
  }

  function fit(ctx, x, y, width, height, designWidth, designHeight) {
    const scale = Math.min(width / designWidth, height / designHeight);
    ctx.translate(x + (width - scale * designWidth) / 2, y + (height - scale * designHeight) / 2);
    ctx.scale(scale, scale);
  }

  const quantity = (value, unit, precision = 2) => {
    const number = fmtSI(value, precision);
    return number.endsWith(" ") || value === 0 ? number.trimEnd() + " " + unit : number + unit;
  };

  function pointAlong(path, f) {
    let total = 0, segs = [];
    for (let i = 0; i < path.length - 1; i++) { const d = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); segs.push(d); total += d; }
    let target = f * total;
    for (let i = 0; i < segs.length; i++) {
      if (target <= segs[i]) { const r = segs[i] === 0 ? 0 : target / segs[i]; return [path[i][0] + (path[i + 1][0] - path[i][0]) * r, path[i][1] + (path[i + 1][1] - path[i][1]) * r]; }
      target -= segs[i];
    }
    return path[path.length - 1];
  }
  function animateCurrent(ctx, paths, I, time) {
    if (I <= 1e-9) return;
    const speed = 0.02 * Math.log10(Math.abs(I) * 1e3 + 2);
    const n = 5;
    for (const path of paths) {
      for (let k = 0; k < n; k++) {
        const f = ((time * speed + k / n) % 1 + 1) % 1;
        const p = pointAlong(path, f);
        ctx.fillStyle = "#e5484d";
        ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  /* ---------- Module: simulador de circuitos ---------- */
  registry.push({
    id: "circuits",
    unit: 3,
    icon: "🔌",
    title: "Simulador de circuitos",
    subtitle: "Resistencias en serie, paralelo y mixto",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      let mode = "series";
      let Vsrc = 12, R1 = 100, R2 = 220, R3 = 330;

      const handle = buildControls(controls, [
        { type: "segmented", key: "mode", label: "Topología", group: "Circuito", value: 0,
          options: [{ label: "Serie", value: "series" }, { label: "Paralelo", value: "parallel" }, { label: "Mixto", value: "mixed" }],
          onChange: (v) => { mode = v; } },
        { type: "slider", key: "V", label: "Fuente de voltaje (V)", group: "none",
          min: 1, max: 48, step: 0.5, value: 12, format: (v) => v.toFixed(1), onChange: (v) => { Vsrc = v; } },
        { type: "slider", key: "R1", label: "R1 (Ω)", group: "Resistencias",
          min: 10, max: 1000, step: 10, value: 100, format: (v) => v.toFixed(0), onChange: (v) => { R1 = v; } },
        { type: "slider", key: "R2", label: "R2 (Ω)", group: "none",
          min: 10, max: 1000, step: 10, value: 220, format: (v) => v.toFixed(0), onChange: (v) => { R2 = v; } },
        { type: "slider", key: "R3", label: "R3 (Ω)", group: "none",
          min: 10, max: 1000, step: 10, value: 330, format: (v) => v.toFixed(0), onChange: (v) => { R3 = v; } },
        { type: "readouts", key: "ro", group: "Circuito equivalente", readouts: [
          { label: "R equivalente", key: "Req", unit: "Ω" },
          { label: "Corriente total", key: "It", unit: "A" },
          { label: "Potencia total", key: "Pt", unit: "W" },
          { label: "V en R1", key: "V1", unit: "V" },
          { label: "V en R2", key: "V2", unit: "V" },
          { label: "V en R3", key: "V3", unit: "V" },
          { label: "I en R1", key: "I1", unit: "A" },
          { label: "I en R2", key: "I2", unit: "A" },
          { label: "I en R3", key: "I3", unit: "A" },
        ] },
        { type: "formula", group: "Fundamento", html: "Serie: R = R₁+R₂+R₃<br/>Paralelo: 1/R = 1/R₁+1/R₂+1/R₃<br/><span data-current-law></span>" },
      ]);
      const relation = controls.querySelector("[data-current-law]");

      const cv = createCanvas(stage);
      cv.canvas.setAttribute("aria-label", "Esquema eléctrico con fuente y tres resistencias");
      let t = 0;

      addRealCases(controls, "circuits", (values) => {
        mode = values.mode; Vsrc = values.V;
        R1 = values.R1; R2 = values.R2; R3 = values.R3;
        for (const [key, value] of Object.entries(values)) handle[key].value = value;
      });
      function solve() {
        if (mode === "series") {
          const Req = R1 + R2 + R3, It = Vsrc / Req;
          return { Req, It, Pt: It * It * Req, V1: It * R1, V2: It * R2, V3: It * R3, I1: It, I2: It, I3: It };
        } else if (mode === "parallel") {
          const Req = 1 / (1 / R1 + 1 / R2 + 1 / R3), It = Vsrc / Req;
          return { Req, It, Pt: Vsrc * It, V1: Vsrc, V2: Vsrc, V3: Vsrc, I1: Vsrc / R1, I2: Vsrc / R2, I3: Vsrc / R3 };
        } else {
          const Rp = (R2 * R3) / (R2 + R3), Req = R1 + Rp, It = Vsrc / Req;
          const V1 = It * R1, V23 = Vsrc - V1;
          return { Req, It, Pt: Vsrc * It, V1, V2: V23, V3: V23, I1: It, I2: V23 / R2, I3: V23 / R3 };
        }
      }

      function render() {
        const ctx = cv.ctx;
        const W = cv.cssW, H = cv.cssH;
        ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const s = solve(), palette = canvasPalette(stage);
        const left = 76, right = 508, top = 83, bottom = 253;
        t += 0.02;
        ctx.save();
        fit(ctx, 0, 0, W, H, 600, 312);
        text(ctx, "Conexión " + { series: "en serie", parallel: "en paralelo", mixed: "mixta" }[mode], 300, 31, palette.ink);
        drawBattery(ctx, palette, left, top, bottom, Vsrc);
        drawWire(ctx, [[left, bottom], [right, bottom]], palette.ink);
        if (mode === "series") {
          const parts = [R1, R2, R3], drops = [s.V1, s.V2, s.V3];
          for (let i = 0; i < parts.length; i++) {
            const a = left + (right - left) * i / 3;
            const b = left + (right - left) * (i + 1) / 3;
            drawResistor(ctx, palette, a, top, b, top, parts[i] + " Ω");
            text(ctx, "R" + (i + 1) + " · " + quantity(drops[i], "V"), (a + b) / 2, top + 42, palette.muted);
          }
          drawWire(ctx, [[right, top], [right, bottom]], palette.ink);
          animateCurrent(ctx, [[[right, top + 16], [right, bottom], [left + 8, bottom]]], s.It, t);
        } else {
          const seriesEnd = 278;
          if (mode === "mixed") {
            drawResistor(ctx, palette, left, top, seriesEnd, top, R1 + " Ω");
            drawWire(ctx, [[seriesEnd, top], [right, top]], palette.ink);
            text(ctx, "R1 · " + quantity(s.V1, "V"), (left + seriesEnd) / 2, top - 25, palette.muted);
          } else {
            drawWire(ctx, [[left, top], [right, top]], palette.ink);
          }
          const branches = mode === "parallel"
            ? [[205, 1, R1, s.I1], [357, 2, R2, s.I2], [right, 3, R3, s.I3]]
            : [[335, 2, R2, s.I2], [right, 3, R3, s.I3]];
          for (const [x, id, resistance, current] of branches) {
            drawResistor(ctx, palette, x, top, x, bottom, resistance + " Ω");
            text(ctx, "R" + id, x, top - 16, palette.muted);
            text(ctx, quantity(current, "A"), x + 16, top + 34, palette.muted, "left");
            for (const y of [top, bottom]) {
              ctx.fillStyle = palette.ink;
              ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();
            }
            animateCurrent(ctx, [[[x, top + 4], [x, (top + bottom) / 2 - 34]]], current, t);
          }
        }
        text(ctx, "Corriente total · " + quantity(s.It, "A"), 300, 291, palette.muted);
        ctx.restore();

        const balance = mode === "series" ? "I₁ = I₂ = I₃"
          : mode === "parallel" ? "I total = I₁ + I₂ + I₃" : "I₁ = I₂ + I₃";
        setReadout(handle.ro.I1, fmtSI(s.I1, 2));
        setReadout(handle.ro.I2, fmtSI(s.I2, 2));
        setReadout(handle.ro.I3, fmtSI(s.I3, 2));
        relation.textContent = balance;

        setReadout(handle.ro.Req, fmtSI(s.Req, 1));
        setReadout(handle.ro.It, fmtSI(s.It, 2));
        setReadout(handle.ro.Pt, fmtSI(s.Pt, 2));
        setReadout(handle.ro.V1, fmtSI(s.V1, 1));
        setReadout(handle.ro.V2, fmtSI(s.V2, 1));
        setReadout(handle.ro.V3, fmtSI(s.V3, 1));
      }

      let raf;
      function loop() { render(); raf = requestAnimationFrame(loop); }
      loop();
      window.addEventListener("resize", cv.resize);

      return function cleanup() { cancelAnimationFrame(raf); window.removeEventListener("resize", cv.resize); cv.destroy(); root.remove(); };
    },
  });

  /* ---------- Module: visualizador de ley de Ohm ---------- */
  registry.push({
    id: "ohm",
    unit: 3,
    icon: "📈",
    title: "Visualizador de la ley de Ohm",
    subtitle: "Relación entre V, I y R en tiempo real",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      let Vv = 12, R = 120, internal = 0;

      const handle = buildControls(controls, [
        { type: "slider", key: "V", label: "Fuerza electromotriz ε (V)", group: "Parámetros",
          min: 0, max: 24, step: 0.5, value: 12, format: (v) => v.toFixed(1), onChange: (v) => { Vv = v; } },
        { type: "slider", key: "R", label: "Resistencia R (Ω)", group: "none",
          min: 10, max: 1000, step: 5, value: 120, format: (v) => v.toFixed(0), onChange: (v) => { R = v; } },
        { type: "slider", key: "r", label: "Resistencia interna r (Ω)", group: "none",
          min: 0, max: 100, step: 0.1, value: 0, onChange: (v) => { internal = v; } },
        { type: "readouts", key: "ro", group: "Resultados", readouts: [
          { label: "Corriente I", key: "I", unit: "A" },
          { label: "Voltaje en R", key: "terminal", unit: "V" },
          { label: "Potencia en R", key: "P", unit: "W" },
          { label: "Pérdida interna", key: "loss", unit: "W" },
          { label: "Conductancia G = 1/R", key: "G", unit: "S" },
        ] },
        { type: "formula", group: "Fundamento", html: "I = ε/(R + r)<br/>V en R = ε − Ir<br/>P en R = I²R &nbsp;·&nbsp; P interna = I²r" },
        { type: "hint", group: "none", text: "Con r = 0 la fuente es ideal. Al aumentar r, baja el voltaje en R. La pendiente de la recta I–V es 1/R." },
      ]);

      const cv = createCanvas(stage);
      cv.canvas.setAttribute("aria-label", "Circuito de corriente directa y gráfica de corriente frente al voltaje");
      let t = 0;

      addRealCases(controls, "ohm", (values) => {
        Vv = values.V; R = values.R; internal = values.r;
        handle.V.value = Vv; handle.R.value = R; handle.r.value = internal;
      });
      function render() {
        const ctx = cv.ctx;
        const W = cv.cssW, H = cv.cssH;
        ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const { current: I, terminal, power: P, loss } = sourceWithResistance(Vv, R, internal);
        const palette = canvasPalette(stage);
        const stacked = W < 700;
        t += 0.02;

        ctx.save();
        fit(ctx, 0, 0, stacked ? W : W * 0.44, stacked ? H * 0.46 : H, 325, 224);
        text(ctx, "Circuito de corriente directa", 162, 25, palette.ink);
        drawBattery(ctx, palette, 59, 59, 171, Vv);
        drawResistor(ctx, palette, 59, 59, 258, 59, "R · " + R + " Ω");
        drawWire(ctx, [[258, 59], [258, 171], [59, 171]], palette.ink);
        if (internal > 0) {
          drawResistor(ctx, palette, 59, 171, 258, 171, "r · " + internal + " Ω");
        }
        animateCurrent(ctx, [[[258, 65], [258, 165]]], I, t);
        text(ctx, "I = " + quantity(I, "A"), 165, 210, palette.muted);
        ctx.restore();

        ctx.save();
        fit(ctx, stacked ? 0 : W * 0.44, stacked ? H * 0.46 : 0,
          stacked ? W : W * 0.56, stacked ? H * 0.54 : H, 346, 240);
        const gx = 71, gy = 183, gw = 246, gh = 110;
        const voltageMax = 24;
        const currentMax = Math.max(voltageMax / R, voltageMax / 120);
        const milliampScale = currentMax < 1;
        const xForV = (v) => gx + v / voltageMax * gw;
        const yForI = (i) => gy - i / currentMax * gh;
        text(ctx, "Corriente frente al voltaje en R", 173, 23, palette.ink);
        text(ctx, quantity(terminal, "V") + " · " + quantity(I, "A"), 173, 49, palette.muted);
        for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
          const x = xForV(fraction * voltageMax), y = yForI(fraction * currentMax);
          drawWire(ctx, [[x, gy], [x, gy - gh]], palette.grid);
          drawWire(ctx, [[gx, y], [gx + gw, y]], palette.grid);
          text(ctx, fraction * voltageMax, x, gy + 21, palette.muted);
          const tick = fraction * currentMax * (milliampScale ? 1000 : 1);
          text(ctx, Number(tick.toPrecision(3)), gx - 8, y + 5, palette.muted, "right");
        }
        drawWire(ctx, [[gx, gy - gh], [gx, gy], [gx + gw, gy]], palette.ink);
        drawWire(ctx, [[gx, gy], [gx + gw, yForI(voltageMax / R)]], palette.accent);
        const opx = xForV(terminal), opy = yForI(I);
        ctx.setLineDash([4, 4]);
        drawWire(ctx, [[gx, opy], [opx, opy], [opx, gy]], palette.muted);
        ctx.setLineDash([]);
        ctx.fillStyle = palette.current;
        ctx.strokeStyle = palette.surface;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(opx, opy, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        text(ctx, milliampScale ? "I (mA)" : "I (A)", gx, gy - gh - 13, palette.ink);
        text(ctx, "V en R (V)", gx + gw / 2, 229, palette.ink);
        ctx.restore();

        setReadout(handle.ro.terminal, fmtSI(terminal, 2));
        setReadout(handle.ro.loss, fmtSI(loss, 2));
        setReadout(handle.ro.I, fmtSI(I, 2));
        setReadout(handle.ro.P, fmtSI(P, 2));
        setReadout(handle.ro.G, fmtSI(1 / R, 3));
      }

      let raf;
      function loop() { render(); raf = requestAnimationFrame(loop); }
      loop();
      window.addEventListener("resize", cv.resize);

      return function cleanup() { cancelAnimationFrame(raf); window.removeEventListener("resize", cv.resize); cv.destroy(); root.remove(); };
    },
  });
})(window);
