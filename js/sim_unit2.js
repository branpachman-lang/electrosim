/* ============================================================
   ElectroSim — Unidad 2: Capacitores y Dieléctricos
   Modules: capacitor simulator, stored-energy calculator
   ============================================================ */
(function (global) {
  "use strict";
  const registry = global.SimModules = global.SimModules || [];

  const POS = "#e5484d";
  const NEG = "#3b6ef6";

  /* ---------- Module: simulador de capacitores ---------- */
  registry.push({
    id: "capacitor",
    unit: 2,
    icon: "🔋",
    title: "Simulador de capacitores",
    subtitle: "Capacitancia vs. área, distancia y dieléctrico",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      let A = 0.1;      // m²
      let d = 2;        // mm
      let er = 1;       // dielectric constant
      let Vv = 12;      // volts
      let isolatedCharge = null;
      const measure = () => plateCapacitor(A, d * 1e-3, er, Vv, isolatedCharge);

      const handle = buildControls(controls, [
        { type: "segmented", key: "connection", label: "Conexión con la batería", group: "Parámetros",
          options: [{ label: "Conectado", value: true }, { label: "Aislado", value: false }],
          onChange: (connected) => {
            isolatedCharge = connected ? null : measure().charge;
            handle.V.element.hidden = !connected;
          } },
        { type: "slider", key: "A", label: "Área de placas (m²)", group: "none",
          min: 0.01, max: 1, step: 0.01, value: 0.1, format: (v) => v.toFixed(2), onChange: (v) => { A = v; } },
        { type: "slider", key: "d", label: "Separación d (mm)", group: "none",
          min: 0.5, max: 10, step: 0.1, value: 2, format: (v) => v.toFixed(1), onChange: (v) => { d = v; } },
        { type: "slider", key: "er", label: "Constante dieléctrica εᵣ", group: "none",
          min: 1, max: 100, step: 1, value: 1, format: (v) => v.toFixed(0), onChange: (v) => { er = v; } },
        { type: "slider", key: "V", label: "Voltaje aplicado (V)", group: "none",
          min: 0, max: 100, step: 0.5, value: 12, format: (v) => v.toFixed(1), onChange: (v) => { Vv = v; } },
        { type: "readouts", key: "ro", group: "Resultados", readouts: [
          { label: "Capacitancia C", key: "C", unit: "F" },
          { label: "Carga Q = CV", key: "Q", unit: "C" },
          { label: "Voltaje entre placas", key: "voltage", unit: "V" },
          { label: "Campo E = V/d", key: "E", unit: "V/m" },
          { label: "Energía U", key: "U", unit: "J" },
          { label: "Densidad de energía", key: "density", unit: "J/m³" },
        ] },
        { type: "formula", group: "Fundamento", html: "C = ε₀·εᵣ·A / d<br/>Q = C·V &nbsp;·&nbsp; U = ½·C·V²" },
        { type: "hint", group: "none", text: "Sube εᵣ con la batería conectada y observa Q. Vuelve a εᵣ = 1, aísla el capacitor y repite: la carga queda fija y cambia el voltaje." },
      ]);

      const cv = createCanvas(stage);

      addRealCases(controls, "capacitor", (values) => {
        A = values.A; d = values.d; er = values.er; Vv = values.V;
        isolatedCharge = null;
        handle.connection.value = true;
        handle.V.element.hidden = false;
        for (const [key, value] of Object.entries(values)) handle[key].value = value;
      });
      function render() {
        const ctx = cv.ctx;
        const W = cv.cssW, H = cv.cssH;
        const palette = canvasPalette(stage);
        const { capacitance, charge, voltage, energy, field, density } = measure();
        ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        // mapping
        const plateH = Math.min(H * 0.8, 40 + A * 260); // area -> height
        const gap = Math.min(W * 0.6, 20 + d * 26);     // d (mm) -> gap px
        const cx = W / 2;
        const cy = H / 2;
        ctx.fillStyle = palette.ink;
        ctx.font = "600 14px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(isolatedCharge === null ? "Conectado · voltaje fijo" : "Aislado · carga fija", cx, 26);

        // dielectric material between plates
        const dielW = gap;
        ctx.fillStyle = er > 1 ? "rgba(124,91,255,0.18)" : "rgba(128,140,155,0.06)";
        ctx.fillRect(cx - gap / 2, cy - plateH / 2 - 20, dielW, plateH + 40);

        // plates
        const plateW = 14;
        const grad1 = ctx.createLinearGradient(cx - gap / 2 - plateW, 0, cx - gap / 2, 0);
        grad1.addColorStop(0, "#b02a30"); grad1.addColorStop(1, "#e5484d");
        ctx.fillStyle = grad1;
        ctx.fillRect(cx - gap / 2 - plateW, cy - plateH / 2, plateW, plateH);

        const grad2 = ctx.createLinearGradient(cx + gap / 2, 0, cx + gap / 2 + plateW, 0);
        grad2.addColorStop(0, "#2b4fbf"); grad2.addColorStop(1, "#3b6ef6");
        ctx.fillStyle = grad2;
        ctx.fillRect(cx + gap / 2, cy - plateH / 2, plateW, plateH);

        // plate labels
        ctx.fillStyle = POS;
        ctx.font = "700 15px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(voltage > 0 ? "+" : "0", cx - gap / 2 - plateW / 2, cy - plateH / 2 - 12);
        ctx.fillStyle = NEG;
        ctx.fillText(voltage > 0 ? "−" : "0", cx + gap / 2 + plateW / 2, cy - plateH / 2 - 12);

        // electric field arrows (uniform) between plates
        const nArrows = Math.max(2, Math.floor(plateH / 46));
        ctx.strokeStyle = "rgba(120,140,170,0.8)";
        ctx.fillStyle = "rgba(120,140,170,0.8)";
        ctx.lineWidth = 1.6;
        const arrowLen = gap * 0.7;
        for (let i = 0; voltage > 0 && i < nArrows; i++) {
          const ay = cy - plateH / 2 + plateH * (i + 1) / (nArrows + 1);
          const ax0 = cx - gap / 2 + 4;
          ctx.beginPath();
          ctx.moveTo(ax0, ay);
          ctx.lineTo(ax0 + arrowLen, ay);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ax0 + arrowLen, ay);
          ctx.lineTo(ax0 + arrowLen - 6, ay - 3.4);
          ctx.lineTo(ax0 + arrowLen - 6, ay + 3.4);
          ctx.closePath();
          ctx.fill();
        }

        // dimension labels below plates (no overlap)
        ctx.font = "500 12px JetBrains Mono, monospace";
        ctx.textAlign = "center";
        const dY = cy + plateH / 2 + 22;
        // d dimension line with arrowheads
        ctx.strokeStyle = palette.muted;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(cx - gap / 2, dY);
        ctx.lineTo(cx + gap / 2, dY);
        ctx.stroke();
        ctx.fillStyle = palette.muted;
        ctx.beginPath();
        ctx.moveTo(cx - gap / 2, dY); ctx.lineTo(cx - gap / 2 + 7, dY - 3.5); ctx.lineTo(cx - gap / 2 + 7, dY + 3.5); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx + gap / 2, dY); ctx.lineTo(cx + gap / 2 - 7, dY - 3.5); ctx.lineTo(cx + gap / 2 - 7, dY + 3.5); ctx.closePath(); ctx.fill();
        ctx.fillText("d = " + d.toFixed(1) + " mm", cx, dY + 15);
        ctx.fillText("A = " + A.toFixed(2) + " m²   ·   εᵣ = " + er, cx, dY + 32);

        // results
        setReadout(handle.ro.C, fmtSI(capacitance, 2));
        setReadout(handle.ro.Q, fmtSI(charge, 2));
        setReadout(handle.ro.voltage, fmtSI(voltage, 2));
        setReadout(handle.ro.E, fmtSI(field, 1));
        setReadout(handle.ro.U, fmtSI(energy, 2));
        setReadout(handle.ro.density, fmtSI(density, 2));
      }

      let raf;
      function loop() { render(); raf = requestAnimationFrame(loop); }
      loop();
      window.addEventListener("resize", cv.resize);

      return function cleanup() { cancelAnimationFrame(raf); window.removeEventListener("resize", cv.resize); cv.destroy(); root.remove(); };
    },
  });

  /* ---------- Module: calculadora de energía almacenada ---------- */
  registry.push({
    id: "energy",
    unit: 2,
    icon: "⚡",
    title: "Calculadora de energía almacenada",
    subtitle: "Energía de un capacitor en función de V y C",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      let C = 0.0001; // µF
      let Vv = 12;   // V

      const handle = buildControls(controls, [
        { type: "slider", key: "C", label: "Capacitancia C", group: "Parámetros",
          min: 1e-6, max: 1000, log: true, value: 0.0001,
          format: (v) => fmtSI(v * 1e-6, 2).trimEnd() + "F", onChange: (v) => { C = v; } },
        { type: "slider", key: "V", label: "Voltaje V (V)", group: "none",
          min: 0, max: 500, step: 1, value: 12, format: (v) => v.toFixed(0), onChange: (v) => { Vv = v; } },
        { type: "readouts", key: "ro", group: "Resultados", readouts: [
          { label: "Carga Q = CV", key: "Q", unit: "C" },
          { label: "Energía U = ½CV²", key: "U", unit: "J" },
          { label: "Verificación ½QV", key: "check", unit: "J" },
        ] },
        { type: "formula", group: "Fundamento", html: "U = ½·C·V² = ½·Q·V = Q²/(2C)" },
      ]);

      const cv = createCanvas(stage);

      addRealCases(controls, "energy", (values) => {
        C = values.C; Vv = values.V;
        handle.C.value = C; handle.V.value = Vv;
      });
      function render() {
        const ctx = cv.ctx;
        const W = cv.cssW, H = cv.cssH;
        const palette = canvasPalette(stage);
        ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        const C_F = C * 1e-6;
        const Q = C_F * Vv;
        const U = 0.5 * C_F * Vv * Vv;

        // capacitor symbol + charge gauge
        const cx = W / 2;
        const cy = H / 2 - 40;
        // plates
        ctx.strokeStyle = palette.ink;
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(cx - 60, cy - 80); ctx.lineTo(cx - 60, cy + 80); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 60, cy - 80); ctx.lineTo(cx + 60, cy + 80); ctx.stroke();
        // leads
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(cx - 60, cy - 80); ctx.lineTo(cx - 120, cy - 80); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + 60, cy - 80); ctx.lineTo(cx + 120, cy - 80); ctx.stroke();
        // charge glow between plates
        const fill = Math.min(1, Vv / 500);
        ctx.fillStyle = `rgba(59,110,246,${0.12 + 0.3 * fill})`;
        ctx.fillRect(cx - 58, cy - 76, 116, 152);
        // voltage label
        ctx.fillStyle = palette.ink;
        ctx.font = "700 15px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("+", cx - 95, cy - 86);
        ctx.fillText("−", cx + 95, cy - 86);

        // energy bar
        const barY = cy + 140;
        const barW = Math.min(W - 120, 460);
        const bx = (W - barW) / 2;
        ctx.strokeStyle = palette.grid;
        ctx.lineWidth = 2;
        ctx.fillStyle = palette.surface;
        ctx.beginPath();
        ctx.roundRect(bx, barY, barW, 26, 8);
        ctx.fill(); ctx.stroke();
        const maxU = 0.5 * (1000e-6) * (500 * 500);
        const frac = Math.min(1, U / maxU);
        const grad = ctx.createLinearGradient(bx, 0, bx + barW, 0);
        grad.addColorStop(0, "#3b6ef6"); grad.addColorStop(1, "#7c5bff");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(bx + 2, barY + 2, (barW - 4) * frac, 22, 6);
        ctx.fill();

        ctx.fillStyle = palette.muted;
        ctx.font = "600 12.5px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Energía almacenada · escala 0–125 J", cx, barY - 12);

        setReadout(handle.ro.Q, fmtSI(Q, 2));
        setReadout(handle.ro.U, fmtSI(U, 2));
        setReadout(handle.ro.check, fmtSI(0.5 * Q * Vv, 2));
      }

      let raf;
      function loop() { render(); raf = requestAnimationFrame(loop); }
      loop();
      window.addEventListener("resize", cv.resize);

      return function cleanup() { cancelAnimationFrame(raf); window.removeEventListener("resize", cv.resize); cv.destroy(); root.remove(); };
    },
  });

  registry.push({
    id: "capacitor-pair",
    unit: 2,
    icon: "🔀",
    title: "Capacitores en serie y paralelo",
    subtitle: "Compara la carga, el voltaje y la capacitancia equivalente",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const diagram = document.createElement("div");
      diagram.className = "panel capacitor-diagram";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(diagram, controls);
      container.appendChild(root);

      let c1 = 6, c2 = 3, voltage = 18, series = true;
      const handle = buildControls(controls, [
        { type: "segmented", key: "mode", label: "Conexión", group: "Circuito",
          options: [{ label: "Serie", value: true }, { label: "Paralelo", value: false }],
          onChange: (value) => { series = value; render(); } },
        { type: "slider", key: "c1", label: "Capacitor C₁ (µF)", group: "none", min: 1, max: 24, step: 0.5, value: 6,
          onChange: (value) => { c1 = value; render(); } },
        { type: "slider", key: "c2", label: "Capacitor C₂ (µF)", group: "none", min: 1, max: 24, step: 0.5, value: 3,
          onChange: (value) => { c2 = value; render(); } },
        { type: "slider", key: "voltage", label: "Fuente (V)", group: "none", min: 0, max: 24, step: 0.5, value: 18,
          onChange: (value) => { voltage = value; render(); } },
        { type: "readouts", key: "ro", group: "Resultados", readouts: [
          { label: "Capacitancia equivalente", key: "eq", unit: "µF" },
          { label: "Energía total", key: "energy", unit: "µJ" },
          { label: "Voltaje V₁", key: "v1", unit: "V" },
          { label: "Voltaje V₂", key: "v2", unit: "V" },
          { label: "Carga Q₁", key: "q1", unit: "µC" },
          { label: "Carga Q₂", key: "q2", unit: "µC" },
        ] },
        { type: "formula", group: "Fundamento", html: "Serie: 1/Cₑq = 1/C₁ + 1/C₂<br/>Paralelo: Cₑq = C₁ + C₂" },
        { type: "hint", group: "none", text: "Con los valores iniciales, compara qué se mantiene igual en ambos capacitores al cambiar la conexión: carga en serie y voltaje en paralelo." },
      ]);

      function render() {
        const { equivalent, voltages: [v1, v2], charges: [q1, q2], energy } =
          capacitorPair(c1 * 1e-6, c2 * 1e-6, voltage, series);
        const source = '<path d="M65 82V146m-17 0h34m-9 12H57m8 0v67"/>';
        const seriesPath = '<path d="M65 82h118m14 0h112m14 0h97v143H65M183 61v42m14-42v42m112-42v42m14-42v42"/>';
        const parallelPath = '<path d="M65 82h355M65 225h355M237 82v64m0 12v67M420 82v64m0 12v67m-204-79h42m-42 12h42m141-12h42m-42 12h42"/>';
        diagram.innerHTML = `
          <svg viewBox="0 0 500 285" role="img" aria-label="Dos capacitores conectados en ${series ? "serie" : "paralelo"}">
            <title>Capacitores en ${series ? "serie" : "paralelo"}</title>
            <g class="capacitor-wires">${source}${series ? seriesPath : parallelPath}</g>
            <text x="89" y="143">+</text><text x="89" y="170">−</text>
            <text x="124" y="158">${voltage} V</text>
            <text x="${series ? 190 : 237}" y="${series ? 128 : 125}">C₁ · ${c1} µF</text>
            <text x="${series ? 316 : 420}" y="${series ? 128 : 125}">C₂ · ${c2} µF</text>
            <text class="capacitor-caption" x="250" y="263">${series ? "Q₁ = Q₂  ·  V₁ + V₂ = V de la fuente" : "V₁ = V₂  ·  Q total = Q₁ + Q₂"}</text>
          </svg>`;
        for (const [key, value] of Object.entries({ eq: equivalent * 1e6, energy: energy * 1e6,
          v1, v2, q1: q1 * 1e6, q2: q2 * 1e6 })) setReadout(handle.ro[key], value, 2);
      }

      addRealCases(controls, "capacitor-pair", (values) => {
        c1 = values.c1; c2 = values.c2; voltage = values.voltage; series = values.series;
        handle.c1.value = c1; handle.c2.value = c2; handle.voltage.value = voltage;
        handle.mode.value = series;
        render();
      });
      render();
      return () => root.remove();
    },
  });
})(window);
