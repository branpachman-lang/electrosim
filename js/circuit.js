/* Modified nodal analysis for DC circuits and transients. */
(function (global) {
  "use strict";

  const ledSlope = 1 / 10;
  const ledLeakage = 1e-9;
  const ledReferenceCurrent = 0.02;
  const ledVisibleCurrent = 0.0002;
  const motorVisibleRpm = 100;
  const motorConstant = 0.005; // V·s/rad and N·m/A
  const motorInertia = 2e-7;  // kg·m²
  const motorDrag = 5e-7;     // N·m·s/rad at load 1

  function solveMatrix(matrix, rhs) {
    const size = rhs.length;
    const scale = matrix.map((row) => Math.max(...row.map(Math.abs)));
    for (let column = 0; column < size; column++) {
      let pivot = column, best = 0;
      for (let row = column; row < size; row++) {
        const score = Math.abs(matrix[row][column]) / (scale[row] || 1);
        if (score > best) { pivot = row; best = score; }
      }
      if (best < 1e-13) throw new Error("El circuito no tiene una solución única. Revisa fuentes ideales en paralelo, cortocircuitos y caminos de retorno.");
      [matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]];
      [rhs[column], rhs[pivot]] = [rhs[pivot], rhs[column]];
      [scale[column], scale[pivot]] = [scale[pivot], scale[column]];
      for (let row = column + 1; row < size; row++) {
        const factor = matrix[row][column] / matrix[column][column];
        if (factor === 0) continue;
        for (let j = column + 1; j < size; j++) matrix[row][j] -= factor * matrix[column][j];
        matrix[row][column] = 0;
        rhs[row] -= factor * rhs[column];
      }
    }
    for (let i = size - 1; i >= 0; i--) {
      for (let j = i + 1; j < size; j++) rhs[i] -= matrix[i][j] * rhs[j];
      rhs[i] /= matrix[i][i];
    }
    return rhs;
  }

  const ledVoltage = ({ a, b }, solution) => (solution[a] ?? 0) - (solution[b] ?? 0);
  const ledForwardCurrent = (volts, threshold) => ledSlope * Math.max(0, volts - threshold);

  function solveWithLeds(matrix, rhs, leds) {
    const copy = () => matrix.map((row) => row.slice());
    let solution = solveMatrix(copy(), rhs.slice());

    function residual(values) {
      const mismatch = matrix.map((row, i) => row.reduce((sum, value, j) => sum + value * values[j], -rhs[i]));
      for (const led of leds) {
        const current = ledForwardCurrent(ledVoltage(led, values), led.threshold);
        if (led.a !== undefined) mismatch[led.a] += current;
        if (led.b !== undefined) mismatch[led.b] -= current;
      }
      return mismatch;
    }

    const tolerance = 1e-8 + 8 * Number.EPSILON * Math.hypot(...rhs);
    for (let iteration = 0; iteration < 40; iteration++) {
      if (Math.hypot(...residual(solution)) <= tolerance) return solution;
      const tangent = copy(), target = rhs.slice();
      for (const { a, b, threshold } of leds) {
        if (ledVoltage({ a, b }, solution) <= threshold) continue;
        if (a !== undefined) { tangent[a][a] += ledSlope; target[a] += ledSlope * threshold; }
        if (b !== undefined) { tangent[b][b] += ledSlope; target[b] -= ledSlope * threshold; }
        if (a !== undefined && b !== undefined) { tangent[a][b] -= ledSlope; tangent[b][a] -= ledSlope; }
      }
      const next = solveMatrix(tangent, target);
      const nextResidual = residual(next);
      if (Math.hypot(...nextResidual) <= tolerance) return next;
      const direction = next.map((value, i) => value - solution[i]);
      const along = (fraction) => solution.map((value, i) => value + fraction * direction[i]);
      const slope = (mismatch) => mismatch.reduce((sum, value, i) => sum + value * direction[i], 0);
      // The nodal objective is convex along this step, which keeps source voltages fixed.
      // Find the minimum on the segment when crossing LED thresholds would overshoot it.
      if (slope(nextResidual) <= 0) {
        solution = next;
      } else {
        let low = 0, high = 1;
        for (let bisect = 0; bisect < 24; bisect++) {
          const middle = (low + high) / 2;
          if (slope(residual(along(middle))) > 0) high = middle;
          else low = middle;
        }
        solution = along((low + high) / 2);
      }
    }
    throw new Error("No se pudo calcular el estado de los LEDs. Revisa sus conexiones o reduce el paso de simulación.");
  }

  function solveCircuit(components, { dt = 0, previous = new Map(), motorSpeeds = new Map() } = {}) {
    const nodes = [...new Set(components.flatMap(({ a, b }) => [a, b]))];
    function groups(items) {
      const parents = new Map(items.map((node) => [node, node]));
      function find(node) {
        while (parents.get(node) !== node) {
          parents.set(node, parents.get(parents.get(node)));
          node = parents.get(node);
        }
        return node;
      }
      return { find, join: (a, b) => parents.set(find(a), find(b)) };
    }
    const isShort = (part) => part.type === "W" || part.type === "AM" || (part.type === "S" && part.closed);
    const connected = groups(nodes);
    for (const part of components) if (isShort(part)) connected.join(part.a, part.b);
    const inertia = dt > 0 ? motorInertia / dt : 0;
    const branches = components.map((part) => {
      const branch = { ...part, na: connected.find(part.a), nb: connected.find(part.b), g: 0, current: 0 };
      if (part.type === "R") branch.g = 1 / part.value;
      if (part.type === "C" && dt > 0) {
        branch.g = part.value / dt;
        branch.current = -branch.g * (previous.get(part.id) ?? part.initial ?? 0);
      }
      if (part.type === "I") branch.current = part.value;
      if (part.type === "LED") branch.g = ledLeakage;
      if (part.type === "M") {
        const damping = inertia + motorDrag * (part.load ?? 1);
        const denominator = damping + motorConstant ** 2 / part.value;
        const history = inertia * (motorSpeeds.get(part.id) ?? 0);
        branch.g = damping / (part.value * denominator);
        branch.current = -motorConstant * history / (part.value * denominator);
        branch.speedAt = (volts) => (history + motorConstant * volts / part.value) / denominator;
      }
      return branch;
    });
    const nets = [...new Set(nodes.map(connected.find))];
    const islands = groups(nets);
    for (const part of branches) {
      if (part.g || part.type === "V" || part.type === "I") islands.join(part.na, part.nb);
    }
    const unknowns = new Map(nets.filter((node) => islands.find(node) !== node).map((node, i) => [node, i]));
    const voltageSources = branches.filter((part) => part.type === "V");
    const sourceRows = new Map(voltageSources.map((part, i) => [part.id, unknowns.size + i]));
    const size = unknowns.size + voltageSources.length;
    const matrix = Array.from({ length: size }, () => new Float64Array(size));
    const rhs = new Float64Array(size);
    const stamp = (row, col, value) => {
      if (row !== undefined && col !== undefined) matrix[row][col] += value;
    };
    const leds = [];
    for (const part of branches) {
      const a = unknowns.get(part.na), b = unknowns.get(part.nb);
      const { g, current } = part;
      stamp(a, a, g); stamp(a, b, -g);
      stamp(b, b, g); stamp(b, a, -g);
      if (a !== undefined) rhs[a] -= current;
      if (b !== undefined) rhs[b] += current;
      if (part.type === "LED" && a !== b) leds.push({ a, b, threshold: part.value });
      if (part.type === "V") {
        const row = sourceRows.get(part.id);
        stamp(a, row, 1); stamp(row, a, 1);
        stamp(b, row, -1); stamp(row, b, -1);
        rhs[row] = part.value;
      }
    }

    const solution = leds.length ? solveWithLeds(matrix, rhs, leds) : solveMatrix(matrix, rhs);
    const voltage = (net) => solution[unknowns.get(net)] ?? 0;
    const capacitorVoltages = new Map();
    const nextMotorSpeeds = new Map();
    const results = new Map();
    for (const part of branches) {
      const sameIsland = islands.find(part.na) === islands.find(part.nb);
      const volts = sameIsland ? voltage(part.na) - voltage(part.nb) : null;
      const reading = { volts };
      let amps = null;
      switch (part.type) {
        case "R": amps = volts / part.value; break;
        case "C":
          amps = dt > 0 ? (part.value / dt) * (volts - (previous.get(part.id) ?? part.initial ?? 0)) : 0;
          if (volts !== null) capacitorVoltages.set(part.id, volts);
          break;
        case "V": amps = solution[sourceRows.get(part.id)]; break;
        case "I": amps = part.value; break;
        case "LED": {
          const forward = ledForwardCurrent(volts, part.value);
          amps = forward + ledLeakage * volts;
          reading.brightness = 100 * forward / ledReferenceCurrent;
          break;
        }
        case "M": {
          amps = part.g * volts + part.current;
          const speed = part.speedAt(volts);
          nextMotorSpeeds.set(part.id, speed);
          reading.rpm = speed * 60 / (2 * Math.PI);
          break;
        }
        case "VM": amps = 0; break;
        case "S": if (!part.closed) amps = 0; break;
      }
      reading.amps = amps;
      reading.watts = volts !== null && amps !== null ? volts * amps : null;
      results.set(part.id, reading);
    }
    const shorts = branches.filter(isShort);
    for (const part of shorts) {
      // Kirchhoff determines a short's current only if there is no alternate ideal path.
      const side = new Set([part.a]);
      const queue = [part.a];
      for (const node of queue) {
        for (const other of shorts) {
          if (part === other) continue;
          const next = other.a === node ? other.b : other.b === node ? other.a : null;
          if (next === null || side.has(next)) continue;
          side.add(next);
          queue.push(next);
        }
      }
      if (side.has(part.b)) continue;
      let amps = 0;
      for (const other of branches) {
        if (isShort(other)) continue;
        amps -= (Number(side.has(other.a)) - Number(side.has(other.b))) * (results.get(other.id).amps ?? 0);
      }
      results.set(part.id, { volts: 0, amps, watts: 0 });
    }
    const nodeVoltages = new Map(nodes.map((node) => {
      const net = connected.find(node);
      return [node, { value: voltage(net), reference: islands.find(net) }];
    }));
    return { results, capacitorVoltages, motorSpeeds: nextMotorSpeeds, nodeVoltages };
  }

  global.circuitActivityThresholds = { LED: 100 * ledVisibleCurrent / ledReferenceCurrent, M: motorVisibleRpm };
  global.solveCircuit = solveCircuit;
})(window);
