/* ============================================================
   ElectroSim — Unidad 4: Fuerza y Campo Magnético
   Modules: magnetic field, Lorentz force
   ============================================================ */
(function (global) {
  "use strict";
  const registry = global.SimModules = global.SimModules || [];

  function drawArrowHead(ctx, x, y, ang, len, color, width) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width || 1.4;
    ctx.beginPath(); ctx.moveTo(-len / 2, 0); ctx.lineTo(len / 2, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(len / 2, 0); ctx.lineTo(len / 2 - 5, -3.4); ctx.lineTo(len / 2 - 5, 3.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  const turns = 8, coilRadius = 1.15, spacing = 0.45;
  const coilHalfLength = (turns - 1) * spacing / 2;
  const ring = (x, radius, segments) => Array.from({ length: segments + 1 }, (_, i) => {
    const theta = 2 * Math.PI * i / segments;
    return [x, radius * Math.cos(theta), radius * Math.sin(theta)];
  });
  const coils = Array.from({ length: turns }, (_, i) => ring(i * spacing - coilHalfLength, coilRadius, 40));
  const segments = coils.flatMap((coil) => coil.slice(1).map((end, i) => ({
    mid: V3.scale(V3.add(coil[i], end), 0.5), dl: V3.sub(end, coil[i]),
  })));

  function fieldSolenoid(p, current) {
    let bx = 0, by = 0, bz = 0;
    for (const { mid, dl } of segments) {
      const x = p[0] - mid[0], y = p[1] - mid[1], z = p[2] - mid[2];
      const r2 = x * x + y * y + z * z;
      if (r2 < 1e-12) return [NaN, NaN, NaN];
      const factor = 1 / (r2 * Math.sqrt(r2));
      bx += (dl[1] * z - dl[2] * y) * factor;
      by += dl[2] * x * factor;
      bz -= dl[1] * x * factor;
    }
    return V3.scale([bx, by, bz], PHY.mu0 * current / (4 * Math.PI));
  }

  registry.push({
    id: "magnetic", unit: 4, icon: "🧲", title: "Simulador de campo magnético",
    subtitle: "Líneas de imán, cable recto y solenoide en 2D y 3D",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      let source = "magnet", is3D = true, current = 5, moment = 5, direction = 1;
      let distance = 2;
      let dirty = true, model;
      const handle = buildControls(controls, [
        { type: "segmented", key: "view", label: "Vista", group: "Configuración", value: 1,
          options: [{ label: "2D", value: false }, { label: "3D", value: true }],
          onChange: (v) => { is3D = v; dirty = true; syncView(); } },
        { type: "segmented", key: "source", label: "Fuente", group: "none", value: 0,
          options: [{ label: "Imán", value: "magnet" }, { label: "Cable", value: "wire" }, { label: "Solenoide", value: "solenoid" }],
          onChange: (v) => {
            source = v;
            distance = v === "magnet" ? 2 : 1;
            handle.distance.value = distance;
            syncControls();
            dirty = true;
          } },
        { type: "slider", key: "moment", label: "Momento dipolar (A·m²)", group: "none",
          min: 0.5, max: 30, step: 0.5, value: 5, format: (v) => v.toFixed(1),
          onChange: (v) => { moment = v; dirty = true; } },
        { type: "slider", key: "current", label: "Corriente (A)", group: "none",
          min: 0.5, max: 20, step: 0.5, value: 5, format: (v) => v.toFixed(1),
          onChange: (v) => { current = v; dirty = true; } },
        { type: "slider", key: "distance", label: "Distancia de medición (m)", group: "none",
          min: 0.01, max: 3, step: 0.01, value: 2,
          onChange: (v) => { distance = v; dirty = true; } },
        { type: "segmented", key: "direction", label: "Sentido / polaridad", group: "none", value: 0,
          options: [{ label: "Directo", value: 1 }, { label: "Invertido", value: -1 }],
          onChange: (v) => { direction = v; dirty = true; } },
        { type: "readouts", key: "ro", group: "Magnitud del campo", readouts: [
          { label: "|B| de referencia", key: "B", unit: "T" },
        ] },
        { type: "formula", group: "Modelo", html: "Imán: dipolo ideal<br/>Cable: B = μ₀I / (2πr)<br/>Solenoide finito: suma de Biot–Savart" },
        { type: "hint", group: "none", text: "En 3D, arrastra el dibujo para girar. Invierte el sentido para comprobar cómo cambian las flechas del campo." },
      ]);
      function syncControls() {
        handle.current.element.hidden = source === "magnet";
        handle.moment.element.hidden = source !== "magnet";
        handle.distance.element.hidden = source === "solenoid";
      }
      syncControls();

      const cv = createCanvas(stage);
      const spatial = createFieldView(cv, () => is3D);
      const camera = document.createElement("div");
      camera.className = "sim-camera btn-row";
      camera.setAttribute("role", "group");
      camera.setAttribute("aria-label", "Controles de la vista 3D");
      camera.innerHTML = `
        <button type="button" class="btn btn-sm" data-zoom="out" aria-label="Alejar" title="Alejar">−</button>
        <button type="button" class="btn btn-sm" data-zoom="in" aria-label="Acercar" title="Acercar">+</button>
        <button type="button" class="btn btn-sm" data-reset>Restablecer vista</button>`;
      camera.querySelector('[data-zoom="out"]').addEventListener("click", () => spatial.adjustZoom(1 / 1.25));
      camera.querySelector('[data-zoom="in"]').addEventListener("click", () => spatial.adjustZoom(1.25));
      camera.querySelector("[data-reset]").addEventListener("click", spatial.reset);
      stage.appendChild(camera);

      function syncView() {
        camera.hidden = !is3D;
        cv.canvas.tabIndex = is3D ? 0 : -1;
        cv.canvas.style.cursor = is3D ? "grab" : "default";
        cv.canvas.style.touchAction = is3D ? "none" : "";
        cv.canvas.setAttribute("aria-label", is3D
          ? "Campo magnético en 3D. Arrastra o usa las flechas para girar. Usa + y − para acercar y alejar."
          : "Campo magnético en el plano XY");
      }
      syncView();

      addRealCases(controls, "magnetic", (values) => {
        source = values.source; current = values.current; moment = values.moment;
        distance = values.distance; direction = 1;
        for (const [key, value] of Object.entries(values)) handle[key].value = value;
        handle.direction.value = direction;
        syncControls();
        dirty = true;
      });
      function rebuild() {
        const lines = [], markers = [];
        const color = "rgba(61,123,236,0.73)";
        let field, sample, caption;
        if (source === "wire") {
          field = (p) => magneticFieldWire(p, direction * current);
          sample = [distance, 0, 0];
          caption = `Cable ideal · lectura a ${distance} m del eje`;
          for (const z of is3D ? [-2.5, 0, 2.5] : [0]) {
            for (const radius of [0.65, 1.4, 2.25, 3.3, 4.5]) {
              const points = ring(z, radius, 72).map(([a, b, c]) => [b, c, a]);
              lines.push({ points, color, arrows: direction });
            }
          }
          if (is3D) lines.push({ points: [[0, 0, -4.5], [0, 0, 4.5]], color: "#d97706", width: 3, arrows: direction });
          else markers.push({ point: [0, 0, 0], color: "#d97706", text: direction > 0 ? "⊙ sale" : "⊗ entra" });
        } else {
          const magnet = source === "magnet";
          field = magnet ? (p) => magneticFieldDipole(p, direction * moment)
            : (p) => fieldSolenoid(p, direction * current);
          sample = magnet ? [distance, 0, 0] : [0, 0, 0];
          caption = magnet ? `Imán dipolar · lectura sobre el eje a ${distance} m del centro`
            : "Solenoide de 8 espiras · lectura en el centro";
          const seed = magnet ? [0.85, 1.3, 2.1, 3.2, 4.7] : [1.45, 1.75, 2.15, 2.8, 4];
          const rotations = is3D ? 6 : 2;
          for (const radius of seed) {
            const stop = (p) => Math.abs(p[0]) > 7.5 || Math.hypot(p[1], p[2]) > 6 ||
              (magnet ? V3.len(p) < 0.48 : Math.abs(p[0]) < 0.25 && p[1] < coilRadius);
            const start = [0, radius, 0];
            const forward = traceSpatialLine(start, field, 0.13, 115, stop);
            const backward = traceSpatialLine(start, field, -0.13, 115, stop);
            const curve = backward.reverse().slice(0, -1).concat(forward);
            for (let i = 0; i < rotations; i++) {
              const angle = 2 * Math.PI * i / rotations;
              lines.push({ points: curve.map(([x, y]) => [x, y * Math.cos(angle), y * Math.sin(angle)]), color, arrows: 1 });
            }
          }
          if (magnet) {
            lines.push({ points: [[-0.8, 0, 0], [0.8, 0, 0]], color: "#8895a7", width: 5 });
          } else {
            for (const coil of coils) {
              lines.push({ points: is3D ? coil : [[coil[0][0], -coilRadius, 0], [coil[0][0], coilRadius, 0]],
                color: "#d97706", width: 1.7 });
            }
            for (const radius of [0, 0.37, -0.37, 0.74, -0.74]) {
              const points = traceSpatialLine([0, radius, 0], field, 0.13, 28, (p) => Math.abs(p[0]) > 2.8);
              const back = traceSpatialLine([0, radius, 0], field, -0.13, 28, (p) => Math.abs(p[0]) > 2.8);
              lines.push({ points: back.reverse().slice(0, -1).concat(points), color, arrows: 1 });
            }
          }
          const end = magnet ? 0.8 : coilHalfLength + 0.25;
          markers.push({ point: [end * direction, 0, 0], color: "#e5484d", text: "N" },
            { point: [-end * direction, 0, 0], color: "#3b6ef6", text: "S" });
        }
        setReadout(handle.ro.B, fmtSI(V3.len(field(sample)), 3));
        model = { lines, markers, caption: (is3D ? "3D · " : "2D · ") + caption,
          flat: !is3D, span: source === "wire" ? [12, 12] : [18, 14] };
        dirty = false;
      }

      let raf;
      function render() {
        if (dirty) rebuild();
        spatial.draw(model);
        raf = requestAnimationFrame(render);
      }
      render();
      return () => { cancelAnimationFrame(raf); cv.destroy(); root.remove(); };
    },
  });

  /* ---------- Module: flujo magnético uniforme ---------- */
  registry.push({
    id: "magnetic-flux",
    unit: 4,
    icon: "▱",
    title: "Flujo magnético",
    subtitle: "Orienta una superficie dentro de un campo uniforme y mide el flujo",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      let field = 0.5, area = 9, angle = 35, model;
      const handle = buildControls(controls, [
        { type: "slider", key: "field", label: "Campo uniforme B (T)", group: "Superficie y campo",
          min: 0, max: 2, step: 0.00005, value: 0.5, onChange: (value) => { field = value; rebuild(); } },
        { type: "slider", key: "area", label: "Área de la superficie (m²)", group: "none",
          min: 1, max: 16, step: 0.25, value: 9, onChange: (value) => { area = value; rebuild(); } },
        { type: "slider", key: "angle", label: "Ángulo entre B y la normal (°)", group: "none",
          min: 0, max: 180, step: 1, value: 35, onChange: (value) => { angle = value; rebuild(); } },
        { type: "buttons", label: "Comparar orientaciones", group: "none",
          buttons: [0, 90, 180].map((value) => ({
            label: value + "°", size: "btn-sm", onClick: () => {
              angle = value; handle.angle.value = value; rebuild();
            },
          })) },
        { type: "readouts", key: "ro", group: "Resultados", readouts: [
          { label: "Flujo Φ", key: "flux", unit: "Wb" },
          { label: "Componente normal de B", key: "normal", unit: "T" },
          { label: "Área proyectada", key: "projected", unit: "m²" },
        ] },
        { type: "formula", group: "Fundamento", html: "Φ = B·A·cos(θ)<br/>θ se mide desde la normal a la superficie." },
        { type: "hint", group: "none", text: "Arrastra la vista para girarla. A 90° el campo va paralelo a la superficie y el flujo es cero. A 180° el flujo cambia de signo." },
      ]);

      const cv = createCanvas(stage);
      cv.canvas.style.touchAction = "none";
      cv.canvas.tabIndex = 0;
      cv.canvas.setAttribute("aria-label", "Superficie orientable. Usa las flechas para girar la vista.");
      const spatial = createFieldView(cv, () => true);
      function rebuild() {
        const theta = angle * Math.PI / 180;
        const half = Math.sqrt(area) / 2;
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) =>
          [half * x * Math.cos(theta), half * y, -half * x * Math.sin(theta)]);
        const tip = [2.8 * Math.sin(theta), 0, 2.8 * Math.cos(theta)];
        const lines = [{ points: [...corners, corners[0]], color: "#0d9488", width: 2.5 },
          { points: [[0, 0, 0], tip], color: "#a855f7", width: 2.5, arrows: 1 }];
        const markers = [{ point: tip, color: "#a855f7", text: "Normal" }];
        if (field > 0) {
          for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) {
            for (const y of [-1.6, 0, 1.6]) {
              lines.push({ points: [[x, y, -3.1], [x, y, -1.6], [x, y, 1.6], [x, y, 3.1]],
                color: "rgba(59,110,246,0.58)", arrows: 1 });
            }
          }
          markers.push({ point: [2.4, 0, 3.1], color: "#3b6ef6", text: "B" });
        }
        model = { lines, markers, span: [10, 9], gridRadius: 4, triangles: [[0, 1, 2], [0, 2, 3]].map((face) => ({
          points: face.map((index) => corners[index]), color: "rgba(13,148,136,0.33)",
        })), caption: "Campo B (azul) · superficie (verde) · normal (morada)" };
        const result = uniformMagneticFlux(field, area, angle);
        setReadout(handle.ro.flux, fmtSI(result.flux, 3));
        setReadout(handle.ro.normal, fmtSI(result.normalField, 3));
        setReadout(handle.ro.projected, fmtSI(result.projectedArea, 2));
      }

      let raf;
      function frame() { spatial.draw(model); raf = requestAnimationFrame(frame); }
      addRealCases(controls, "magnetic-flux", (values) => {
        field = values.field; area = values.area; angle = values.angle;
        for (const [key, value] of Object.entries(values)) handle[key].value = value;
        rebuild();
      });
      rebuild();
      frame();
      return () => { cancelAnimationFrame(raf); cv.destroy(); root.remove(); };
    },
  });

  registry.push({
    id: "lorentz",
    unit: 4,
    icon: "🌀",
    title: "Simulador de fuerza de Lorentz",
    subtitle: "Trayectoria en campos E y B cruzados",
    mount(container) {
      const root = document.createElement("div");
      root.className = "sim-grid";
      const stage = document.createElement("div");
      stage.className = "sim-stage";
      const controls = document.createElement("div");
      controls.className = "panel controls";
      root.append(stage, controls);
      container.appendChild(root);

      const view = { w: 8, h: 5.6 };
      let E = 0.5, B = 0.2;
      let qmMag = 2, sign = 1;
      let vx = 2;
      let lengthScale = 1, timeScale = 1;
      let sim = null;

      const handle = buildControls(controls, [
        { type: "number", key: "E", label: "Campo eléctrico E (V/m)", group: "Campos",
          min: -10000, max: 10000, value: 0.5, onChange: (v) => { E = v; } },
        { type: "number", key: "B", label: "Campo magnético B (T)", group: "none",
          min: -0.5, max: 0.5, value: 0.2, onChange: (v) => { B = v; } },
        { type: "slider", key: "qm", label: "Magnitud de la carga por masa (C/kg)", group: "Partícula",
          min: 0.1, max: 2e11, value: 2, log: true, format: (v) => fmt(v, 2), onChange: (v) => { qmMag = v; } },
        { type: "segmented", key: "sign", label: "Signo de la carga", group: "none", value: 0,
          options: [{ label: "+", value: 1 }, { label: "−", value: -1 }],
          onChange: (v) => { sign = v; } },
        { type: "slider", key: "vx", label: "Rapidez inicial (m/s)", group: "none",
          min: 0.5, max: 2e6, value: 2, log: true, format: (v) => fmt(v, 2), onChange: (v) => { vx = v; } },
        { type: "buttons", key: "act", label: "Control", group: "none",
          buttons: [
            { label: "▶ Lanzar", key: "launch", primary: true, onClick: launch },
            { label: "⟲ Reiniciar", key: "reset", onClick: () => { sim = null; } },
          ] },
        { type: "readouts", key: "ro", group: "Parámetros del movimiento", readouts: [
          { label: "Radio respecto a la deriva", key: "r", unit: "m" },
          { label: "ω = |(q/m)·B|", key: "w", unit: "rad/s" },
          { label: "Deriva en X", key: "vd", unit: "m/s" },
          { label: "Tiempo", key: "t", unit: "s" },
        ] },
        { type: "formula", group: "Fundamento", html: "F⃗ = q(E⃗ + v⃗ × B⃗)<br/>v_d = Eᵧ/B_z &nbsp;·&nbsp; r = |v⃗ − v⃗_d|/ω" },
        { type: "hint", group: "none", text: "Campos uniformes cruzados. E y B se actualizan durante el vuelo. El signo de la carga y la rapidez inicial se aplican al lanzar." },
      ]);

      function launch() {
        sim = { pos: [-3 * lengthScale, 0], vel: [vx, 0], trail: [], qm: sign * qmMag, time: 0, stopped: false };
        sim.trail.push([sim.pos[0], sim.pos[1]]);
      }

      const cv = createCanvas(stage);
      function sc() { return Math.min(cv.cssW / (2 * view.w), cv.cssH / (2 * view.h)); }
      function toS(p) { const s = sc(); return [cv.cssW / 2 + p[0] * s, cv.cssH / 2 - p[1] * s]; }
      function particleToScreen(p) { return toS([p[0] / lengthScale, p[1] / lengthScale]); }

      addRealCases(controls, "lorentz", (values) => {
        E = values.E; B = values.B; qmMag = values.qm; sign = values.sign; vx = values.vx;
        lengthScale = values.lengthScale;
        timeScale = values.timeScale;
        for (const key of ["E", "B", "qm", "sign", "vx"]) handle[key].value = values[key];
        launch();
      });

      function render(elapsed) {
        const ctx = cv.ctx;
        ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
        ctx.clearRect(0, 0, cv.cssW, cv.cssH);

        // E field arrows
        for (let gx = -6; E !== 0 && gx <= 6; gx += 2) {
          for (let gy = -4; gy <= 4; gy += 2) {
            const [px, py] = toS([gx, gy]);
            drawArrowHead(ctx, px, py, E >= 0 ? -Math.PI / 2 : Math.PI / 2, 16, "rgba(232,72,80,0.45)", 1.4);
          }
        }
        ctx.fillStyle = getComputedStyle(stage).getPropertyValue("--text-dim");
        ctx.font = "600 14px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("B " + (B > 0 ? "⊙ " : B < 0 ? "⊗ " : "") + "= " + fmt(Math.abs(B), 4) + " T   ·   E = " + fmt(E, 2) + " V/m", 14, 24, cv.cssW - 28);
        if (lengthScale !== 1) ctx.fillText("Vista en milímetros · animación ralentizada", 14, 44, cv.cssW - 28);

        const qm = sim?.qm ?? sign * qmMag;
        const [currentVx, currentVy] = sim?.vel ?? [vx, 0];
        const { radius, omega, drift } = crossedFieldParameters(currentVx, currentVy, E, B, qm);
        setReadout(handle.ro.r, radius === null ? "—" : fmtSI(radius, 2));
        setReadout(handle.ro.w, fmtSI(omega, 2));
        setReadout(handle.ro.vd, drift === null ? "—" : fmtSI(drift, 2));
        setReadout(handle.ro.t, sim ? fmtSI(sim.time, 3) : "0");

        if (sim) {
          const acc = (st) => [qm * st.vel[1] * B, qm * (E - st.vel[0] * B)];
          const maxStep = Math.min(0.003, 0.05 / omega, 0.2 * lengthScale / V.len(sim.vel),
            Math.sqrt(0.2 * lengthScale / V.len(acc(sim))));
          const duration = Math.min(elapsed * timeScale, maxStep * 128);
          const substeps = Math.max(1, Math.ceil(duration / maxStep));
          const dt = duration / substeps;
          for (let i = 0; dt > 0 && i < substeps && !sim.stopped; i++) {
            integrateRK4(sim, acc, dt);
            sim.time += dt;
            sim.trail.push([sim.pos[0], sim.pos[1]]);
            if (sim.trail.length > 6000) sim.trail.shift();
            sim.stopped = Math.abs(sim.pos[0]) > view.w * lengthScale || Math.abs(sim.pos[1]) > view.h * lengthScale;
          }
          if (sim) {
            const n = sim.trail.length;
            for (let i = 1; i < n; i++) {
              const a = i / n;
              ctx.strokeStyle = `rgba(124,91,255,${0.15 + 0.75 * a})`;
              ctx.lineWidth = 1.6 + 2 * a;
              ctx.beginPath();
              const [x0, y0] = particleToScreen(sim.trail[i - 1]);
              const [x1, y1] = particleToScreen(sim.trail[i]);
              ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
            }
            const [px, py] = particleToScreen(sim.pos);
            ctx.fillStyle = qm > 0 ? "#e5484d" : "#3b6ef6";
            ctx.beginPath(); ctx.arc(px, py, 8, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
          }
        }
      }

      let raf, previousTime = performance.now();
      function loop(now) {
        render(Math.min(0.05, (now - previousTime) / 1000));
        previousTime = now;
        raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);
      window.addEventListener("resize", cv.resize);

      return function cleanup() { cancelAnimationFrame(raf); window.removeEventListener("resize", cv.resize); cv.destroy(); root.remove(); };
    },
  });
})(window);
