const assert = require("node:assert/strict");
const { test } = require("node:test");

global.window = global;
require("../js/physics.js");
require("../js/field-view.js");
require("../js/circuit.js");

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
}

const part = (id, type, a, b, value, options) => ({ id, type, a, b, value, ...options });

test("cargas en nC, superposición y potencial singular", () => {
  const charges = [{ x: 0, y: 0, z: 0, q: 1 }];
  close(potential3D([0, 0, 1], charges), 8.9875);
  close(electricField3D([0, 0, 1], charges)[2], 8.9875);
  assert.ok(Number.isNaN(potential3D([0, 0, 0], charges)));
  const dipole = [{ x: -2.4, y: 0, q: 2 }, { x: 2.4, y: 0, q: -2 }];
  close(potential3D([0, 1, 2], dipole), 0);
  const raised = [{ x: 1, y: 0, z: 1, q: 1 }];
  close(electricField2D([0, 0], raised)[0], electricField3D([0, 0, 0], raised)[0]);
});

test("la malla equipotencial de una carga aproxima una esfera", () => {
  const field = (point) => potential3D(point, [{ x: 0, y: 0, z: 0, q: 1 }]);
  const triangles = equipotentialSurfaces(field, [4, 4, 4], [{ value: 8.9875, color: "red" }]);
  assert.ok(triangles.length > 100);
  for (const { points } of triangles) {
    for (const point of points) close(V3.len(point), 1, 0.075);
  }
});

test("campo de un cable y movimiento recto a la velocidad de deriva", () => {
  close(magneticFieldWire([1, 0, 0], 5)[1], 1e-6);
  assert.deepEqual(crossedFieldParameters(2.5, 0, 0.5, 0.2, 2), { drift: 2.5, omega: 0.4, radius: 0 });
  const state = { pos: [0, 0], vel: [2.5, 0] };
  for (let i = 0; i < 100; i++) {
    integrateRK4(state, (s) => [2 * s.vel[1] * 0.2, 2 * (0.5 - s.vel[0] * 0.2)], 0.01);
  }
  close(state.pos[0], 2.5);
  close(state.pos[1], 0);
});

test("circuitos serie, paralelo y mixto con potencia por rama", () => {
  const source = part(1, "V", 1, 0, 12);
  const first = part(2, "R", 1, 2, 100), second = part(3, "R", 2, 0, 200);
  const series = solveCircuit([source, first, second]).results;
  close(series.get(2).amps, 0.04);
  close(series.get(2).volts, 4);
  close(series.get(3).watts, 0.32);
  close(series.get(1).watts, -0.48);
  const parallel = solveCircuit([source, part(2, "R", 1, 0, 200), part(3, "R", 1, 0, 300)]).results;
  close(parallel.get(1).amps, -0.1);
  const mixed = solveCircuit([source, first, second, part(4, "R", 2, 0, 300)]).results;
  close(mixed.get(1).amps, -12 / 220);
});

test("fuente de corriente, cable e interruptor abierto", () => {
  const result = solveCircuit([part(1, "I", 0, 1, 0.01), part(2, "R", 1, 0, 2000),
    part(3, "W", 0, 2, 0), part(4, "R", 1, 2, 2000)]).results;
  close(result.get(1).volts, -10);
  close(result.get(3).amps, -0.005);
  const open = solveCircuit([part(1, "V", 1, 0, 5), part(2, "S", 1, 2, 0, { closed: false }),
    part(3, "R", 2, 3, 100)]).results;
  assert.equal(open.get(2).volts, null);
  close(open.get(3).amps, 0);
  assert.throws(() => solveCircuit([part(1, "V", 1, 0, 5), part(2, "W", 1, 0, 0)]));
  assert.throws(() => solveCircuit([part(1, "I", 1, 0, 0.001)]));
});

test("carga y descarga RC conservan el estado entre pasos", () => {
  const circuit = [part(1, "V", 1, 0, 5), part(2, "S", 1, 2, 0, { closed: true }),
    part(3, "R", 2, 3, 1000), part(4, "C", 3, 0, 0.001, { initial: 0 })];
  close(solveCircuit(circuit).results.get(4).volts, 5);
  let previous;
  for (let i = 0; i < 1000; i++) previous = solveCircuit(circuit, { dt: 0.001, previous }).capacitorVoltages;
  close(previous.get(4), 5 * (1 - Math.exp(-1)), 0.001);
  const discharge = [part(1, "S", 1, 2, 0, { closed: true }), part(2, "R", 2, 0, 1000),
    part(4, "C", 1, 0, 0.001, { initial: 5 })];
  close(solveCircuit(discharge, { dt: 0.01 }).results.get(4).volts, 5 / 1.01);
  close(solveCircuit(discharge, { dt: 0.01, previous }).results.get(4).volts, previous.get(4) / 1.01);
});

test("el LED conduce en directa y se atenúa con la descarga del capacitor", () => {
  const led = part(3, "LED", 2, 0, 2);
  const resistor = part(2, "R", 1, 2, 220);
  const source = part(1, "V", 1, 0, 5);
  const lit = solveCircuit([source, resistor, led]).results.get(3);
  close(lit.amps, (5 - 2) / 230, 1e-8);
  close(lit.brightness, 100 * lit.amps / 0.02, 1e-4);
  assert.equal(solveCircuit([source, resistor, { ...led, a: 0, b: 2 }]).results.get(3).brightness, 0);
  assert.equal(solveCircuit([{ ...source, value: 1 }, resistor, led]).results.get(3).brightness, 0);

  const discharge = (capacitance) => {
    const parts = [part(1, "C", 1, 0, capacitance, { initial: 5 }), resistor, led];
    let previous, brightness = Infinity;
    for (let step = 1; step <= 3000; step++) {
      const solution = solveCircuit(parts, { dt: 0.01, previous });
      const next = solution.results.get(3).brightness;
      assert.ok(next <= brightness);
      if (next < circuitActivityThresholds.LED) return step * 0.01;
      brightness = next;
      previous = solution.capacitorVoltages;
    }
    assert.fail("El brillo no cayó por debajo del umbral");
  };
  const duration = discharge(0.01);
  close(duration, 0.01 * 230 * Math.log(3 / (0.0002 * 230)), 0.03);
  close(discharge(0.02), 2 * duration, 0.05);
});

test("el motor arranca, pierde velocidad al descargarse el capacitor y responde a la carga", () => {
  const motor = part(2, "M", 1, 0, 30);
  const source = part(1, "V", 1, 0, 5);
  const speed = (voltage, load = 1) =>
    solveCircuit([{ ...source, value: voltage }, { ...motor, load }]).results.get(2).rpm;
  close(speed(5), 625 * 60 / (2 * Math.PI));
  close(speed(-5), -speed(5));
  assert.ok(speed(5, 4) < speed(5));
  assert.ok(speed(3) < speed(5));
  const parts = [part(1, "C", 1, 0, 0.022, { initial: 5 }), motor];
  let previous, motorSpeeds, peak = 0, rpm;
  for (let i = 0; i < 1000; i++) {
    const solution = solveCircuit(parts, { dt: 0.01, previous, motorSpeeds });
    rpm = solution.results.get(2).rpm;
    if (!i) assert.ok(rpm > 0 && rpm < 0.1 * speed(5));
    peak = Math.max(peak, rpm);
    ({ capacitorVoltages: previous, motorSpeeds } = solution);
  }
  assert.ok(peak > 3000);
  assert.ok(Math.abs(rpm) < circuitActivityThresholds.M);
  assert.ok(previous.get(1) < 0.1);
});

test("el dieléctrico conserva V conectado y conserva Q aislado", () => {
  const original = plateCapacitor(0.1, 0.002, 1, 12);
  const connected = plateCapacitor(0.1, 0.002, 2, 12);
  const isolated = plateCapacitor(0.1, 0.002, 2, 12, original.charge);
  close(connected.capacitance, 2 * original.capacitance, 1e-18);
  close(connected.charge, 2 * original.charge, 1e-18);
  close(connected.voltage, original.voltage);
  close(isolated.charge, original.charge, 1e-18);
  close(isolated.voltage, original.voltage / 2);
  close(isolated.energy, original.energy / 2, 1e-18);
});

test("dos capacitores de 6 µF y 3 µF a 18 V en serie y paralelo", () => {
  const series = capacitorPair(6e-6, 3e-6, 18, true);
  close(series.equivalent * 1e6, 2);
  close(series.charges[0] * 1e6, 36);
  assert.equal(series.charges[0], series.charges[1]);
  close(series.voltages[0], 6);
  close(series.voltages[1], 12);
  const parallel = capacitorPair(6e-6, 3e-6, 18, false);
  close(parallel.equivalent * 1e6, 9);
  close(parallel.charges[0] * 1e6, 108);
  close(parallel.charges[1] * 1e6, 54);
  assert.deepEqual(parallel.voltages, [18, 18]);
});

test("fuente con resistencia interna y potencia disipada", () => {
  const ideal = sourceWithResistance(12, 120, 0);
  close(ideal.current, 0.1);
  close(ideal.terminal, 12);
  const loaded = sourceWithResistance(12, 120, 40);
  close(loaded.current, 0.075);
  close(loaded.terminal, 9);
  close(loaded.power, 0.675);
  close(loaded.loss, 0.225);
});

test("amperímetro y voltímetro ideales en serie y paralelo", () => {
  const branches = [part(1, "V", 1, 0, 12), part(2, "AM", 1, 2, 0),
    part(3, "R", 2, 0, 120), part(4, "VM", 2, 0, 0)];
  const readings = solveCircuit(branches).results;
  close(readings.get(2).amps, 0.1);
  close(readings.get(2).volts, 0);
  close(readings.get(4).volts, 12);
  close(readings.get(4).amps, 0);
  assert.throws(() => solveCircuit([branches[0], part(2, "AM", 1, 0, 0)]));
});

test("flujo magnético positivo, nulo y negativo según la orientación", () => {
  close(uniformMagneticFlux(0.5, 9, 0).flux, 4.5);
  close(uniformMagneticFlux(0.5, 9, 90).flux, 0);
  close(uniformMagneticFlux(0.5, 9, 180).flux, -4.5);
  close(uniformMagneticFlux(0.5, 9, 180).projectedArea, 9);
});
