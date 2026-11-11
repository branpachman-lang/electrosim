/* ============================================================
   ElectroSim — physics & math core
   Shared vector math, physical constants, field computations.
   ============================================================ */
(function (global) {
  "use strict";

  // roundRect polyfill for older browsers
  if (typeof CanvasRenderingContext2D !== "undefined" && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      if (typeof r === "number") r = { tl: r, tr: r, br: r, bl: r };
      r = r || {};
      const tl = r.tl || 0, tr = r.tr || 0, br = r.br || 0, bl = r.bl || 0;
      this.beginPath();
      this.moveTo(x + tl, y);
      this.lineTo(x + w - tr, y);
      this.arcTo(x + w, y, x + w, y + tr, tr);
      this.lineTo(x + w, y + h - br);
      this.arcTo(x + w, y + h, x + w - br, y + h, br);
      this.lineTo(x + bl, y + h);
      this.arcTo(x, y + h, x, y + h - bl, bl);
      this.lineTo(x, y + tl);
      this.arcTo(x, y, x + tl, y, tl);
      this.closePath();
      return this;
    };
  }

  const PHY = {
    k: 8.9875e9,        // Coulomb constant (N·m²/C²)
    eps0: 8.854e-12,    // vacuum permittivity (F/m)
    mu0: 4 * Math.PI * 1e-7, // vacuum permeability (N/A²)
    e: 1.602e-19,       // elementary charge (C)
    me: 9.109e-31,      // electron mass (kg)
    mp: 1.673e-27,      // proton mass (kg)
  };
  // Positions in meters, charge values in nanocoulombs in the electrostatic modules.
  const kNano = PHY.k * 1e-9;

  /* ---------- Vector helpers (2D) ---------- */
  const V = {
    add(a, b) { return [a[0] + b[0], a[1] + b[1]]; },
    sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; },
    scale(a, s) { return [a[0] * s, a[1] * s]; },
    dot(a, b) { return a[0] * b[0] + a[1] * b[1]; },
    len(a) { return Math.hypot(a[0], a[1]); },
    norm(a) {
      const l = Math.hypot(a[0], a[1]);
      return l > 0 ? [a[0] / l, a[1] / l] : [0, 0];
    },
    perp(a) { return [-a[1], a[0]]; },
    rot(a, ang) {
      const c = Math.cos(ang), s = Math.sin(ang);
      return [a[0] * c - a[1] * s, a[0] * s + a[1] * c];
    },
    crossZ(a, b) { return a[0] * b[1] - a[1] * b[0]; },
  };

  /* ---------- 3D vector helpers ---------- */
  const V3 = {
    add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; },
    sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; },
    scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; },
    len(a) { return Math.hypot(a[0], a[1], a[2]); },
    norm(a) {
      const l = Math.hypot(a[0], a[1], a[2]);
      return l > 0 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
    },
    cross(a, b) {
      return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
      ];
    },
    dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; },
  };

  /* ---------- Electrostatics ---------- */
  // Electric field (2D) at point p due to a set of charges [{x,y,q}]
  function electricField2D(p, charges) {
    let ex = 0, ey = 0;
    for (const c of charges) {
      const dx = p[0] - c.x, dy = p[1] - c.y;
      const r2 = dx * dx + dy * dy + (c.z || 0) ** 2;
      if (c.q === 0) continue;
      if (r2 === 0) return [NaN, NaN];
      const r = Math.sqrt(r2);
      const mag = kNano * c.q / r2;
      ex += (mag * dx) / r;
      ey += (mag * dy) / r;
    }
    return [ex, ey];
  }

  // Electric potential (2D scalar) at point p
  function potential2D(p, charges) {
    return potential3D([p[0], p[1], 0], charges);
  }

  // Electric field (3D) at point p
  function electricField3D(p, charges3) {
    let e = [0, 0, 0];
    for (const c of charges3) {
      if (c.q === 0) continue;
      const d = V3.sub(p, [c.x, c.y, c.z || 0]);
      const r2 = V3.dot(d, d);
      if (r2 === 0) return [NaN, NaN, NaN];
      const r = Math.sqrt(r2);
      const mag = kNano * c.q / r2;
      e = V3.add(e, V3.scale(d, mag / r));
    }
    return e;
  }

  function potential3D(p, charges) {
    let result = 0;
    for (const c of charges) {
      if (c.q === 0) continue;
      const distance = Math.hypot(p[0] - c.x, p[1] - c.y, p[2] - (c.z || 0));
      if (distance === 0) return NaN;
      result += kNano * c.q / distance;
    }
    return result;
  }

  function traceSpatialLine(start, field, step, steps, stop) {
    const points = [start];
    const direction = (p) => V3.norm(field(p));
    let p = start;
    for (let i = 0; i < steps; i++) {
      const a = direction(p);
      if (V3.len(a) === 0) break;
      const b = direction(V3.add(p, V3.scale(a, step / 2)));
      const c = direction(V3.add(p, V3.scale(b, step / 2)));
      const d = direction(V3.add(p, V3.scale(c, step)));
      p = V3.add(p, V3.scale(V3.add(V3.add(a, d), V3.scale(V3.add(b, c), 2)), step / 6));
      points.push(p);
      if (stop(p)) break;
    }
    return points;
  }

  function crossedFieldParameters(vx, vy, E, B, qm) {
    const drift = B ? E / B : null;
    const omega = Math.abs(qm * B);
    return { drift, omega, radius: omega ? Math.hypot(vx - drift, vy) / omega : null };
  }

  function plateCapacitor(area, separation, dielectric, sourceVoltage, isolatedCharge = null) {
    const capacitance = PHY.eps0 * dielectric * area / separation;
    const charge = isolatedCharge ?? capacitance * sourceVoltage;
    const voltage = isolatedCharge === null ? sourceVoltage : charge / capacitance;
    const energy = 0.5 * charge * voltage;
    return { capacitance, charge, voltage, energy, field: voltage / separation, density: energy / (area * separation) };
  }

  function capacitorPair(c1, c2, voltage, series) {
    const equivalent = series ? c1 * c2 / (c1 + c2) : c1 + c2;
    const charge = equivalent * voltage;
    const voltages = series ? [charge / c1, charge / c2] : [voltage, voltage];
    const charges = series ? [charge, charge] : [c1 * voltage, c2 * voltage];
    return { equivalent, voltages, charges, energy: 0.5 * charge * voltage };
  }

  function sourceWithResistance(emf, load, internal) {
    const current = emf / (load + internal);
    const terminal = current * load;
    return { current, terminal, power: terminal * current, loss: current * current * internal };
  }

  function uniformMagneticFlux(field, area, angleDegrees) {
    const cosine = angleDegrees === 90 ? 0 : Math.cos(angleDegrees * Math.PI / 180);
    const normalField = field * cosine;
    return { normalField, projectedArea: area * Math.abs(cosine), flux: normalField * area };
  }

  // Field-line tracing (2D) via RK4 of dr/ds = E/|E|
  function traceFieldLine(start, charges, ds, steps, forward) {
    const pts = [[start[0], start[1]]];
    let p = [start[0], start[1]];
    const dir = forward ? 1 : -1;
    for (let i = 0; i < steps; i++) {
      const k1 = normOrZero(electricField2D(p, charges));
      if (k1[0] === 0 && k1[1] === 0) break;
      const p2 = V.add(p, V.scale(k1, ds * 0.5 * dir));
      const k2 = normOrZero(electricField2D(p2, charges));
      const p3 = V.add(p, V.scale(k2, ds * 0.5 * dir));
      const k3 = normOrZero(electricField2D(p3, charges));
      const p4 = V.add(p, V.scale(k3, ds * dir));
      const k4 = normOrZero(electricField2D(p4, charges));
      const step = V.scale(
        V.add(k1, V.add(V.scale(k2, 2), V.add(V.scale(k3, 2), k4))),
        (ds * dir) / 6
      );
      p = V.add(p, step);
      pts.push([p[0], p[1]]);
      // Stop if very close to another charge
      for (const c of charges) {
        if (c.q !== 0 && Math.hypot(p[0] - c.x, p[1] - c.y, c.z || 0) < 0.9 * c.radius) return pts;
      }
    }
    return pts;
  }

  function normOrZero(e) {
    const l = Math.hypot(e[0], e[1]);
    return l > 1e-14 ? [e[0] / l, e[1] / l] : [0, 0];
  }

  /* ---------- Marching squares for equipotential contours ---------- */
  // Build contours of a scalar field f(x,y) == level over the grid
  function marchingSquares(f, x0, y0, x1, y1, nx, ny, level) {
    const dx = (x1 - x0) / nx, dy = (y1 - y0) / ny;
    const xs = new Array(nx + 1), ys = new Array(ny + 1);
    for (let i = 0; i <= nx; i++) xs[i] = x0 + i * dx;
    for (let j = 0; j <= ny; j++) ys[j] = y0 + j * dy;

    // Evaluate grid (j = row index from bottom to top)
    const grid = new Array(ny + 1);
    for (let j = 0; j <= ny; j++) {
      grid[j] = new Array(nx + 1);
      for (let i = 0; i <= nx; i++) grid[j][i] = f(xs[i], ys[j]) - level;
    }

    const interp = (a, b, va, vb) => {
      if (Math.abs(vb - va) < 1e-15) return a;
      return a + (b - a) * (-va / (vb - va));
    };

    const segments = [];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        // corners: BL, BR, TL, TR
        const vBL = grid[j][i], vBR = grid[j][i + 1];
        const vTL = grid[j + 1][i], vTR = grid[j + 1][i + 1];
        if (![vBL, vBR, vTL, vTR].every(Number.isFinite)) continue;
        const posBL = vBL > 0, posBR = vBR > 0, posTL = vTL > 0, posTR = vTR > 0;

        const x0i = xs[i], x1i = xs[i + 1], y0j = ys[j], y1j = ys[j + 1];

        // crossing points on edges in CCW order: Bottom, Right, Top, Left
        const pts = [];
        if (posBL !== posBR) pts.push([interp(x0i, x1i, vBL, vBR), y0j]); // bottom
        if (posBR !== posTR) pts.push([x1i, interp(y0j, y1j, vBR, vTR)]); // right
        if (posTL !== posTR) pts.push([interp(x0i, x1i, vTL, vTR), y1j]); // top
        if (posBL !== posTL) pts.push([x0i, interp(y0j, y1j, vBL, vTL)]); // left

        if (pts.length === 4 && (vBL + vBR + vTL + vTR > 0) === posBL) pts.push(pts.shift());
        for (let k = 0; k + 1 < pts.length; k += 2) {
          segments.push([pts[k], pts[k + 1]]);
        }
      }
    }
    return segments;
  }

  /* ---------- ODE integration (RK4) for particle motion ---------- */
  // accel(state) returns acceleration given {pos:[x,y], vel:[vx,vy]}
  function integrateRK4(state, accel, dt) {
    const s = { pos: state.pos.slice(), vel: state.vel.slice() };
    const k1v = accel(s);
    const k1p = s.vel.slice();

    const s2 = { pos: V.add(s.pos, V.scale(k1p, dt / 2)), vel: V.add(s.vel, V.scale(k1v, dt / 2)) };
    const k2v = accel(s2);
    const k2p = s2.vel.slice();

    const s3 = { pos: V.add(s.pos, V.scale(k2p, dt / 2)), vel: V.add(s.vel, V.scale(k2v, dt / 2)) };
    const k3v = accel(s3);
    const k3p = s3.vel.slice();

    const s4 = { pos: V.add(s.pos, V.scale(k3p, dt)), vel: V.add(s.vel, V.scale(k3v, dt)) };
    const k4v = accel(s4);
    const k4p = s4.vel.slice();

    state.pos = V.add(s.pos, V.scale(V.add(k1p, V.add(V.scale(k2p, 2), V.add(V.scale(k3p, 2), k4p))), dt / 6));
    state.vel = V.add(s.vel, V.scale(V.add(k1v, V.add(V.scale(k2v, 2), V.add(V.scale(k3v, 2), k4v))), dt / 6));
    return state;
  }

  /* ---------- Magnetic field models ---------- */
  // Straight wire along z-axis carrying current I (A): B = mu0*I/(2*pi*r), azimuthal
  function magneticFieldWire(p, I) {
    const r = Math.hypot(p[0], p[1]);
    if (r < 1e-9) return [0, 0, 0];
    const B = PHY.mu0 * I / (2 * Math.PI * r);
    // azimuthal: (-y/r, x/r, 0)
    return [-B * p[1] / r, B * p[0] / r, 0];
  }

  // Magnetic dipole (bar magnet) along x-axis with moment m (A·m²)
  function magneticFieldDipole(p, m) {
    const r = V3.len(p);
    if (r < 1e-9) return [0, 0, 0];
    const mu = m; // dipole along +x
    const rHat = V3.scale(p, 1 / r);
    const cos = rHat[0];
    const pre = (PHY.mu0 * mu) / (4 * Math.PI * r * r * r);
    // B = (mu0/(4π r³)) [ 3(m·r̂)r̂ - m ]
    const term = V3.scale(rHat, 3 * cos);
    const mVec = [1, 0, 0];
    const b = V3.scale(V3.sub(term, mVec), pre);
    return b;
  }

  // Lorentz acceleration: a = (q/m)(E + v×B)
  function lorentzAccel(q, mass, E, B) {
    return function (state) {
      const v = state.vel;
      const vCrossB = V3.cross(v, B(state.pos));
      const total = V3.add(E(state.pos), vCrossB);
      return V3.scale(total, q / mass);
    };
  }

  /* ---------- Formatting helpers ---------- */
  function fmt(x, digits) {
    if (!Number.isFinite(x)) return "—";
    if (x === 0) return "0";
    const a = Math.abs(x);
    if (a >= 1e5 || a < 1e-4) {
      const e = Math.floor(Math.log10(a));
      const mant = x / Math.pow(10, e);
      return `${mant.toFixed(2)}e${e}`;
    }
    return x.toFixed(digits != null ? digits : 2);
  }

  function fmtSI(x, digits) {
    if (!Number.isFinite(x)) return "—";
    if (x === 0) return "0";
    const a = Math.abs(x);
    const units = [
      [1e9, "G"], [1e6, "M"], [1e3, "k"], [1, ""],
      [1e-3, "m"], [1e-6, "µ"], [1e-9, "n"], [1e-12, "p"], [1e-15, "f"],
    ];
    for (const [f, p] of units) {
      if (a >= f || f === 1e-15) {
        return (x / f).toFixed(digits != null ? digits : 2) + " " + p;
      }
    }
    return x.toFixed(digits != null ? digits : 2);
  }

  global.PHY = PHY;
  global.V = V;
  global.V3 = V3;
  global.electricField2D = electricField2D;
  global.electricField3D = electricField3D;
  global.potential2D = potential2D;
  global.potential3D = potential3D;
  global.traceSpatialLine = traceSpatialLine;
  global.crossedFieldParameters = crossedFieldParameters;
  global.plateCapacitor = plateCapacitor;
  global.capacitorPair = capacitorPair;
  global.sourceWithResistance = sourceWithResistance;
  global.uniformMagneticFlux = uniformMagneticFlux;
  global.traceFieldLine = traceFieldLine;
  global.marchingSquares = marchingSquares;
  global.integrateRK4 = integrateRK4;
  global.magneticFieldWire = magneticFieldWire;
  global.magneticFieldDipole = magneticFieldDipole;
  global.lorentzAccel = lorentzAccel;
  global.fmt = fmt;
  global.fmtSI = fmtSI;
})(window);
