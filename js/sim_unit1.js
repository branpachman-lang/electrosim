/* ============================================================
   ElectroSim — Unidad 1: Electricidad, Campo Eléctrico y Potencial
   Modules: charges (2D/3D), potential calculator, trajectory
   ============================================================ */
(function (global) {
  "use strict";
  const registry = global.SimModules = global.SimModules || [];

  const POS = "#e5484d";
  const NEG = "#3b6ef6";

  function chargeColor(q) { return q >= 0 ? POS : NEG; }

  function hexToRgba(hex, a) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function defaultCharges() {
    return [
      { x: -2.4, y: 0, q: 2, radius: 0.42 },
      { x: 2.4, y: 0, q: -2, radius: 0.42 },
    ];
  }
  const charges = defaultCharges();
  function replaceCharges(values) {
    charges.splice(0, charges.length, ...values.map((charge) => ({ ...charge })));
  }

  /* ---------- Shared 2D builders ---------- */
  function buildFieldLines(charges, view, perCharge) {
    const lines = [];
    const ds = 0.22, steps = 400;
    for (const c of charges) {
      if (c.q === 0) continue;
      const n = Math.max(6, Math.round(perCharge || 10));
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const r0 = c.radius * 1.5;
        const sx = c.x + Math.cos(ang) * r0;
        const sy = c.y + Math.sin(ang) * r0;
        const forward = c.q > 0;
        const pts = traceFieldLine([sx, sy], charges, ds, steps, forward);
        const clipped = [];
        for (const p of pts) {
          clipped.push(p);
          if (Math.abs(p[0]) > view.w || Math.abs(p[1]) > view.h) break;
        }
        lines.push(clipped);
      }
    }
    return lines;
  }

  function buildEquipotential(charges, view, levels) {
    const segs = [];
    for (const lv of levels) {
      const s = marchingSquares(
        (x, y) => potential2D([x, y], charges),
        -view.w, -view.h, view.w, view.h, 70, 48, lv
      );
      segs.push(...s);
    }
    return segs;
  }

  function equipotentialLevels(charges, view, count) {
    let vmin = Infinity, vmax = -Infinity;
    const N = 42;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -view.w + (2 * view.w * i) / (N - 1);
        const y = -view.h + (2 * view.h * j) / (N - 1);
        let near = false;
        for (const c of charges) {
          if (Math.hypot(x - c.x, y - c.y) < c.radius * 2.4) { near = true; break; }
        }
        if (near) continue;
        const v = potential2D([x, y], charges);
        if (v < vmin) vmin = v;
        if (v > vmax) vmax = v;
      }
    }
    if (!isFinite(vmin) || !isFinite(vmax) || vmin === vmax) return [];
    const levels = [];
    for (let k = 0; k < count; k++) levels.push(vmin + ((vmax - vmin) * k) / (count - 1));
    return levels;
  }

  function buildVectorField(charges, view, nx, ny) {
    const arr = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = -view.w + (2 * view.w * (i + 0.5)) / nx;
        const y = -view.h + (2 * view.h * (j + 0.5)) / ny;
        arr.push({ x, y, e: electricField2D([x, y], charges) });
      }
    }
    return arr;
  }

  function drawArrow(ctx, x, y, ang, len, color, width) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width || 1.4;
    ctx.beginPath();
    ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(len / 2, 0); ctx.lineTo(len / 2 - 5, -3.4); ctx.lineTo(len / 2 - 5, 3.4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function drawCharge(ctx, sx, sy, q, radius, selected) {
    const col = chargeColor(q);
    const glow = ctx.createRadialGradient(sx, sy, radius * 0.3, sx, sy, radius * 3.4);
    glow.addColorStop(0, hexToRgba(col, 0.4));
    glow.addColorStop(0.6, hexToRgba(col, 0.12));
    glow.addColorStop(1, hexToRgba(col, 0));
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(sx, sy, radius * 3.4, 0, Math.PI * 2); ctx.fill();

    if (selected) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(sx, sy, radius + 9, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    const grad = ctx.createRadialGradient(sx - radius * 0.35, sy - radius * 0.35, radius * 0.1, sx, sy, radius);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.25, col);
    grad.addColorStop(1, col);
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(sx, sy, radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.max(11, radius * 1.1)}px ${global.__mono || "sans-serif"}`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(q > 0 ? "+" : q < 0 ? "−" : "0", sx, sy + 1);
    ctx.textBaseline = "alphabetic";
  }

  function drawFieldLinesWithArrows(ctx, lines, charges, toScreen, color, width) {
    ctx.lineWidth = width || 1.6;
    ctx.strokeStyle = color;
    for (const line of lines) {
      if (line.length < 2) continue;
      ctx.beginPath();
      const [s0x, s0y] = toScreen(line[0]);
      ctx.moveTo(s0x, s0y);
      for (let i = 1; i < line.length; i++) {
        const [px, py] = toScreen(line[i]);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      const step = Math.max(5, Math.floor(line.length / 4));
      for (let i = step; i < line.length - 1; i += step) {
        const e = electricField2D(line[i], charges);
        const m = Math.hypot(e[0], e[1]);
        if (m < 1e-9) continue;
        const [ax, ay] = toScreen(line[i]);
        drawArrow(ctx, ax, ay, Math.atan2(-e[1], e[0]), 11, color, 1.6);
      }
    }
  }

  /* ============================================================
     Module: visualizador de cargas puntuales (2D + 3D)
     ============================================================ */
  registry.push({
    id: "charges",
    unit: 1,
    icon: "🔵",
    title: "Visualizador de cargas puntuales",
    subtitle: "Campo eléctrico, líneas de campo y equipotenciales (2D/3D)",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      const view = { w: 7.5, h: 5.2 };
      let mode = "2d";
      let showLines = true, showEqui = true, showVectors = false, vecDensity = 18;
      let selected = charges.length ? 0 : null, hover = null;
      let dragging = false, dragIndex = -1;
      let staticDirty = true, surfaceLevel = 9;
      let fieldLines = [], equiSegs = [], vectors = [];


      const handle = buildControls(controls, [
        { type: "segmented", key: "mode", label: "Vista", group: "Visualización", value: 0,
          options: [{ label: "2D", value: "2d" }, { label: "3D", value: "3d" }],
          onChange: (v) => setMode(v) },
        { type: "segmented", key: "lines", label: "Líneas de campo", group: "none", value: 0,
          options: [{ label: "Sí", value: true }, { label: "No", value: false }],
          onChange: (v) => { showLines = v; staticDirty = true; rebuild3D(); } },
        { type: "segmented", key: "equi", label: "Equipotenciales", group: "none", value: 0,
          options: [{ label: "Sí", value: true }, { label: "No", value: false }],
          onChange: (v) => { showEqui = v; staticDirty = true; rebuild3D(); } },
        { type: "slider", key: "level", label: "|V| de las superficies 3D (V)", group: "none",
          min: 0.5, max: 45, step: 0.5, value: 9, onChange: (v) => { surfaceLevel = v; rebuild3D(); } },
        { type: "segmented", key: "vectors", label: "Vectores E", group: "none", value: 1,
          options: [{ label: "Sí", value: true }, { label: "No", value: false }],
          onChange: (v) => { showVectors = v; staticDirty = true; rebuild3D(); } },
        { type: "slider", key: "density", label: "Densidad de vectores", group: "none",
          min: 10, max: 28, step: 1, value: 18, format: (v) => v,
          onChange: (v) => { vecDensity = v; staticDirty = true; rebuild3D(); } },
        { type: "buttons", key: "add", label: "Añadir cargas", group: "Edición",
          buttons: [
            { label: "+  positiva", key: "addPos", primary: true, onClick: () => addCharge(2) },
            { label: "−  negativa", key: "addNeg", onClick: () => addCharge(-2) },
            { label: "Limpiar", key: "clear", size: "btn-sm", onClick: () => { charges.length = 0; selected = null; syncSelected(); staticDirty = true; rebuild3D(); } },
          ] },
        { type: "number", key: "index", label: "Número de carga seleccionada", group: "Edición", min: 1, max: 10, step: 1, value: 1,
          onChange: (v) => { if (charges[v - 1]) { selected = v - 1; syncSelected(); } } },
        { type: "slider", key: "selQ", label: "Carga seleccionada (nC)", group: "Edición",
          min: -10, max: 10, step: 0.5, value: 2, format: (v) => v.toFixed(1),
          onChange: (v) => { if (selected != null && charges[selected]) { charges[selected].q = v; staticDirty = true; rebuild3D(); } } },
        ...["x", "y", "z"].map((axis) => ({
          type: "number", key: axis, label: axis.toUpperCase() + " de la carga (m)", group: "Edición", value: 0,
          min: -[7.5, 5.2, 4.8]["xyz".indexOf(axis)], max: [7.5, 5.2, 4.8]["xyz".indexOf(axis)],
          onChange: (v) => { if (charges[selected]) { charges[selected][axis] = v; staticDirty = true; rebuild3D(); } },
        })),
        { type: "buttons", key: "sel", label: "Selección", group: "none",
          buttons: [
            { label: "Eliminar seleccionada", key: "del", onClick: () => {
              if (selected == null) return;
              charges.splice(selected, 1);
              selected = charges.length ? Math.min(selected, charges.length - 1) : null;
              syncSelected(); staticDirty = true; rebuild3D();
            } },
          ] },
        { type: "readouts", key: "ro", group: "Sonda del cursor en el plano z = 0", readouts: [
          { label: "E (magnitud)", key: "eMag", unit: "V/m" },
          { label: "Potencial V", key: "v", unit: "V" },
        ] },
        { type: "hint", group: "none", text: "Hasta 10 cargas. En 2D, toca para añadir o arrastra para mover. En 3D, arrastra para girar, usa la rueda para acercar y edita la posición de cada carga con X, Y y Z." },
      ]);

      function addCharge(q) {
        if (charges.length >= 10) return;
        charges.push({ x: (Math.random() - 0.5) * 8, y: (Math.random() - 0.5) * 5, q, radius: 0.42 });
        selected = charges.length - 1;
        syncSelected();
        staticDirty = true;
        rebuild3D();
      }

      function rebuildStatic() {
        fieldLines = showLines ? buildFieldLines(charges, view, 12) : [];
        equiSegs = showEqui ? buildEquipotential(charges, view, equipotentialLevels(charges, view, 12)) : [];
        vectors = showVectors ? buildVectorField(charges, view, vecDensity, Math.round(vecDensity * view.h / view.w)) : [];
        staticDirty = false;
      }

      const cv = createCanvas(stage);
      cv.canvas.style.touchAction = "none";
      cv.canvas.setAttribute("aria-label", "Campo eléctrico. En 3D, usa las flechas para girar y + o − para acercar o alejar.");

      function currentScale() {
        return Math.min(cv.cssW / (2 * view.w), cv.cssH / (2 * view.h));
      }
      function toScreen(p) {
        const s = currentScale();
        return [cv.cssW / 2 + p[0] * s, cv.cssH / 2 - p[1] * s];
      }
      function toWorld(px, py) {
        const s = currentScale();
        return [(px - cv.cssW / 2) / s, (cv.cssH / 2 - py) / s];
      }
      function hitTest(px, py) {
        for (let i = charges.length - 1; i >= 0; i--) {
          const [sx, sy] = toScreen([charges[i].x, charges[i].y]);
          if (Math.hypot(px - sx, py - sy) <= charges[i].radius * currentScale() + 8) return i;
        }
        return -1;
      }

      function render2D() {
        const ctx = cv.ctx;
        ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        ctx.clearRect(0, 0, cv.cssW, cv.cssH);

        const s = currentScale();
        ctx.strokeStyle = "rgba(128,140,155,0.14)";
        ctx.lineWidth = 1;
        const cx = cv.cssW / 2, cy = cv.cssH / 2;
        ctx.beginPath();
        for (let gx = Math.ceil(-cx / s); gx <= Math.floor((cv.cssW - cx) / s); gx++) {
          const x = cx + gx * s; ctx.moveTo(x, 0); ctx.lineTo(x, cv.cssH);
        }
        for (let gy = Math.ceil(-cy / s); gy <= Math.floor((cv.cssH - cy) / s); gy++) {
          const y = cy - gy * s; ctx.moveTo(0, y); ctx.lineTo(cv.cssW, y);
        }
        ctx.stroke();

        if (staticDirty) rebuildStatic();

        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(16,155,120,0.55)";
        ctx.beginPath();
        for (const [a, b] of equiSegs) {
          const [ax, ay] = toScreen(a), [bx, by] = toScreen(b);
          ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        }
        ctx.stroke();

        if (showLines) drawFieldLinesWithArrows(ctx, fieldLines, charges, toScreen, "rgba(90,120,255,0.8)");

        if (showVectors) {
          for (const v of vectors) {
            const [sx, sy] = toScreen([v.x, v.y]);
            const mag = Math.hypot(v.e[0], v.e[1]);
            if (mag < 1e-9) continue;
            const ang = Math.atan2(-v.e[1], v.e[0]);
            drawArrow(ctx, sx, sy, ang, Math.min(18, 6 + Math.log10(mag + 1) * 3), "rgba(120,130,150,0.7)", 1.2);
          }
        }

        for (let i = 0; i < charges.length; i++) {
          const [sx, sy] = toScreen([charges[i].x, charges[i].y]);
          drawCharge(ctx, sx, sy, charges[i].q, charges[i].radius * s, selected === i);
        }

        if (hover) {
          const e = electricField2D([hover.x, hover.y], charges);
          const v = potential2D([hover.x, hover.y], charges);
          setReadout(handle.ro.eMag, fmtSI(V3.len(electricField3D([hover.x, hover.y, 0], charges)), 3));
          setReadout(handle.ro.v, fmtSI(v, 3));
          const em = Math.hypot(e[0], e[1]);
          if (em > 1e-9) {
            const [sx, sy] = toScreen([hover.x, hover.y]);
            drawArrow(ctx, sx, sy, Math.atan2(-e[1], e[0]), 22, "rgba(125,130,150,0.8)", 2);
          }
        }
      }

      const spatial = createFieldView(cv, () => mode === "3d");
      let spatialDirty = true, geometry, scene, sceneSelection;

      function rebuild3D() { spatialDirty = true; }

      function setMode(nextMode) {
        mode = nextMode;
        scene = null;
        cv.canvas.style.cursor = mode === "3d" ? "grab" : "crosshair";
        cv.canvas.tabIndex = mode === "3d" ? 0 : -1;
        setReadout(handle.ro.eMag, "—");
        setReadout(handle.ro.v, "—");
      }

      function render3D() {
        if (spatialDirty) {
          const active = charges.filter((c) => c.q !== 0);
          const field = (p) => electricField3D(p, active);
          const outside = (p) => p.some((v, i) => Math.abs(v) > [8, 6, 5][i]);
          const lines = [];
          for (const c of showLines ? active : []) {
            for (let i = 0; i < 14; i++) {
              const z = 1 - (2 * i + 1) / 14, a = i * Math.PI * (3 - Math.sqrt(5));
              const r = Math.sqrt(1 - z * z);
              const start = V3.add([c.x, c.y, c.z || 0], V3.scale([r * Math.cos(a), r * Math.sin(a), z], 0.5));
              const sign = Math.sign(c.q);
              const points = traceSpatialLine(start, field, sign * 0.2, 145,
                (p) => outside(p) || active.some((other) => Math.hypot(p[0] - other.x, p[1] - other.y, p[2] - (other.z || 0)) < 0.32));
              lines.push({ points, arrows: sign, color: "rgba(78,126,245,0.66)" });
            }
          }
          if (showVectors) {
            const stride = 30 / vecDensity;
            for (let x = -6; x <= 6; x += stride) {
              for (let y = -4; y <= 4; y += stride) {
                for (const z of [-2, 0, 2]) {
                  const point = [x, y, z], e = field(point), magnitude = V3.len(e);
                  if (!Number.isFinite(magnitude) || magnitude < 1e-8) continue;
                  const length = Math.min(0.85, 0.2 + 0.3 * Math.log10(magnitude + 1));
                  lines.push({ points: [point, V3.add(point, V3.scale(e, length / magnitude))],
                    arrows: 1, width: 1, color: "rgba(105,119,145,0.52)" });
                }
              }
            }
          }
          const levels = [
            { value: -surfaceLevel, color: "rgba(59,110,246,0.16)" },
            { value: surfaceLevel, color: "rgba(229,72,77,0.16)" },
          ];
          const triangles = showEqui && active.length
            ? equipotentialSurfaces((p) => potential3D(p, active), [8, 6, 5], levels) : [];
          geometry = { lines, triangles };
          spatialDirty = false;
          scene = null;
        }
        if (!scene || sceneSelection !== selected) {
          sceneSelection = selected;
          scene = {
            ...geometry,
            markers: charges.map((c, i) => ({
              point: [c.x, c.y, c.z || 0], color: chargeColor(c.q), selected: i === selected,
              text: "Q" + (i + 1) + " · " + c.q + " nC",
            })),
            caption: showEqui ? `Superficies V = +${surfaceLevel} V (roja) y −${surfaceLevel} V (azul)` : "Campo eléctrico en 3D",
          };
        }
        spatial.draw(scene);
      }

      function syncSelected() {
        const charge = charges[selected];
        handle.index.disabled = !charge;
        handle.index.max = charges.length || 1;
        handle.index.value = charge ? selected + 1 : "";
        handle.del.disabled = !charge;
        handle.addPos.disabled = handle.addNeg.disabled = charges.length >= 10;
        if (charge) handle.selQ.value = charge.q;
        for (const axis of ["x", "y", "z"]) {
          handle[axis].disabled = !charge;
          handle[axis].value = charge ? +(charge[axis] || 0).toFixed(3) : "";
        }
      }
      syncSelected();

      // ---- 2D interaction ----
      cv.canvas.addEventListener("pointerdown", (ev) => {
        if (mode !== "2d" || ev.button !== 0) return;
        const rect = cv.canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
        const idx = hitTest(px, py);
        if (idx >= 0) { dragging = true; dragIndex = idx; selected = idx; syncSelected(); cv.canvas.setPointerCapture(ev.pointerId); }
        else {
          const [wx, wy] = toWorld(px, py);
          if (charges.length < 10) {
            charges.push({ x: wx, y: wy, q: ev.shiftKey ? -2 : 2, radius: 0.42 });
            selected = charges.length - 1;
            syncSelected();
            staticDirty = true; rebuild3D();
          }
        }
      });
      cv.canvas.addEventListener("pointermove", (ev) => {
        if (mode !== "2d") return;
        const rect = cv.canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
        if (dragging && dragIndex >= 0) {
          const [wx, wy] = toWorld(px, py);
          charges[dragIndex].x = wx; charges[dragIndex].y = wy;
          syncSelected();
          staticDirty = true; rebuild3D();
        }
        cv.canvas.style.cursor = (dragging || hitTest(px, py) >= 0) ? "grab" : "crosshair";
        hover = { x: toWorld(px, py)[0], y: toWorld(px, py)[1] };
      });
      cv.canvas.addEventListener("lostpointercapture", () => { dragging = false; dragIndex = -1; });
      cv.canvas.addEventListener("pointerleave", () => { hover = null; });

      addRealCases(controls, "charges", (values) => {
        replaceCharges(values.charges);
        selected = 0;
        hover = { x: values.probe[0], y: values.probe[1] };
        syncSelected();
        staticDirty = true;
        rebuild3D();
        setReadout(handle.ro.eMag, fmtSI(V3.len(electricField3D(values.probe, charges)), 3));
        setReadout(handle.ro.v, fmtSI(potential3D(values.probe, charges), 3));
      });
      let raf;
      function loop() {
        if (mode === "2d") render2D();
        else render3D();
        raf = requestAnimationFrame(loop);
      }
      loop();

      return function cleanup() {
        cancelAnimationFrame(raf);

        cv.destroy();

        root.remove();
      };
    },
  });

  /* ============================================================
     Module: calculadora de potencial
     ============================================================ */
  registry.push({
    id: "potential",
    unit: 1,
    icon: "🧮",
    title: "Calculadora de potencial",
    subtitle: "Compara el potencial, el campo y el trabajo eléctrico entre dos puntos",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      const view = { w: 7.5, h: 5.2 };
      const probes = { A: { x: -1.5, y: 1.5, z: 0 }, B: { x: 1.5, y: 1.5, z: 0 } };
      let active = "A", testCharge = 1, dragging = -1;
      let dirty = true, fieldLines = [], vectors = [];

      const handle = buildControls(controls, [
        { type: "segmented", key: "point", label: "Punto que editas", group: "Coordenadas",
          options: [{ label: "A", value: "A" }, { label: "B", value: "B" }], onChange: selectProbe },
        ...["x", "y", "z"].map((axis) => ({
          type: "number", key: axis, label: axis.toUpperCase() + " del punto seleccionado (m)", group: "Coordenadas",
          value: probes.A[axis], onChange: (v) => { probes[active][axis] = v; },
        })),
        { type: "readouts", key: "ro", group: "Campo en el punto seleccionado", readouts: [
          { label: "Ex", key: "ex", unit: "V/m" },
          { label: "Ey", key: "ey", unit: "V/m" },
          { label: "Ez", key: "ez", unit: "V/m" },
          { label: "|E|", key: "em", unit: "V/m" },
        ] },
        { type: "slider", key: "testCharge", label: "Carga de prueba q (nC)", group: "Trabajo de A a B",
          min: -10, max: 10, step: 0.5, value: 1, onChange: (v) => { testCharge = v; } },
        { type: "readouts", key: "work", group: "none", readouts: [
          { label: "Potencial en A", key: "a", unit: "V" },
          { label: "Potencial en B", key: "b", unit: "V" },
          { label: "ΔV = V(B) − V(A)", key: "dv", unit: "V" },
          { label: "Trabajo del campo", key: "w", unit: "J" },
        ] },
        { type: "formula", group: "Fundamento", html: "V = k·Σ Qᵢ/rᵢ<br/>E = −∇V<br/>W(A→B) = −q·ΔV" },
        { type: "hint", group: "none", text: "Arrastra A o B en la proyección XY, o escribe sus coordenadas. Si los dos puntos tienen igual potencial, el trabajo es cero aunque el campo pueda ser distinto de cero." },
      ]);

      function selectProbe(point) {
        active = point;
        handle.point.value = point;
        for (const axis of ["x", "y", "z"]) handle[axis].value = Number(probes[point][axis].toFixed(3));
      }

      function rebuild() {
        fieldLines = buildFieldLines(charges, view, 9);
        vectors = buildVectorField(charges, view, 16, 11);
        dirty = false;
      }

      const cv = createCanvas(stage);
      cv.canvas.style.touchAction = "none";
      function sc() { return Math.min(cv.cssW / (2 * view.w), cv.cssH / (2 * view.h)); }
      function toS(p) { const s = sc(); return [cv.cssW / 2 + p[0] * s, cv.cssH / 2 - p[1] * s]; }
      function toW(px, py) { const s = sc(); return [(px - cv.cssW / 2) / s, (cv.cssH / 2 - py) / s]; }

      function hit(px, py) {
        for (const key of [active, active === "A" ? "B" : "A"]) {
          const { x, y } = probes[key];
          const [pxs, pys] = toS([x, y]);
          if (Math.hypot(px - pxs, py - pys) <= 14) return key;
        }
        for (let i = charges.length - 1; i >= 0; i--) {
          const [sx, sy] = toS([charges[i].x, charges[i].y]);
          if (Math.hypot(px - sx, py - sy) <= charges[i].radius * sc() + 6) return i;
        }
        return -1;
      }

      function render() {
        const ctx = cv.ctx;
        ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        ctx.clearRect(0, 0, cv.cssW, cv.cssH);
        const s = sc();
        ctx.strokeStyle = "rgba(128,140,155,0.13)";
        ctx.lineWidth = 1;
        const cx = cv.cssW / 2, cy = cv.cssH / 2;
        ctx.beginPath();
        for (let gx = Math.ceil(-cx / s); gx <= Math.floor((cv.cssW - cx) / s); gx++) { const x = cx + gx * s; ctx.moveTo(x, 0); ctx.lineTo(x, cv.cssH); }
        for (let gy = Math.ceil(-cy / s); gy <= Math.floor((cv.cssH - cy) / s); gy++) { const y = cy - gy * s; ctx.moveTo(0, y); ctx.lineTo(cv.cssW, y); }
        ctx.stroke();

        if (dirty) rebuild();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(90,120,255,0.4)";
        for (const line of fieldLines) {
          if (line.length < 2) continue;
          ctx.beginPath();
          const [sx, sy] = toS(line[0]); ctx.moveTo(sx, sy);
          for (let i = 1; i < line.length; i++) { const [px, py] = toS(line[i]); ctx.lineTo(px, py); }
          ctx.stroke();
        }
        for (const v of vectors) {
          const [sx, sy] = toS([v.x, v.y]);
          const m = Math.hypot(v.e[0], v.e[1]);
          if (m < 1e-9) continue;
          drawArrow(ctx, sx, sy, Math.atan2(-v.e[1], v.e[0]), Math.min(20, 5 + Math.log10(m + 1) * 3.2), "rgba(120,130,150,0.55)", 1.1);
        }
        for (const c of charges) { const [sx, sy] = toS([c.x, c.y]); drawCharge(ctx, sx, sy, c.q, c.radius * s, false); }

        const coords = ({ x, y, z }) => [x, y, z];
        const a = coords(probes.A), b = coords(probes.B);
        const va = potential3D(a, charges), vb = potential3D(b, charges);
        const e = electricField3D(active === "A" ? a : b, charges);
        const palette = canvasPalette(stage);
        ctx.strokeStyle = palette.muted;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(...toS(a)); ctx.lineTo(...toS(b)); ctx.stroke();
        ctx.setLineDash([]);
        for (const [name, point, color] of [["A", a, "#7c3aed"], ["B", b, "#0d9488"]]) {
          const [x, y] = toS(point);
          ctx.fillStyle = color;
          ctx.strokeStyle = palette.surface; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(x, y, active === name ? 9 : 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          if (active === name && Math.hypot(e[0], e[1]) > 1e-9) {
            drawArrow(ctx, x, y, Math.atan2(-e[1], e[0]), 35, color, 2.2);
          }
          ctx.fillStyle = palette.ink;
          ctx.font = "600 13px system-ui, sans-serif";
          ctx.textAlign = "left";
          ctx.fillText(name, x + 11, y - 9);
        }
        const em = V3.len(e);
        setReadout(handle.work.a, fmtSI(va, 2));
        setReadout(handle.work.b, fmtSI(vb, 2));
        setReadout(handle.work.dv, fmtSI(vb - va, 2));
        setReadout(handle.work.w, fmtSI(-testCharge * 1e-9 * (vb - va), 2));
        setReadout(handle.ro.ex, fmtSI(e[0], 1));
        setReadout(handle.ro.ey, fmtSI(e[1], 1));
        setReadout(handle.ro.ez, fmtSI(e[2], 1));
        setReadout(handle.ro.em, fmtSI(em, 1));
      }

      cv.canvas.addEventListener("pointerdown", (ev) => {
        const rect = cv.canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
        dragging = hit(px, py);
        if (typeof dragging === "string") selectProbe(dragging);
        if (dragging !== -1) cv.canvas.setPointerCapture(ev.pointerId);
      });
      cv.canvas.addEventListener("pointermove", (ev) => {
        const rect = cv.canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
        const [wx, wy] = toW(px, py);
        if (typeof dragging === "string") {
          probes[dragging].x = wx; probes[dragging].y = wy;
          selectProbe(dragging);
        }
        else if (dragging >= 0) { charges[dragging].x = wx; charges[dragging].y = wy; dirty = true; }
        cv.canvas.style.cursor = hit(px, py) === -1 ? "default" : "grab";
      });
      cv.canvas.addEventListener("lostpointercapture", () => { dragging = -1; cv.canvas.style.cursor = "default"; });

      addRealCases(controls, "potential", (values) => {
        replaceCharges(values.charges);
        for (const point of ["A", "B"]) {
          [probes[point].x, probes[point].y, probes[point].z] = values[point];
        }
        testCharge = values.q;
        handle.testCharge.value = testCharge;
        selectProbe("A");
        dragging = -1;
        dirty = true;
      });
      let raf;
      function loop() { render(); raf = requestAnimationFrame(loop); }
      loop();

      return function cleanup() { cancelAnimationFrame(raf); cv.destroy(); root.remove(); };
    },
  });

  /* ============================================================
     Module: simulador de trayectoria
     ============================================================ */
  registry.push({
    id: "trajectory",
    unit: 1,
    icon: "🚀",
    title: "Simulador de trayectoria",
    subtitle: "Partícula cargada bajo campos eléctricos (a = qE/m)",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      const view = { w: 7.5, h: 5.2 };
      let dirty = true, fieldLines = [];
      let sim = null;
      let qm = -1;      // specific charge q/m (C/kg)
      let speed = 3, angle = 0;

      const handle = buildControls(controls, [
        { type: "slider", key: "qm", label: "Carga específica q/m (C/kg)", group: "Partícula",
          min: -5, max: 5, step: 0.1, value: -1, format: (v) => v.toFixed(1), onChange: (v) => { qm = v; } },
        { type: "slider", key: "speed", label: "Rapidez inicial (m/s)", group: "none",
          min: 0.5, max: 8, step: 0.1, value: 3, format: (v) => v.toFixed(1), onChange: (v) => { speed = v; } },
        { type: "slider", key: "angle", label: "Ángulo de lanzamiento (°)", group: "none",
          min: -180, max: 180, step: 1, value: 0, format: (v) => v.toFixed(0) + "°", onChange: (v) => { angle = v; } },
        { type: "buttons", key: "act", label: "Control", group: "none",
          buttons: [
            { label: "▶ Lanzar", key: "launch", primary: true, onClick: launch },
            { label: "⟲ Reiniciar", key: "reset", onClick: reset },
          ] },
        { type: "readouts", key: "ro", group: "Datos en vivo", readouts: [
          { label: "|E| en partícula", key: "e", unit: "V/m" },
          { label: "|a| aceleración", key: "a", unit: "m/s²" },
          { label: "Rapidez |v|", key: "v", unit: "m/s" },
          { label: "Tiempo", key: "t", unit: "s" },
        ] },
        { type: "formula", group: "Fundamento", html: "F⃗ = q·E⃗ &nbsp;→&nbsp; a⃗ = (q/m)·E⃗<br/>Integración numérica RK4" },
        { type: "hint", group: "none", text: "La partícula se mueve en el plano XY. Usa las cargas del Visualizador y arrástralas para modificar el campo. El recorrido termina al acercarse a una carga del plano o salir de la vista." },
      ]);

      function launch() {
        const rad = (angle * Math.PI) / 180;
        sim = {
          pos: [-3, 0.6],
          vel: [Math.cos(rad) * speed, Math.sin(rad) * speed],
          trail: [],
          qm,
          time: 0,
          stopped: false,
        };
        sim.trail.push([sim.pos[0], sim.pos[1]]);
      }
      function reset() {
        sim = null;
        for (const readout of Object.values(handle.ro)) setReadout(readout, "—");
      }
      addRealCases(controls, "trajectory", (values) => {
        replaceCharges(values.charges);
        qm = values.qm; speed = values.speed; angle = values.angle;
        handle.qm.value = qm; handle.speed.value = speed; handle.angle.value = angle;
        dirty = true;
        reset();
        launch();
      });

      function rebuild() { fieldLines = buildFieldLines(charges, view, 9); dirty = false; }

      const cv = createCanvas(stage);
      function sc() { return Math.min(cv.cssW / (2 * view.w), cv.cssH / (2 * view.h)); }
      function toS(p) { const s = sc(); return [cv.cssW / 2 + p[0] * s, cv.cssH / 2 - p[1] * s]; }
      function toW(px, py) { const s = sc(); return [(px - cv.cssW / 2) / s, (cv.cssH / 2 - py) / s]; }
      let dragging = -1;

      function hit(px, py) {
        for (let i = charges.length - 1; i >= 0; i--) {
          const [sx, sy] = toS([charges[i].x, charges[i].y]);
          if (Math.hypot(px - sx, py - sy) <= charges[i].radius * sc() + 6) return i;
        }
        return -1;
      }

      function render(elapsed) {
        const ctx = cv.ctx;
        ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        ctx.clearRect(0, 0, cv.cssW, cv.cssH);
        const s = sc();
        ctx.strokeStyle = "rgba(128,140,155,0.13)";
        ctx.lineWidth = 1;
        const cx = cv.cssW / 2, cy = cv.cssH / 2;
        ctx.beginPath();
        for (let gx = Math.ceil(-cx / s); gx <= Math.floor((cv.cssW - cx) / s); gx++) { const x = cx + gx * s; ctx.moveTo(x, 0); ctx.lineTo(x, cv.cssH); }
        for (let gy = Math.ceil(-cy / s); gy <= Math.floor((cv.cssH - cy) / s); gy++) { const y = cy - gy * s; ctx.moveTo(0, y); ctx.lineTo(cv.cssW, y); }
        ctx.stroke();

        if (dirty) rebuild();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "rgba(90,120,255,0.4)";
        for (const line of fieldLines) {
          if (line.length < 2) continue;
          ctx.beginPath(); const [sx, sy] = toS(line[0]); ctx.moveTo(sx, sy);
          for (let i = 1; i < line.length; i++) { const [px, py] = toS(line[i]); ctx.lineTo(px, py); }
          ctx.stroke();
        }
        for (const c of charges) { const [sx, sy] = toS([c.x, c.y]); drawCharge(ctx, sx, sy, c.q, c.radius * s, false); }

        if (sim) {
          const substeps = Math.max(1, Math.ceil(elapsed / 0.002));
          const dt = elapsed / substeps;
          const acc = (st) => V.scale(electricField2D(st.pos, charges), sim.qm);
          const nearCharge = () => charges.some((c) => c.q && Math.hypot(sim.pos[0] - c.x, sim.pos[1] - c.y, c.z || 0) < 0.42);
          for (let i = 0; dt > 0 && i < substeps && !sim.stopped; i++) {
            if (nearCharge()) { sim.stopped = true; break; }
            integrateRK4(sim, acc, dt);
            sim.time += dt;
            sim.trail.push([sim.pos[0], sim.pos[1]]);
            if (sim.trail.length > 4000) sim.trail.shift();
            sim.stopped = nearCharge() || Math.abs(sim.pos[0]) > view.w || Math.abs(sim.pos[1]) > view.h;
          }
          if (sim) {
            // gradient trail
            const n = sim.trail.length;
            for (let i = 1; i < n; i++) {
              const a = i / n;
              ctx.strokeStyle = `rgba(232,80,120,${0.15 + 0.7 * a})`;
              ctx.lineWidth = 1 + 1.4 * a;
              ctx.beginPath();
              const [x0, y0] = toS(sim.trail[i - 1]);
              const [x1, y1] = toS(sim.trail[i]);
              ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            }
            const [px, py] = toS(sim.pos);
            const e = electricField2D(sim.pos, charges);
            const em = Math.hypot(e[0], e[1]);
            const am = Math.abs(sim.qm) * em;
            const vm = Math.hypot(sim.vel[0], sim.vel[1]);
            setReadout(handle.ro.e, fmtSI(em, 1));
            setReadout(handle.ro.a, fmtSI(am, 1));
            setReadout(handle.ro.v, vm.toFixed(2));
            setReadout(handle.ro.t, sim.time.toFixed(3));
            ctx.fillStyle = chargeColor(sim.qm);
            ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
          }
        }
      }

      cv.canvas.addEventListener("pointerdown", (ev) => {
        const rect = cv.canvas.getBoundingClientRect();
        dragging = hit(ev.clientX - rect.left, ev.clientY - rect.top);
        if (dragging >= 0) cv.canvas.setPointerCapture(ev.pointerId);
      });
      cv.canvas.addEventListener("pointermove", (ev) => {
        const rect = cv.canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left, py = ev.clientY - rect.top;
        if (dragging >= 0) { const [wx, wy] = toW(px, py); charges[dragging].x = wx; charges[dragging].y = wy; dirty = true; }
        cv.canvas.style.cursor = hit(px, py) >= 0 ? "grab" : "default";
      });
      cv.canvas.addEventListener("lostpointercapture", () => { dragging = -1; });

      let raf, previousTime = performance.now();
      function loop(now) {
        render(Math.min(0.05, (now - previousTime) / 1000));
        previousTime = now;
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);

      return function cleanup() { cancelAnimationFrame(raf); cv.destroy(); root.remove(); };
    },
  });
})(window);
