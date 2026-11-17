# PintORTillo 🎨

Juego de **dibujar y adivinar** multijugador en tiempo real, de 2 a 20 jugadores por sala, con Node.js, Express y Socket.IO. El cliente es HTML, CSS y JavaScript sin compilación.

En cada turno alguien dibuja una palabra secreta y el resto la adivina por el chat. Cuanto más rápido adivinás, más puntos. El banco tiene **más de 4300 palabras en español** y no se repiten dentro de la sala.

---

## 1. Cómo correrlo

Necesitás **Node.js 18.17 o superior**: <https://nodejs.org> (versión LTS).

```bash
npm install
```

```bash
npm test
```

```bash
npm start
```

Abrí <http://localhost:3000>. Para probar solo, abrí 3 pestañas: una normal y dos de incógnito.

### Jugar online con amigos que están en otro lado (doble clic)

1. Descomprimí el zip con **clic derecho → Extraer todo**.
2. Doble clic en **`JUGAR-ONLINE-Windows.bat`**, o en **`JUGAR-ONLINE-Mac.command`** en Mac (la primera vez: clic derecho → Abrir).
3. Aparece un link `https://….trycloudflare.com`: pasáselo a tus amigos.

Si tu red bloquea el túnel (pasa en redes de colegio o trabajo), usá los datos del celular o publicalo en Render (ver abajo).

### Scripts

| Script | Qué hace |
|---|---|
| `npm start` | Servidor en `PORT` (3000 por defecto) |
| `npm run dev` | Igual, con recarga automática |
| `npm test` | Tests del motor y del servidor (Vitest) |
| `npm run online` | Levanta el juego y lo publica con un link temporal de Cloudflare |
| `npm run e2e` | Prueba con navegadores reales. Requiere `npm i -D playwright` y `npx playwright install chromium` |
| `npm run words` | Regenera el banco de palabras desde `engine/words/es*.txt` |

Variables de entorno: `PORT` y `DISCONNECT_GRACE_MS` (gracia antes de dar por ido a alguien desconectado; por defecto 10000).

## 2. Despliegue

**Render (gratis):** subí el proyecto a GitHub y en Render entrá a **New → Blueprint**, elegí el repo y tocá **Apply**. El `render.yaml` ya está incluido. En el plan gratis el servidor se duerme tras 15 minutos sin uso y tarda alrededor de un minuto en despertar.

**Railway:** New Project → Deploy from GitHub repo. Detecta Node y usa `npm start`.

Desplegá **una sola instancia**: las salas viven en memoria.

---

## 3. Cómo se juega

- **Inicio:** poné tu nombre y armá tu personaje (color, ojos, boca, accesorio o 🎲 al azar).
  - **¡Jugar!** te mete en una sala pública con lugar; si no hay, crea una.
  - **Crear sala privada** te da un código para compartir.
  - **Unirse** con un código, o con el enlace `/?sala=CODIGO`.
- **Sala de espera:** el anfitrión (👑) ajusta todo y toca **¡Empezar!** (mínimo 2 jugadores). Las salas públicas arrancan solas a los 10 segundos de tener 2 jugadores.
- **Turno:** el dibujante elige 1 de 3 palabras en 15 segundos (si no elige, se elige una al azar). Mientras dibuja, el resto escribe en el chat.
  - Si escribís la palabra, no se muestra: todos ven "**X adivinó la palabra!**".
  - Si estás a una letra, solo vos ves "**¡Casi!**".
  - Quienes ya saben la palabra (el dibujante y los que acertaron) hablan en un canal 🔒 que los demás no ven.
  - Cada tanto se revela una letra como pista.
  - Cuando acierta el primero, quedan como máximo 30 segundos.
- **Fin de turno:** cuando se acaba el tiempo o aciertan todos. Se muestra la palabra, los puntos de cada uno y hay 5 segundos de pausa.
- **Fin de partida:** podio con confeti, tabla final, premios (⚡ más rápido, 🎨 mejor dibujante, 🎯 más aciertos) y **Jugar de nuevo**.
- **Votos:** 👍 / 👎 al dibujo, una vez por turno. Tocando un jugador podés **votar para expulsarlo**; sale con mayoría. El anfitrión expulsa directo.

### Herramientas y atajos

| Herramienta | Tecla |
|---|---|
| Pincel | B |
| Goma | E |
| Balde (con tolerancia) | F |
| Cuentagotas | I |
| Resaltador | H |
| Aerosol | S |
| Punteado | D |
| Línea | L |
| Rectángulo | R |
| Elipse | O |
| Triángulo | T |
| Modo espejo | M |
| Tamaño | `[` y `]` |
| Colores de la paleta | 1 a 0 |
| Deshacer / Rehacer | Ctrl+Z / Ctrl+Y |

Además:
- **Formas:** se pueden hacer rellenas o solo con contorno. Con Shift salen proporciones perfectas: cuadrado, círculo y líneas a 0°, 45° o 90°.
- **Pincel:** 7 tamaños rápidos más un deslizador de 1 a 100, y opacidad ajustable.
- **Colores:** paleta de 32, selector libre y en hexadecimal, y los recientes.
- **Lápiz digital:** se tiene en cuenta la presión del lápiz.
- **Al terminar:** botón **Borrar todo** y **Descargar dibujo** en PNG.

---

## 4. Arquitectura

```
pintortillo/
├── engine/                      # MOTOR puro (sin red), testeable
│   ├── game.js                  #   salas, turnos, aciertos, chat secreto, votos, vista por jugador
│   ├── scoring.js               #   fórmula de puntos (constantes configurables)
│   ├── matcher.js               #   comparación de adivinanzas (tildes, ñ, espacios, Levenshtein)
│   ├── hints.js                 #   máscara y pistas
│   ├── words.js                 #   elección de palabras sin repetir, personalizadas
│   ├── words/es.txt, es-2.txt   #   banco editable (separado por comas)
│   ├── words/es.json            #   banco generado (4348 palabras)
│   ├── drawing.js               #   validación e historial de comandos de dibujo (servidor + navegador)
│   ├── raster.js                #   pintor determinista por software (servidor de tests + navegador)
│   ├── profanity.js             #   filtro opcional de insultos
│   └── util.js
├── server/
│   ├── index.js                 # Express + Socket.IO + reloj (tick cada 200 ms)
│   ├── sockets.js               # eventos, límites de tasa, a quién va cada mensaje
│   ├── rooms.js                 # salas, emparejamiento público, sesiones, reconexión, limpieza
│   ├── rateLimit.js
│   └── sanitize.js
├── shared/avatar.js             # avatares SVG propios (servidor valida, navegador dibuja)
├── public/
│   ├── index.html
│   ├── css/style.css            # diseño propio, claro/oscuro, responsive
│   └── js/
│       ├── main.js net.js store.js audio.js dom.js
│       ├── i18n/                # es.js (estructura lista para sumar idiomas)
│       └── ui/
│           ├── home.js          # inicio + editor de avatar
│           ├── lobby.js         # sala de espera y ajustes
│           ├── game.js          # pantalla de juego
│           ├── canvas.js        # lienzo, entrada y sincronización
│           ├── tools.js         # herramientas y atajos
│           ├── chat.js players.js overlays.js toast.js
├── scripts/                     # online.mjs, e2e.mjs, build-words.mjs
├── tests/                       # Vitest
├── JUGAR-ONLINE-Windows.bat
├── JUGAR-ONLINE-Mac.command
└── render.yaml
```

### Principios
- **El servidor es la fuente de verdad.** Elige las palabras, valida las adivinanzas, calcula los puntos y maneja el tiempo y los turnos.
- **La palabra solo le llega a quien la sabe:** el dibujante, los que ya acertaron, y todos al terminar el turno. Los que adivinan reciben solo la máscara (`_ _ _ _   _ _`). El navegador ni siquiera puede descargar el banco de palabras. Un test con clientes reales revisa cada mensaje que reciben.
- **El dibujo se ve igual en todos lados.** El trazo, el balde y las formas se pintan píxel por píxel con cuentas exactas (`engine/raster.js`), sin depender del navegador. Por eso el balde da exactamente el mismo resultado en todas las pantallas. El lienzo lógico es de 800×600 y se escala a cualquier tamaño.
- **Sincronización:** el dibujante manda comandos compactos cada 40 ms (inicio, puntos y fin de trazo, balde, forma, borrar, deshacer y rehacer). Quienes miran los reproducen de a poco para que el trazo se vea fluido. El servidor guarda el historial del turno para quien entra tarde o se reconecta.

## 5. Eventos Socket.IO

**Cliente → servidor** (todos con respuesta `{ ok, error? }`, salvo `draw`):

| Evento | Datos | Quién | Qué hace |
|---|---|---|---|
| `room:play` | `{ name, avatar }` | cualquiera | sala pública con lugar o una nueva |
| `room:create` | `{ name, avatar }` | cualquiera | sala privada nueva |
| `room:join` | `{ code, name, avatar }` | cualquiera | unirse con código (también a mitad de partida) |
| `session:resume` | `{ code, playerId, secret }` | jugador | reconectar con la sesión guardada en el navegador |
| `room:leave` | — | jugador | salir |
| `room:settings` | `{ patch }` | anfitrión | cambiar ajustes |
| `room:start` | — | anfitrión | empezar |
| `room:kick` | `{ playerId }` | anfitrión | expulsar |
| `room:again` | — | anfitrión | volver a la sala tras el podio |
| `game:choose` | `{ index }` | dibujante | elegir palabra |
| `game:vote` | `{ value: 1 \| -1 }` | adivinadores | 👍 / 👎 |
| `game:votekick` | `{ playerId }` | jugadores | votar expulsión |
| `chat:send` | `{ text }` | jugadores | chat y adivinanzas |
| `draw` | `[comandos]` | dibujante activo | dibujo (alta frecuencia, sin respuesta) |
| `stats` | — | cualquiera | jugadores online y salas públicas |

**Servidor → cliente:**

| Evento | Datos | A quién |
|---|---|---|
| `room:state` | vista personal de la sala (la palabra solo si corresponde) | cada jugador por separado |
| `chat:message` | `{ kind: msg \| system \| guessed \| secret \| close, … }` | todos, solo "los que saben" o solo uno |
| `game:event` | `turnStart`, `yourTurn`, `drawStart`, `guessed`, `hint`, `hurry`, `turnEnd`, `gameOver`, `vote`, `join` | todos o uno |
| `draw:cmds` | comandos validados | todos menos el dibujante |
| `draw:replay` | `{ actions, open }` | quien entra o se reconecta |
| `room:kicked` | — | el expulsado |
| `session:replaced` | — | la pestaña vieja si abrís otra |

## 6. Puntos (`engine/scoring.js`)

- **Adivinador:** `round(400 × tiempoRestante/tiempoTotal) + BONUS[puesto]`, con BONUS = [100, 70, 50, 30, 20, 10, 0…] y un mínimo de 50 por acertar.
- **Dibujante:** por cada acierto suma `round(300 / adivinadores × tiempoRestante/tiempoTotal) + 10`. Gana más si acierta más gente y más rápido. Si nadie acierta, 0. Si se va a mitad del turno, pierde lo de ese turno.
- Su total queda debajo del primer adivinador, que puede llegar a 500.
- Al primer acierto, el tiempo restante baja a 30 segundos (si quedaba más).
- **Empates en el podio:** gana quien tenga menor suma de tiempos de acierto.

**Sugerencias de balance (no aplicadas):**
1. **Con 2 jugadores**, el único adivinador gana mucho más que el dibujante. Se podría subir `DRAW_BASE` cuando hay pocos jugadores.
2. **El desempate por "menor suma de tiempos"** favorece a quien acertó **menos** veces. Sería más justo usar el promedio.
3. **Con 15 o más jugadores**, `DRAW_BONUS` fijo hace que el dibujante pueda pasar al primero. Se puede limitar el bonus total.

## 7. Banco de palabras

Las palabras están en `engine/words/es.txt` y `engine/words/es-2.txt`, separadas por coma. Para agregar más, sumalas ahí (o en otro `es-algo.txt`) y corré `npm run words`. El script:
- saca las repetidas y valida el largo (2 a 30 caracteres);
- excluye marcas registradas, alcohol y temas sensibles (lista `EXCLUDE` en `scripts/build-words.mjs`);
- genera `es.json`.

Cada sala recuerda las palabras usadas y no las repite hasta agotar el banco.

**Palabras personalizadas:** el anfitrión las escribe separadas por coma (cada una hasta 30 caracteres). Con "usar SOLO personalizadas" hacen falta al menos 4. Si no, se mezclan con el banco: cada opción tiene 1 en 3 de salir de las personalizadas.

## 8. Tests

`npm test` corre 45 tests:

| Caso | Archivo |
|---|---|
| Puntos, orden, mínimo, dibujante debajo del primero, desempate | `scoring-matcher-hints.test.js` |
| Tildes, mayúsculas, espacios, guiones, ñ ≠ n, "casi" (Levenshtein 1) | `scoring-matcher-hints.test.js` |
| Pistas: no revelan espacios, ni más de la mitad, ni la palabra completa | `scoring-matcher-hints.test.js` |
| El dibujante se desconecta o se va: termina el turno sin puntos para él | `game.test.js` |
| Un adivinador desconectado no frena "todos acertaron" | `game.test.js` |
| Todos aciertan antes de tiempo: termina al instante | `game.test.js` |
| Nadie acierta: se revela la palabra y el dibujante gana 0 | `game.test.js` |
| "ropa interior", "montaña", "paraguas", "ping-pong" | `game.test.js` |
| Dos aciertos casi simultáneos: se respeta el orden de llegada | `game.test.js` |
| Palabra dividida en varios mensajes y chat secreto: solo lo ven quienes saben | `game.test.js` |
| Entrada tardía (ve el dibujo y entra en la ronda siguiente) y reconexión | `game.test.js`, `server.test.js` |
| Sala de 2; fin si quedan menos de 2 conectados | `game.test.js` |
| Solo el dibujante dibuja, solo el anfitrión cambia ajustes, la palabra nunca llega antes de tiempo | `game.test.js`, `server.test.js` |
| El dibujo es idéntico en vivo y redibujado; deshacer; el balde no se escapa; espejo | `drawing-words.test.js` |
| Banco de más de 4000 palabras sin repetidas; no repite usadas; personalizadas | `drawing-words.test.js` |
| Salas públicas, votos, expulsión por mayoría, límite de tasa | `game.test.js`, `server.test.js` |

## 9. Checklist manual con 3 pestañas

1. `npm start`. Abrí 3 ventanas: normal y dos de incógnito (o una en el celular, misma Wi-Fi).
2. A: nombre y personaje → **Crear sala privada** → **Copiar enlace**.
3. B entra con el enlace; C escribe el código. Los 3 se ven en vivo en la sala.
4. B intenta cambiar un ajuste: no puede. A pone 2 rondas y palabras propias, y toca **¡Empezar!**.
5. El dibujante ve 3 palabras; los demás ven "X está eligiendo". Esperá 15 segundos sin elegir: elige el servidor.
6. Dibujá con pincel, balde, formas (con Shift), aerosol y espejo. Probá deshacer, rehacer y borrar. En B y C se ve igual y en vivo.
7. B escribe mal ("gatoo" si la palabra es "gato"): solo B ve "¡Casi!". B escribe la palabra en mayúsculas: todos ven "B adivinó" en verde y el tiempo baja a 30 segundos.
8. B escribe la palabra otra vez: va al chat 🔒 y C no lo ve. El dibujante también escribe en 🔒.
9. C acierta: el turno termina al instante. Se ve la palabra, los +puntos y "Descargar dibujo".
10. Recargá la pestaña de C a mitad de un turno: vuelve con su puntaje y el dibujo completo.
11. Abrí una 4.ª pestaña y unite con el código a mitad de partida: ve el dibujo en curso y dibuja desde la ronda siguiente.
12. Tocá un jugador → **Votar para expulsar**. Con mayoría, sale.
13. Cerrá la pestaña del dibujante: a los 10 segundos el turno pasa al siguiente.
14. Terminá la partida: podio, confeti, tabla, premios y **Jugar de nuevo**.
15. En el inicio, dos pestañas tocan **¡Jugar!**: caen en la misma sala pública, que arranca sola.
16. Probá modo oscuro (🌙), silenciar y volumen, celular (botón 👥 para ver jugadores) y la navegación con teclado.

## 10. Limitaciones conocidas

- **Una sola instancia de servidor:** las salas viven en memoria. Si el servidor se reinicia, se pierden.
- **Quien entra a mitad de turno** ve el dibujo, pero no los mensajes de chat anteriores.
- **El pintor propio no suaviza los bordes** (para que el balde dé lo mismo en todas las pantallas). Los trazos se ven un poco "pixelados" en pantallas muy grandes.
- **El filtro de insultos** es una lista simple.
- **Solo hay interfaz y banco en español.** La estructura de idiomas está lista para sumar otro.
- **Las expulsiones** bloquean a esa sesión. Alguien podría volver a entrar como jugador nuevo con otro nombre.
- **Banco de palabras:** las palabras se eligen al azar sin categorías ni niveles; algunas son más difíciles que otras.

## Licencia

MIT.
