/* Compose a PNG from the current drawings and readings, including scrolled panels. */
(function (global) {
  "use strict";

  const width = 1440, margin = 48, cardWidth = width - 2 * margin, padding = 26;
  const ink = "#142033", muted = "#4c5d73", accent = "#2455ce";
  const clean = (value) => (value ?? "").replace(/\s+/g, " ").trim();
  const text = (node) => clean(node?.textContent);
  const available = (node) => !node.closest("[hidden]");

  function collectValues(root) {
    const parameters = [];
    const activeCase = root.querySelector("[data-active-case]")?.dataset.activeCase;
    if (activeCase) parameters.push(["Caso de partida", activeCase]);
    for (const control of root.querySelectorAll(".controls .control, .controls [data-switch-row]")) {
      if (!available(control)) continue;
      const label = text(control.matches("label") ? control : control.querySelector("label"));
      const input = control.querySelector("input");
      if (input?.disabled) continue;
      let value = text(control.querySelector(".segmented .active"));
      if (input?.type === "range") value = input.getAttribute("aria-valuetext") || input.value;
      if (input?.type === "number") value = input.validity.valid ? input.value : "—";
      if (input?.type === "color") value = input.value;
      if (input?.type === "checkbox") value = input.checked ? "Sí" : "No";
      if (label && value) parameters.push([label, value]);
    }

    const readings = [...root.querySelectorAll(".readout")].filter(available).map((reading) =>
      [text(reading.querySelector(".readout-label")), text(reading.querySelector(".readout-value")) || "—"]);
    const selected = text(root.querySelector("[data-name]"));
    if (selected && selected !== "Sin selección") parameters.unshift(["Componente seleccionado", selected]);
    const time = text(root.querySelector("[data-time]"));
    if (time) readings.unshift(["Tiempo de simulación", time.replace(/^t\s*=\s*/, "")]);
    const activity = root.querySelector("[data-activity-state]");
    if (activity && available(activity)) readings.push(["Estado del componente", text(activity)]);
    const status = root.querySelector("[data-status]");
    if (text(status)) readings.push(["Estado de la simulación", text(status)]);

    const tables = [...root.querySelectorAll(".lab-results table")].map((table) => ({
      title: text(table.closest(".lab-results").querySelector("h2")),
      columns: [...table.tHead.rows[0].cells].map(text),
      rows: [...table.tBodies[0].rows].filter((row) => row.cells.length > 1).map((row) => [...row.cells].map(text)),
    })).filter((table) => table.rows.length);
    return { parameters, readings, tables };
  }

  const svgStyles = [
    "color", "fill", "fill-opacity", "fill-rule", "stroke", "stroke-opacity", "stroke-width",
    "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "opacity", "paint-order",
    "font-family", "font-size", "font-style", "font-weight", "text-anchor", "dominant-baseline", "visibility",
  ];

  function svgSnapshot(svg, bounds, imageWidth, imageHeight) {
    const copy = svg.cloneNode(true);
    const copies = [copy, ...copy.querySelectorAll("*")];
    [svg, ...svg.querySelectorAll("*")].forEach((node, i) => {
      const styles = getComputedStyle(node);
      for (const property of svgStyles) copies[i].style.setProperty(property, styles.getPropertyValue(property));
    });
    copy.setAttribute("width", imageWidth);
    copy.setAttribute("height", imageHeight);
    copy.setAttribute("viewBox", [bounds.x, bounds.y, bounds.width, bounds.height].join(" "));
    return new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" });
  }

  function svgBounds(svg) {
    const view = svg.viewBox.baseVal;
    const drawing = svg.getBBox();
    const x = Math.min(view.x, drawing.x - 4);
    const y = Math.min(view.y, drawing.y - 4);
    const right = Math.max(view.x + view.width, drawing.x + drawing.width + 4);
    const bottom = Math.max(view.y + view.height, drawing.y + drawing.height + 4);
    return { x, y, width: right - x, height: bottom - y };
  }

  async function drawSvg(ctx, snapshot, x, y, imageWidth, imageHeight) {
    const url = URL.createObjectURL(snapshot);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
      ctx.drawImage(image, x, y, imageWidth, imageHeight);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function collectVisuals(root) {
    const visuals = [];
    for (const element of root.querySelectorAll(".sim-stage canvas, .capacitor-diagram svg, .lab-schematic, .lab-chart")) {
      const isCanvas = element instanceof HTMLCanvasElement;
      const isChart = element.matches(".lab-chart");
      if (isChart && !element.querySelector("polyline")) continue;
      const bounds = isCanvas ? element.getBoundingClientRect() : svgBounds(element);
      if (!bounds.width || !bounds.height) continue;
      const scale = Math.min((cardWidth - 2 * padding) / bounds.width, 960 / bounds.height);
      const imageWidth = Math.max(1, Math.round(bounds.width * scale));
      const imageHeight = Math.max(1, Math.round(bounds.height * scale));
      const container = element.closest(".sim-stage, .capacitor-diagram, .lab-results") ?? element;
      const metric = root.querySelector("[data-metric]");
      const title = isChart ? text(root.querySelector("[data-chart-title]")) + " · " + text(metric?.selectedOptions[0])
        : element.matches(".lab-schematic, .capacitor-diagram svg") ? "Esquema del circuito" : "Vista del simulador";
      visuals.push({
        title, imageWidth, imageHeight,
        background: getComputedStyle(container).backgroundColor,
        canvas: isCanvas ? element : null,
        svg: isCanvas ? null : svgSnapshot(element, bounds, imageWidth, imageHeight),
      });
    }
    return visuals;
  }

  function wrap(ctx, value, maxWidth, font) {
    ctx.font = font;
    const lines = [""];
    for (const word of value.split(" ")) {
      const last = lines.length - 1;
      const line = lines[last] ? lines[last] + " " + word : word;
      if (lines[last] && ctx.measureText(line).width > maxWidth) lines.push(word);
      else lines[last] = line;
    }
    return lines;
  }

  function write(ctx, lines, x, y, font, color, step) {
    ctx.font = font;
    ctx.fillStyle = color;
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * step));
  }

  async function exportSimulationImage(root, module, details = {}) {
    const { parameters, readings, tables } = collectValues(root);
    readings.push(...(details.readings ?? []));
    tables.push(...(details.tables ?? []).filter((table) => table.rows.length));
    const visuals = collectVisuals(root);
    if (!visuals.length) throw new Error("No hay un dibujo disponible para exportar.");

    const output = document.createElement("canvas");
    output.width = width;
    const ctx = output.getContext("2d");
    const commands = [], pending = [];
    const normal = "22px system-ui, sans-serif";
    const small = "19px system-ui, sans-serif";
    const bold = "600 22px system-ui, sans-serif";
    const heading = "700 30px system-ui, sans-serif";
    let y = 45;

    function paragraph(value, font, color, lineHeight, spaceAfter) {
      const top = y;
      const lines = wrap(ctx, value, cardWidth, font);
      commands.push(() => write(ctx, lines, margin, top, font, color, lineHeight));
      y += lines.length * lineHeight + spaceAfter;
    }

    function card(title, bodyHeight, drawBody) {
      const top = y, height = 82 + bodyHeight + padding;
      commands.push(() => {
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.roundRect(margin, top, cardWidth, height, 15); ctx.fill();
        write(ctx, [title], margin + padding, top + padding, heading, ink, 36);
        drawBody(margin + padding, top + 82);
      });
      y += height + 20;
    }

    function pairs(title, entries) {
      if (!entries.length) return;
      const column = (cardWidth - 2 * padding - 32) / 2;
      const cells = entries.map(([label, value]) => ({
        label: wrap(ctx, label, column, small),
        value: wrap(ctx, value, column, bold),
      }));
      const heights = [];
      for (let i = 0; i < cells.length; i += 2) {
        heights.push(Math.max(...cells.slice(i, i + 2).map((cell) => 24 * cell.label.length + 28 * cell.value.length + 16)));
      }
      card(title, heights.reduce((sum, height) => sum + height, 0), (x, rowY) => {
        cells.forEach((cell, i) => {
          const left = x + (i % 2) * (column + 32);
          write(ctx, cell.label, left, rowY, small, muted, 24);
          write(ctx, cell.value, left, rowY + 24 * cell.label.length, bold, ink, 28);
          if (i % 2 || i === cells.length - 1) rowY += heights[Math.floor(i / 2)];
        });
      });
    }

    function table({ title, columns, rows }) {
      const tableWidth = cardWidth - 2 * padding;
      const column = tableWidth / columns.length;
      const cells = [columns, ...rows].map((row, i) => row.map((cell) => wrap(ctx, String(cell), column - 22, i ? normal : bold)));
      const heights = cells.map((row) => Math.max(...row.map((lines) => lines.length)) * 28 + 18);
      card(title, heights.reduce((sum, height) => sum + height, 0), (x, rowY) => {
        cells.forEach((row, i) => {
          ctx.fillStyle = i === 0 ? "#e7eefb" : i % 2 ? "#f7f9fc" : "#fff";
          ctx.fillRect(x, rowY, tableWidth, heights[i]);
          row.forEach((lines, j) => write(ctx, lines, x + column * j + 11, rowY + 9, i ? normal : bold, ink, 28));
          rowY += heights[i];
        });
      });
    }

    const capturedAt = new Intl.DateTimeFormat("es-PE", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
    paragraph("ElectroSim · Física II", bold, accent, 28, 8);
    paragraph(module.title, "700 48px system-ui, sans-serif", ink, 58, 8);
    paragraph(module.subtitle, normal, muted, 30, 7);
    paragraph("Captura del " + capturedAt, small, muted, 24, 23);
    for (const visual of visuals) {
      card(visual.title, visual.imageHeight, (_x, top) => {
        const left = Math.round((width - visual.imageWidth) / 2);
        ctx.fillStyle = visual.background;
        ctx.fillRect(left, top, visual.imageWidth, visual.imageHeight);
        if (visual.canvas) ctx.drawImage(visual.canvas, left, top, visual.imageWidth, visual.imageHeight);
        else pending.push(drawSvg(ctx, visual.svg, left, top, visual.imageWidth, visual.imageHeight));
      });
    }
    pairs("Lecturas de la captura", readings);
    pairs("Parámetros", parameters);
    tables.forEach(table);

    output.height = y + 28;
    ctx.fillStyle = "#f0f4f9";
    ctx.fillRect(0, 0, output.width, output.height);
    ctx.textBaseline = "top";
    commands.forEach((draw) => draw());
    await Promise.all(pending);
    const png = await new Promise((resolve, reject) => {
      output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo crear el PNG.")), "image/png");
    });
    const url = URL.createObjectURL(png);
    const link = document.createElement("a");
    link.href = url;
    link.download = "electrosim-" + module.id + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".png";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  global.exportSimulationImage = exportSimulationImage;
})(window);
