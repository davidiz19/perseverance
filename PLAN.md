# Plan: Paisaje de Marte cinematográfico (Vite + Three.js)

## Contexto
El usuario quiere ver algo en vivo en <2 min y luego iterar con verificación automática por captura (máx. 3 rondas).

## Paso 1 — Arranque rápido (<2 min)
- Crear a mano `package.json` (vite, three, playwright-core como devDeps), `index.html`, `src/main.js` mínimo (terreno + cielo + luz).
- `npm install` y `npm run dev -- --host --port 5173` en background. Avisar URL `http://localhost:5173`.

## Paso 2 — Escena completa (`src/main.js` + módulos en `src/`)
- **Terreno**: PlaneGeometry grande con ruido (simplex propio) multi-octava + función de dunas (crestas sinusoidales deformadas por ruido), colores por vértice ocre/óxido.
- **Rocas**: Icosaedros deformados con ruido, InstancedMesh, dispersas, castShadow.
- **Cielo**: esfera con ShaderMaterial gradiente caramelo/butterscotch, halo azulado alrededor del sol (rasgo real del atardecer marciano), `FogExp2` color polvo.
- **Sol de tarde**: DirectionalLight cálido bajo, sombras PCFSoft, HemisphereLight + ambiente; disco solar en el shader.
- **Lunas**: Fobos (irregular, más grande) y Deimos (pequeña) como esferas deformadas emissive tenue en el cielo.
- **Polvo**: Points flotando animados.
- **Post**: ACESFilmic tone mapping, sRGB; OrbitControls con leve auto-rotación.

## Paso 3 — `npm run check` (`scripts/check.mjs`)
- `playwright-core` con `chromium.launch({ channel: 'chrome', headless: true })` (Chrome del sistema, sin descargar navegadores). Fallback `executablePath` a `/usr/bin/google-chrome` si falla.
- Abre `http://localhost:5173`, espera ~3 s, guarda `screenshots/check.png`, imprime errores de consola y `pageerror`; exit code 1 si hay errores.
- Flags WebGL: `--use-angle=swiftshader --enable-unsafe-swiftshader` para render headless.

## Verificación
Tras cada mejora grande: `npm run check`, leer `screenshots/check.png` con Read, corregir. Máx. 3 rondas. Listo cuando 0 errores y la captura muestra dunas, rocas, cielo caramelo con polvo, sol cálido con sombras y las dos lunas.
