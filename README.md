# Perseverance

Simulación 3D en el navegador del rover **Perseverance** de la NASA en Marte. Manejas el rover por un paisaje de dunas al atardecer, con el cielo caramelo, Fobos y Deimos. Un panel de control de misión muestra telemetría real y las cámaras del rover enseñan fotos reales tomadas en Marte.

Hecho con [Vite](https://vitejs.dev/) y [Three.js](https://threejs.org/).

## Qué incluye

- **Paisaje de Marte**: dunas, rocas, polvo en suspensión, sol de tarde con sombras suaves y las dos lunas.
- **Rover oficial de la NASA** a tamaño real (3 m), con física de manejo:
  - las 6 ruedas giran y las 4 de las esquinas se orientan al virar;
  - el cuerpo se inclina según dónde apoya cada rueda;
  - las pendientes frenan o empujan con la gravedad de Marte;
  - las ruedas patinan en la arena y dejan huellas.
- **Control de misión** inspirado en [Open MCT](https://github.com/nasa/openmct):
  - distancia recorrida, altura del terreno e inclinación, del historial de manejos de la NASA;
  - tiempo de luz entre la Tierra y Marte, calculado en vivo.
- **Cámaras de Percy**: Mastcam-Z, Navcam, Hazcam frontal y WATSON. Al hacer clic muestran fotos reales del rover.

## Requisitos

- Node.js 18 o superior
- Google Chrome instalado, solo para `npm run check`

## Instalación

```bash
git clone https://github.com/davidiz19/perseverance.git
cd perseverance
npm install
```

## Uso

```bash
npm run dev
```

Abre http://localhost:5173.

| Control | Acción |
|---|---|
| `W` / `S` | Avanzar / retroceder |
| `A` / `D` | Girar (detenido, gira sobre sí mismo) |
| Ratón | Arrastrar para mirar alrededor, rueda para acercar |
| `T` | Mostrar u ocultar el control de misión |
| Clic en un punto azul del rover | Tomar una foto con esa cámara |
| `←` `→` / clic / `Esc` | Más fotos / ampliar / volver al juego |

### Comprobación automática

Con el servidor de desarrollo encendido:

```bash
npm run check
```

El script abre la página en Chrome sin ventana, con `playwright-core` y tu Chrome instalado, sin descargar navegadores. Hace estas comprobaciones:

- maneja el rover y verifica que las ruedas giran y se orientan;
- confirma que los 4 datos de telemetría cargan;
- prueba que la tecla `T` oculta el panel;
- hace clic en cada cámara para ver que abre su foto;
- lista los errores de consola.

Guarda capturas en `screenshots/`. Termina con código 1 si algo falla.

## Datos y créditos

- **Modelo 3D**: [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources), *Mars 2020 Perseverance Rover*.
- **Telemetría**: historial de manejos [MMGIS de la NASA/JPL](https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json).
  - El juego lo pide en vivo.
  - Si no responde, usa la copia guardada en `public/data/`.
  - `npm run check` siempre usa la copia (`?datos=copia`), porque el servidor de la NASA rechaza a Chrome sin ventana.
- **Tiempo de luz**: elementos orbitales aproximados de JPL (Standish).
- **Fotos**: [imágenes sin procesar de Mars 2020](https://mars.nasa.gov/mars2020/multimedia/raw-images/), NASA/JPL-Caltech (Mastcam-Z: NASA/JPL-Caltech/ASU). Elegidas a mano y guardadas en `public/photos/`.

## Estructura

```
src/
  main.js             escena, terreno, cielo, lunas, rover y cámara de seguimiento
  roverPhysics.js     ruedas, suspensión y dinámica de manejo
  cameras.js          puntos de cámara, obturador y visor de fotos
  missionControl.js   panel de control de misión (tecla T)
  telemetry/          API de telemetría estilo Open MCT y sus proveedores
scripts/check.mjs     comprobación automática con Chrome sin ventana
public/               modelo 3D, decodificador Draco, datos y fotos
```
