/* Spatial sampling and an orbitable, orthographic canvas view. */
(function (global) {
  "use strict";

  function equipotentialSurfaces(field, extent, levels) {
    const n = 24;
    const side = n + 1;
    const samples = [];
    const tetrahedra = [[0, 1, 3, 7], [0, 3, 2, 7], [0, 2, 6, 7],
      [0, 6, 4, 7], [0, 4, 5, 7], [0, 5, 1, 7]];
    const index = (x, y, z) => x + side * (y + side * z);

    for (let z = 0; z <= n; z++) {
      for (let y = 0; y <= n; y++) {
        for (let x = 0; x <= n; x++) {
          const point = [x, y, z].map((i, axis) => (2 * i / n - 1) * extent[axis]);
          let value = field(point);
          if (!Number.isFinite(value)) value = field([point[0] + 1e-6, point[1], point[2]]);
          samples.push({ point, value });
        }
      }
    }

    function interpolate(a, b, level) {
      const fraction = (level - a.value) / (b.value - a.value);
      return V3.add(a.point, V3.scale(V3.sub(b.point, a.point), fraction));
    }

    const triangles = [];
    for (let z = 0; z < n; z++) {
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const corners = Array.from({ length: 8 }, (_, i) =>
            samples[index(x + (i & 1), y + ((i >> 1) & 1), z + (i >> 2))]);
          const values = corners.map((sample) => sample.value);
          const min = Math.min(...values), max = Math.max(...values);
          for (const { value, color } of levels) {
            if (value < min || value >= max) continue;
            for (const tetra of tetrahedra) {
              const above = [], below = [];
              for (const vertex of tetra) {
                const sample = corners[vertex];
                (sample.value > value ? above : below).push(sample);
              }
              if (!above.length || !below.length) continue;
              if (above.length === 2) {
                const a = interpolate(above[0], below[0], value);
                const b = interpolate(above[0], below[1], value);
                const c = interpolate(above[1], below[1], value);
                const d = interpolate(above[1], below[0], value);
                triangles.push({ points: [a, b, c], color }, { points: [a, c, d], color });
              } else {
                const [one, many] = above.length === 1 ? [above[0], below] : [below[0], above];
                triangles.push({ points: many.map((other) => interpolate(one, other, value)), color });
              }
            }
          }
        }
      }
    }
    return triangles;
  }

  function createFieldView(cv, isActive) {
    let yaw = -0.3, pitch = 0.56, zoom = 1;
    let pointer = null;
    const { canvas, ctx } = cv;
    const scale = () => Math.min(cv.cssW / 18, cv.cssH / 14) * zoom;
    function projection(flat) {
      if (flat) {
        const s = Math.min(cv.cssW / 18, cv.cssH / 14);
        return ([x, y, z]) => [cv.cssW / 2 + x * s, cv.cssH / 2 - y * s, -z];
      }
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const s = scale(), cx = cv.cssW / 2, centerY = cv.cssH / 2;
      return ([x, y, z]) => {
        const forward = x * sy + y * cy;
        return [cx + (x * cy - y * sy) * s, centerY - (z * cp + forward * sp) * s,
          forward * cp - z * sp];
      };
    }

    function adjustZoom(factor) {
      zoom = Math.min(3, Math.max(0.5, zoom * factor));
    }
    canvas.addEventListener("pointerdown", (e) => {
      if (!isActive() || e.button !== 0) return;
      pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!isActive() || pointer?.id !== e.pointerId) return;
      yaw -= (e.clientX - pointer.x) * 0.009;
      pitch = Math.min(1.55, Math.max(-1.55, pitch + (e.clientY - pointer.y) * 0.009));
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    });
    canvas.addEventListener("lostpointercapture", () => { pointer = null; });
    canvas.addEventListener("wheel", (e) => {
      if (!isActive()) return;
      e.preventDefault();
      adjustZoom(Math.exp(-e.deltaY * 0.001));
    }, { passive: false });
    canvas.addEventListener("keydown", (e) => {
      if (!isActive()) return;
      switch (e.key) {
        case "ArrowLeft": yaw += 0.15; break;
        case "ArrowRight": yaw -= 0.15; break;
        case "ArrowUp": pitch = Math.min(1.55, pitch + 0.15); break;
        case "ArrowDown": pitch = Math.max(-1.55, pitch - 0.15); break;
        case "+": adjustZoom(1.15); break;
        case "-": adjustZoom(1 / 1.15); break;
        default: return;
      }
      e.preventDefault();
    });

    let lastModel, lastView;
    function draw(model) {
      const { lines = [], triangles = [], markers = [], caption = "", flat = false } = model;
      const view = [cv.w, cv.h, cv.dpr, yaw, pitch, zoom, document.documentElement.dataset.theme].join("/");
      if (model === lastModel && view === lastView) return;
      lastModel = model;
      lastView = view;
      const project = projection(flat);
      ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
      ctx.clearRect(0, 0, cv.cssW, cv.cssH);
      function path(points) {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(125,145,173,0.18)";
      ctx.lineWidth = 1;
      for (let i = -6; i <= 6; i++) {
        path([[i, -6, 0], [i, 6, 0]].map(project)); ctx.stroke();
        path([[-6, i, 0], [6, i, 0]].map(project)); ctx.stroke();
      }
      const style = getComputedStyle(canvas);
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = style.getPropertyValue("--text-faint");
      ctx.fillStyle = ctx.strokeStyle;
      for (const [name, end] of [["x", [6.6, 0, 0]], ["y", [0, 6.6, 0]], ["z", [0, 0, 5.2]]]) {
        if (flat && name === "z") continue;
        const projected = project(end);
        path([project([0, 0, 0]), projected]);
        ctx.stroke();
        ctx.fillText(name, projected[0] + 5, projected[1]);
      }
      const faces = triangles.map(({ points, color }) => {
        const face = points.map(project);
        return { face, color, depth: (face[0][2] + face[1][2] + face[2][2]) / 3 };
      });
      faces.sort((a, b) => b.depth - a.depth);
      for (const { face, color } of faces) {
        path(face);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.45;
        ctx.stroke();
      }
      for (const { points, color, width = 1.4, arrows = 0 } of lines) {
        if (points.length < 2) continue;
        const projected = points.map(project);
        path(projected);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
        if (arrows) {
          const step = Math.max(1, Math.floor(projected.length / 3));
          for (let i = step; i < projected.length; i += step) {
            const [x, y] = projected[i];
            const [a, b] = projected[i - 1];
            if (Math.hypot(x - a, y - b) < 0.5) continue;
            const angle = Math.atan2(y - b, x - a) + (arrows < 0 ? Math.PI : 0);
            path([[x - 7 * Math.cos(angle - 0.5), y - 7 * Math.sin(angle - 0.5)], [x, y],
              [x - 7 * Math.cos(angle + 0.5), y - 7 * Math.sin(angle + 0.5)]]);
            ctx.stroke();
          }
        }
      }
      const orderedMarkers = markers.map((marker) => ({ ...marker, screen: project(marker.point) }));
      orderedMarkers.sort((a, b) => b.screen[2] - a.screen[2]);
      for (const { screen: [x, y], color, text, selected } of orderedMarkers) {
        ctx.beginPath();
        ctx.arc(x, y, selected ? 9 : 6, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = selected ? 2 : 1;
        ctx.stroke();
        ctx.fillStyle = style.getPropertyValue("--text");
        ctx.fillText(text, x + 11, y);
      }
      ctx.fillStyle = style.getPropertyValue("--text-dim");
      ctx.fillText(caption, 14, 23, cv.cssW - 28);
    }
    return { draw };
  }

  global.equipotentialSurfaces = equipotentialSurfaces;
  global.createFieldView = createFieldView;
})(window);
