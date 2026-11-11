/* Modified nodal analysis for ideal DC sources, resistors and RC transients. */
(function (global) {
  "use strict";

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

  function solveCircuit(components, { dt = 0, previous = new Map() } = {}) {
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
    const branches = components.map((part) => ({
      ...part, na: connected.find(part.a), nb: connected.find(part.b),
    }));
    const nets = [...new Set(nodes.map(connected.find))];
    const islands = groups(nets);
    const conductance = (part) => {
      if (part.type === "R") return 1 / part.value;
      if (part.type === "C" && dt > 0) return part.value / dt;
      return 0;
    };
    for (const part of branches) {
      if (conductance(part) || part.type === "V" || part.type === "I") islands.join(part.na, part.nb);
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
    for (const part of branches) {
      const a = unknowns.get(part.na), b = unknowns.get(part.nb);
      const g = conductance(part);
      const oldVoltage = previous.get(part.id) ?? part.initial ?? 0;
      const current = part.type === "I" ? part.value : part.type === "C" ? -g * oldVoltage : 0;
      stamp(a, a, g); stamp(a, b, -g);
      stamp(b, b, g); stamp(b, a, -g);
      if (a !== undefined) rhs[a] -= current;
      if (b !== undefined) rhs[b] += current;
      if (part.type === "V") {
        const row = sourceRows.get(part.id);
        stamp(a, row, 1); stamp(row, a, 1);
        stamp(b, row, -1); stamp(row, b, -1);
        rhs[row] = part.value;
      }
    }

    const solution = solveMatrix(matrix, rhs);
    const voltage = (net) => solution[unknowns.get(net)] ?? 0;
    const capacitorVoltages = new Map();
    const results = new Map();
    for (const part of branches) {
      const sameIsland = islands.find(part.na) === islands.find(part.nb);
      const volts = sameIsland ? voltage(part.na) - voltage(part.nb) : null;
      let amps = null;
      switch (part.type) {
        case "R": amps = volts / part.value; break;
        case "C":
          amps = dt > 0 ? (part.value / dt) * (volts - (previous.get(part.id) ?? part.initial ?? 0)) : 0;
          if (volts !== null) capacitorVoltages.set(part.id, volts);
          break;
        case "V": amps = solution[sourceRows.get(part.id)]; break;
        case "I": amps = part.value; break;
        case "VM": amps = 0; break;
        case "S": if (!part.closed) amps = 0; break;
      }
      results.set(part.id, { volts, amps, watts: volts !== null && amps !== null ? volts * amps : null });
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
    return { results, capacitorVoltages, nodeVoltages };
  }

  global.solveCircuit = solveCircuit;
})(window);
