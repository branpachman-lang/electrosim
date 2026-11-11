# ElectroSim · Laboratorio interactivo de Física II

Abre `index.html` en Chrome, Edge o Firefox. La aplicación funciona de forma local y sin conexión. La barra superior abre **Inicio** y las tarjetas de cada unidad. En **Inicio** está la guía rápida de uso.

## Cobertura del producto final

| Unidad | Experimento |
| --- | --- |
| 1 · Campo eléctrico | Coloca hasta diez cargas, ajusta sus coordenadas y valores en nC, y compara la sección XY con las líneas y superficies equipotenciales en 3D. |
| 1 · Potencial | Coloca dos sondas X, Y, Z. Compara sus potenciales y calcula el trabajo de A a B sobre una carga de prueba. |
| 1 · Trayectoria | Lanza una partícula en el plano XY, con velocidad, ángulo y q/m editables, y mide tiempo, campo, aceleración y rapidez. |
| 2 · Capacitores | Varía área, separación y permitividad con batería conectada o con carga fija. Compara dos capacitores en serie y en paralelo. |
| 3 · Corriente | Compara corrientes y voltajes por rama. Grafica la ley de Ohm con una fuente ideal o con resistencia interna, o coloca medidores en el taller. |
| 4 · Magnetismo | Compara el campo de un imán dipolar, un cable recto y un solenoide finito en 2D o 3D. |
| 4 · Flujo | Orienta una superficie 3D y mide el flujo con signo, el campo normal y el área proyectada. |
| 4 · Lorentz | Lanza una partícula en el plano XY con campos uniformes cruzados y compara radio, deriva y frecuencia angular. |

El código fuente, la guía web y este documento técnico están en la carpeta del proyecto. La publicación del repositorio, la grabación del video de 5 a 10 minutos y la defensa en clase son entregables separados.

## Prácticas de clase

| Material | Práctica |
| --- | --- |
| Potencial eléctrico, §§23.1–23.5 | Con el dipolo inicial, pon A y B sobre x = 0. Comprueba que sus potenciales coinciden y que el trabajo entre ellos es cero aunque exista un campo eléctrico. |
| Capacitancia y dieléctricos, §§24.2–24.4 | Compara 6 µF y 3 µF con 18 V, como en el ejemplo 24.5. Luego duplica la permitividad de las placas en los modos conectado y aislado. |
| Corriente y fuerza electromotriz, §§25.3–25.5 | En Ohm, usa ε = 12 V, R = 120 Ω y r = 40 Ω. El circuito conduce 75 mA y el resistor recibe 9 V. |
| Circuitos de corriente directa, §§26.1–26.4 | Compara el reparto de corriente en serie, paralelo y mixto. Carga el ejemplo **Amperímetro y voltímetro** para medir 100 mA en serie y 12 V en paralelo con el resistor. |
| Campo magnético, §§27.3–27.5 | Con B = 0,5 T y A = 9 m², alterna entre 0°, 90° y 180° para medir 4,5 Wb, 0 Wb y −4,5 Wb. |

## Taller de circuitos

1. Abre **Corriente y circuitos → Taller de circuitos**. Carga un ejemplo o selecciona **Circuito vacío**.
2. Selecciona un componente y toca dos puntos de la cuadrícula. Con teclado, enfoca el esquema, usa las flechas y presiona Enter en cada extremo. El amperímetro ideal va en serie y el voltímetro ideal en paralelo.
3. Para crear una unión, termina los segmentos en el mismo punto. Un segmento que cruza otro no establece contacto por sí solo.
4. Selecciona una rama en el esquema o la tabla para cambiar su valor, invertirla o mover sus terminales. Para retirarla, usa el botón **Quitar** junto al esquema. También puedes activar **Quitar** en la barra de herramientas y tocar directamente cada rama que quieras eliminar. Los voltajes se miden como V(A) − V(B) y la corriente positiva va de A hacia B.
5. **Simular** inicia la evolución temporal. **Un paso** avanza exactamente el paso indicado. Para cambios rápidos, reduce el paso en segundos. Selecciona una rama y elige voltaje, corriente o potencia en el osciloscopio.
6. El taller intenta guardar el último esquema en el navegador. Usa **Exportar** e **Importar** para guardar y recuperar distintos circuitos. Cargar otro ejemplo reemplaza el esquema activo.

El ejemplo RC aplica 5 V a un capacitor de 1000 µF a través de 1 kΩ. La constante de tiempo es 1 s. Con voltaje inicial cero, el capacitor alcanza aproximadamente 3,16 V al cabo de 1 s y se acerca a 5 V.

## Fundamentos y métodos

- **Electrostática.** Superposición de Coulomb con distancias en metros y conversión de nC a C. En el punto exacto de una carga no nula, el modelo es singular. La sección 2D usa las componentes de E en XY y el potencial en z = 0. Marching squares aproxima los contornos del plano. Marching tetrahedra aproxima las isosuperficies mediante una malla tridimensional. La posición, la resolución de la malla y el nivel elegido determinan qué porción de la superficie se ve.
- **Trayectorias.** RK4 integra posición y velocidad usando la aceleración instantánea. El cálculo es clásico y está restringido a XY. La trayectoria eléctrica se detiene al acercarse a una carga o salir de la zona visible.
- **Capacitores.** Placas paralelas ideales y dieléctrico uniforme. C = ε₀εᵣA/d, Q = CV y U = ½CV². E = V/d representa el campo uniforme entre placas. Al aislar las placas, la carga que tenían en ese momento se conserva.
- **Circuitos.** El análisis nodal modificado aplica las leyes de Kirchhoff, combina nodos unidos por conductores ideales y establece una referencia por isla. En régimen DC, el capacitor ideal se comporta como circuito abierto. El transitorio usa Euler implícito, con I = C(V actual − V anterior)/Δt. El paso afecta la precisión. Las fuentes son continuas y los componentes son ideales. Las lecturas indeterminadas se marcan con un guion, por ejemplo si un lazo de cables permite varias distribuciones de corriente.
- **Magnetismo.** El imán usa un dipolo ideal. Para el cable se usa B = μ₀I/(2πr). El solenoide se modela como ocho espiras y el campo se calcula sumando contribuciones discretizadas de Biot–Savart. El flujo por una superficie plana en un campo uniforme es B·A·cos(θ), con θ medido respecto a la normal. En Lorentz, F = q(E + v × B). El radio en campos cruzados se calcula con la velocidad relativa a la deriva E × B/B².

## Arquitectura

| Archivo | Responsabilidad |
| --- | --- |
| `index.html`, `css/styles.css`, `js/app.js` | Navegación, guía, estilos y montaje de módulos. |
| `js/ui.js` | Controles, lecturas y lienzos compartidos. |
| `js/physics.js`, `js/field-view.js` | Física vectorial, integración, superficies y proyección 3D interactiva. |
| `js/sim_unit1.js` a `js/sim_unit4.js` | Experimentos de las cuatro unidades. |
| `js/circuit.js`, `js/circuit-lab.js` | Resolución de circuitos y editor interactivo con mediciones. |

## Validación

Ejecuta `node --test tests/physics.test.js` con Node.js para reproducir los casos numéricos.

| Caso | Referencia |
| --- | --- |
| Una carga de 1 nC a 1 m | 8,9875 V y 8,9875 V/m. |
| Equipotencial de 8,9875 V de una carga de 1 nC | Esfera de radio 1 m, aproximada por una malla. |
| Cable recto de 5 A a 1 m | 1 µT. |
| Lorentz con Eᵧ = 0,5 V/m y B_z = 0,2 T | Una partícula lanzada a 2,5 m/s en X mantiene trayectoria recta. |
| 12 V con 100 Ω y 200 Ω en serie | 40 mA, 4 V y 8 V en las resistencias, y 0,48 W total. |
| 12 V con 200 Ω y 300 Ω en paralelo | 100 mA de corriente total. |
| 12 V con 100 Ω en serie con 200 Ω en paralelo con 300 Ω | Resistencia equivalente de 220 Ω y corriente de 54,55 mA. |
| Carga RC de 5 V con constante de tiempo de 1 s | Aproximadamente 3,16 V al cabo de una constante de tiempo. |
| 6 µF y 3 µF con 18 V | En serie, 2 µF y 36 µC en cada capacitor. En paralelo, 9 µF y cargas de 108 µC y 54 µC. |
| Fuente de 12 V, R = 120 Ω y r = 40 Ω | 75 mA, 9 V en la carga, 0,675 W en la carga y 0,225 W en la resistencia interna. |
| Flujo con 0,5 T y 9 m² | 4,5 Wb a 0°, cero a 90° y −4,5 Wb a 180°. |
