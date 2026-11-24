# Crabs Barbería: contexto para Claude

Lee esto completo antes de trabajar. Resume los gustos de la usuaria, el negocio, la lógica del dinero, lo que se ha decidido y lo pendiente.

## La usuaria y cómo responderle

- Responde siempre en **español**, **breve y concreto**: primero qué se hizo o qué pasa, luego lo mínimo necesario. Nada de explicaciones largas salvo que las pida.
- Usa **lenguaje neutro de género** (ni "el barbero" ni "la barbera" cuando se pueda: "la persona", "quien atiende", "Titular"). En ejemplos y mockups usa "Titular", no "Dueña".
- Cuando reporte un bug: investiga en el código y en los registros, reprodúcelo, corrígelo, verifica con capturas y súbelo. Si algo no se puede comprobar (por ejemplo, porque haría falta leer la base real), dilo claro y dile cómo puede revisarlo ella en la app.
- Cuando pide "propuestas" u "opciones": haz mockups/capturas para elegir (opciones con letra A, B, C…), no implementes directo. Suele elegir una y pedir combinar partes de otras.
- Cuando pide "auditoría": primero documenta sin cambiar código y espera autorización. Cuando dice "sigue auditando hasta que no quede nada", corrige y vuelve a buscar.
- Cuando dice **"no hagas modificaciones todavía"** o **"dime qué opinas"**: solo opina e implica (qué cambia, riesgos, recomendación) y espera.
- Pregunta mucho **de dónde sale cada número**. Explica con ejemplos concretos y cuentas que cuadren. No uses jerga contable.
- No inventes resultados: si una prueba no se hizo, dilo.
- Frases suyas que son regla: "No quiero cosas repetidas", "Aprovecha la estructura existente", "Nunca eliminar ni alterar registros históricos", "No quiero que el usuario tenga que interpretar demasiados números", "No quiero que simplemente reduzcas lo de escritorio para meterlo en el celular", "No quiero que cambies toda la estructura de la página" (cuando pide un ajuste puntual).

## Proyecto técnico

- Repositorio `quantumstudiodata/crabsbarbershop`, carpeta local `/home/user/crabsbarbershop`.
- **Next.js 15 (App Router, server actions), React 19, drizzle + Postgres (postgres-js, `prepare:false`, `max:5`, `idle_timeout:20`, `max_lifetime:600`)**, Supabase en producción, Vercel para desplegar (plan Hobby: los logs de runtime solo duran 1 hora).
- Dinero en **centavos**. Zona horaria **America/Monterrey**.
- Ramas: se trabaja en `rediseno` y se publica con `git push origin rediseno` y `git push origin rediseno:main`. Vercel despliega `www.crabsbarber.shop` desde `main`. Evitar muchos despliegues seguidos.
- Firma de commits:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <enlace de la sesión actual>
  ```
- Nunca poner el identificador del modelo en commits, PR o código. No crear PR salvo que lo pida.
- Vercel: proyecto `prj_1DbBygU6ZhoomqBBam7IQ3ZljKhm`, equipo `team_cSIGPDpqX95jlWYuLl0kBVRb`. Para errores de producción usar `get_runtime_errors` y `get_runtime_logs`.
- Errores de versión vieja en producción ("reading 'call'", "Load failed", ChunkLoadError) recargan la página una vez sola (`global-error.tsx` y `(app)/error.tsx`).

### Base de datos y SQL

- Cambios de esquema: generar `crabs_actualizar_00XX.sql` **idempotente** en la raíz del repo (con su migración de drizzle y el hash en `__drizzle_migrations`), mandarlo a la usuaria y **esperar "listo sql"** antes de subir código que dependa de él. Último aplicado: **0035** (`movimientos_pendientes`). 0033 fue `negocio_duena`.
- Configuración que no necesita columnas nuevas va en JSON (`citasConfig`, etc.).
- **Nunca leer la base de producción.** Nunca borrar o reiniciar negocios reales.
- Archivos que no se suben ni se comparten: `crabs_preparar_base.sql`, `crabs_vercel_DATABASE_URL.txt`, `/home/pgtest/deploy/secreto.json`. `crabs_*` y `capturas-guia/` están en `.git/info/exclude`.
- No guardar números de tarjeta ni CVV. Respetar roles y permisos. Nunca pedir que pegue secretos.

### Entorno local (si existe en la sesión)

- Postgres local puerto 5433 (base `crabs`, usuario `postgres`). Se cae seguido. Para levantarlo (sin comodines en el `rm`, porque la verificación de seguridad los bloquea):
  `rm -f /tmp/.s.PGSQL.5433 /tmp/.s.PGSQL.5433.lock /home/pgtest/data/postmaster.pid; su pgtest -c "/usr/lib/postgresql/16/bin/pg_ctl -D /home/pgtest/data -l /home/pgtest/log.txt -o '-p 5433 -k /tmp' start"`
- Servidor de prueba: `pkill -f "next-server|next start"`, `npm run build` y `npx next start -p 3100` (reiniciar después de cada build).
- Usuarios de prueba (contraseña `demo1234`): `DPRUEBA` titular, `APRUEBA` soporte de plataforma, `KRUIZ` barbero, `JLOPEZ` contador/administrador, `AMARTINEZ` encargada. Negocio `crabs-barberia` (una caja abierta y más de 100 cortes cerrados); negocios de prueba "Barbería Demo".
- Antes de pruebas que guardan datos: `pg_dump -Fc` de respaldo y `pg_restore` al terminar. Si la restauración choca con `movimientos_pendientes`, borrar esa tabla antes y volver a correr el SQL 0035.
- Verificar con Playwright (Chromium ya instalado) en **390×844, 360×800, 768×1024 y 1440×900**; laptops también 1366×650. Revisar capturas, no solo que "cargue". Login: `/entrar`, campos `usuario` y `contrasena`, botón "Entrar".
- Pruebas unitarias: `npx vitest run` (35 pasan). Tipos: `npx tsc --noEmit`.

## El negocio

- **Crabs Barbería**, Monterrey, México. La app es un sistema para barberías (pensado como SaaS multi-negocio, con una cuenta de **Soporte de plataforma**).
- Puestos: Titular, Administrador, Encargada, Barbero, Contador, Recepcionista y Soporte técnico, más puestos personalizados con permisos. En el código el rol de Titular se llama `duena`.
- Módulos: Inicio, **Cobro**, **Caja** (apertura con fondo, Movimiento de caja, corte), **Citas y agenda** + **página pública de reservas** `/reservar/[slug]`, **Equipo** (comisiones automáticas, sueldos, renta de silla, faltantes, reseñas), **Reportes/Analítica** (Resumen, Movimientos/Finanzas, Equipo, Cortes), **Datos/Libreta** para el contador, **Historial**, **Ajustes**, **Soporte**, guía de primer uso por puesto y encuesta de servicio.
- Reglas del negocio ya decididas:
  - Pago en línea (Stripe Connect): **la comisión la paga el cliente**, `cargoEnLinea` = 3.6% + $3 + IVA. El cliente no debe ver una comparación de precios.
  - En reservas la **transferencia se ofrece siempre**, sin importar la hora de la cita. Se puede subir comprobante o compartir por WhatsApp.
  - En Cobro el **total grande incluye la propina** y abajo va el desglose ("$290 de servicios + $29 de propina").
  - Contraseña temporal dura 30 min y se muestra la hora en que vence.
  - Gasto (sale de la caja, afecta el corte) vs. Egreso (Finanzas, no sale de caja) vs. Retiro (sacar efectivo, no es gasto). "Me llevo efectivo de la caja" solo lo hace Titular y se descuenta de lo del negocio.
  - Las propinas no son ventas y no son del negocio: "lo de propinas no se toca".
- Contexto laboral: los barberos tienen horario e instrucciones, así que legalmente es relación laboral. Se hicieron dos contratos en Word (laboral a comisión y servicios independientes/renta de silla) en `capturas-guia/`. Recomendar siempre revisión con abogado o contador.

## Lógica del dinero (fundamental, no romper)

- **Turno de caja**: se abre con fondo contado y se cierra con el **corte en 3 pasos de corrido** (repartir, contar, cerrar). Cada corte tiene folio `C-000012`. Cada venta tiene folio `CRB-001201`.
- **Comisiones automáticas** por venta (`comisionesDeTurno`). En el corte se le paga a cada persona su comisión con efectivo de la caja; si no alcanza, lo que falta queda **pendiente** y se entrega después (Equipo, `entregarPendiente`).
- **Propina con tarjeta o transferencia**: en el corte se pregunta por persona si se le da **en efectivo de la caja** o **por transferencia**. Si sale de la caja, ese dinero ya es del negocio (le llegó al banco), por eso se descuenta de lo del negocio (`propinasDeCaja`).
- **Lo que le toca al negocio** (`leTocaAlNegocio` en `src/lib/duena.ts`): `max(0, ventas − comisiones − cobrado por transferencia/tarjeta/QR − gastos de caja − lo que Titular se llevó − propinas con tarjeta dadas de la caja)`. Se calcula **solo al cerrar** y se guarda en `negocio_duena` como `acumulado`.
- **Depósitos al negocio**: se registran en Movimiento de caja ("Deposité al negocio"), comprobante **opcional**, cubren primero lo más viejo (FIFO), se pueden anular con motivo (lo pendiente vuelve a subir). La opción siempre se ve; si no hay nada pendiente aparece apagada con "No hay nada pendiente de depositar". Si una venta se cancela o modifica después del corte, `recalcularNegocio` ajusta lo pendiente.
- **Efectivo usable** (`efectivoUsable` en `src/lib/caja.ts`) = efectivo esperado − propinas en efectivo sin entregar. Es el tope para gastos, "Me llevo" y Registrar pago en efectivo.
- **Pagos al equipo, opción A**: por transferencia solo se permite lo que la caja no alcanza (total − efectivo usable). Con la caja cerrada no se registra. Se quitó "Todo por transferencia".
- **Movimiento con la caja cerrada**: se guarda en `movimientos_pendientes` y se suma al abrir la siguiente caja (fondo = contado + gastos/retiros − entradas). Se ve la lista con "Quitar". Decisión final: se queda así.
- **Protección contra doble toque**: en el cliente `useUnEnvio` y un freno global de 1.5 s por formulario y texto de botón (`src/components/Envio.tsx`); en el servidor, revisión de repetidos de 30 s en gasto, movimiento, depósito, entrega de pendiente y corrección de cierre. Al guardar sale un aviso arriba (`avisarGuardado`).
- **Ganancia (Finanzas)**: devengada = ventas + rentas − egresos − (comisiones generadas − faltantes) − sueldos pagados.
- **Meta del mes** = **ganancia que se quiere** (ya libre del equipo y de los gastos del mes). Ventas necesarias = meta + gastos del mes (fijos si hay, si no el promedio de egresos) + sueldos − rentas, repartido por esquema de cada barbero (`metaDelNegocio`, `metasDelMes`). Resumen compara lo vendido contra las ventas necesarias; Inicio muestra la meta diaria por barbero.
- **Faltantes de caja**: no se vuelven deuda en automático; pasan por 3 etapas y no siempre se asignan a una persona.
- **Historial/Finanzas**: al menos 2 días por página, solo turnos cerrados, el corte al final de cada día, pendientes con su origen ("Sáb 21 nov, corte C-000010").

## Gustos de diseño (respetar siempre)

- Paleta: **gris vidrio, negro y gris azulado**. **Sin énfasis verde, rojo ni naranja** (no letra naranja en montos, no subrayados naranjas, no fondos beige). Excepción: el **ámbar solo para alertas de dinero** (corte pendiente, faltantes, por depositar). Los montos negativos siguen en rojo (pendiente confirmar si los quiere en gris).
- **Sin "·"** en textos, **sin emojis**, **nada de líneas punteadas**, sin texto curvo, sin estrellas ni rayones decorativos, sin manchas tipo tie dye, sin diseños cargados ni tarjetas innecesarias, sin "recuadros predeterminados" ni diseños "muy básicos".
- Estilo: **entre minimalista y moderno**. **Listas** compactas antes que mosaicos ("nunca me ha gustado lo que está en mosaico"). Encabezados que destacan pero **no encabezados oscuros/negros** (los ha rechazado varias veces; preferir gris tenue).
- Controles que le gustan: **interruptores**, **menús desplegables propios**, opciones seleccionables, **botones de relleno negro cuando están seleccionados**, botones de sugerencia (no deslizadores). No botones como texto subrayado. Íconos o ícono + texto (el engrane de editar con texto). Formularios largos **paso a paso** (Nueva cita, corte, promociones).
- **Primero celular**, pero sin sacrificar escritorio. Nada encimado, cortado ni apilado sin necesidad; botones horizontales cuando caben. En escritorio no abarcar tanto espacio horizontal; se vale explorar tamaños distintos de recuadros. Filtros sencillos y **paginación por fuera** de la lista. Sin barras de desplazamiento visibles.
- **Los modales se cierran solo con la X** (tocar fuera no los cierra). Escape sí los cierra. Con un modal abierto el fondo no se mueve. Vistas previas en grande.
- **Nada repetido**: si una acción ya existe en otro lado (por ejemplo "Pagué algo con dinero de la caja"), no duplicarla; si un dato ya se explica ("Cómo se llegó"), no repetirlo.
- App interna: fondo de un solo tono `#e4e9ee`. En laptops (≥1024 px de ancho, ≤820 px de alto, con mouse) la app se dibuja al **90%** (`html[data-zoom="ok"]`). Las ventanas flotantes dividen sus coordenadas entre `zoomPagina()`.
- Páginas del cliente (reservas, comprobante de cita, encuesta, página no encontrada) en **tema grafito oscuro**: fondo `#0c0d0f` con polvo fino y grano, tarjetas `#202329`, acento `#eef1f5`, letra Geist. Cangrejo pequeño animado (solo tenazas y parpadeo, no hombros) asomándose en las tarjetas o en el botón. Bienvenida de primer uso sí con muchas animaciones y solo el ícono del cangrejo (sin logo de texto).
- Animaciones discretas en la app: entradas cortas, nada de flotados lentos infinitos.
- Textos claros, sin frases de anuncio, títulos sencillos. En el corte y el dinero: decir **"Negocio"** (no "dueña"), "Pendiente de depositar" (no "acumulado" ni "apartado"), "Menos los gastos" (no "Se fue"). Evitar frases como "Ya se llevó" o "Se sacaron de la caja para depositarle".

### Diseños aprobados (patrones que se repiten)

- Menú superior "D" y barra inferior con **Cobrar al centro**; Cobro oculta el menú al bajar.
- Inicio de administración "lista tranquila": aviso de corte pendiente arriba (ámbar), Hoy llevan con meta, acciones rápidas personalizables (citas reservadas o pagadas primero si existen), Equipo hoy, **Últimos movimientos** (8) con "Ver todos los movimientos". Sin "Semana pasada". Inicio de barbero nunca vacío.
- Equipo: lista tranquila, Resumen a la izquierda en escritorio; ficha con datos del mes; reseñas por barbero.
- Citas: línea del tiempo con línea de la hora actual (menos en Lista), bloquear horarios junto a "Agregar cita", Nueva cita paso a paso.
- Cortes: lista con detalle lateral; detalle del corte en **"lectura de corrido"** (Lo que se vendió, A quién le toca, Cómo recibió cada quien, La caja, Egresos del día, Pendientes de los últimos días con saldados). No le gustaron chips de pasos, acordeones, pestañas ni recuadros "1 venta, 2 le toca…".
- Comprobante/ticket de corte que parezca ticket real; PDF llamado "Corte de caja C-000012".
- Resumen: tarjeta principal de lo vendido con anillo de meta, actividad de ventas, resultado financiero, "Requiere atención".
- Finanzas: "ese diseño ya me gustaba", no tocar sin que lo pida.

## Pendiente o por decidir

- **Excel de movimientos (una sola hoja)**: le gustó "todo en una hoja", pero el bloque del corte no se entendía. Se le enviaron 4 opciones (A corte de arriba a abajo, B resumen del corte arriba de cada día, C tabla de cortes arriba y movimientos abajo, D la caja como saldo). **Esperando que elija**. Generador del mockup en el scratchpad (`xl2/gen.cjs`), puede perderse.
- **Lo del negocio con la caja abierta**: notó que mientras no se cierra la caja solo sale lo pendiente de cortes anteriores. Se le propuso mostrar "Hoy va $X, se suma cuando se cierre la caja" como dato informativo (puede bajar si al cerrar se dan propinas con tarjeta de la caja) y que el depósito siga aplicando solo a cortes cerrados. **Esperando su respuesta, no implementar todavía.**
- **Duda de la Encargada**: dijo que no le salía "depositar al negocio". El código solo la mostraba con saldo pendiente; no se pudo confirmar en producción. Ya se publicó que la opción siempre se vea (apagada si no hay pendiente). Ella iba a revisar en Datos si había saldo; si quiere regresar al comportamiento anterior, revertir el commit 962448d.
- **Diseños nuevos del detalle del corte desde cero**: pidió empezar de nuevo; por mientras se aplicó la lectura de corrido. Sin respuesta sobre las propuestas N1 a N3.
- **G5**: en escritorio, Ventas, Cortes, Finanzas e Historial viven en un recuadro con su propio scroll. Propuesta: quitar el recuadro y dejar la lista completa con sus páginas. Esperando autorización.
- Detalles de la segunda auditoría sin hacer: ticket de 80 mm al imprimir (sin fondo ni margen), nombres de puestos neutros, alinear tarjetas de puesto en Agregar usuario, ejemplo de motivo al anular comisión, quitar verdes/rojos que quedan en Cobro y en el cierre de corte, misma flecha en los pasos del corte, categorías de gasto duplicadas ("Papelería2").
- Textos con "dueña" que siguen visibles: Datos ("Lo de la dueña"), exportar a Excel, Finanzas ("Depósito a la dueña"), detalle de movimientos de caja y avisos del corte. Ella pidió "Negocio" en el detalle del corte; confirmar antes de cambiar el resto.
- Por probar en dispositivo real: cobro con QR, Apple Pay y Google Pay, Safari en iPhone, impresión en impresora térmica.
- Ofrecido: pasar `/pagar` a tema oscuro; comprobantes por correo (Resend, prefiere correo propio de Crabs, recordárselo al final); aviso de "No vino" en la encuesta (requiere proveedor de mensajes).
- Para instalar como app en iPhone: agregar desde **www.crabsbarber.shop** (sin www redirige y muestra la barra de Safari) y con "Abrir como app web" encendido.

## Auditorías hechas y cómo se resolvieron (noviembre)

- Doble toque guardaba duplicados (pago de $900 tres veces, gastos, depósitos): freno en cliente y en servidor.
- Se aceptaba un gasto de $99,999: tope con efectivo usable (sin tocar propinas).
- Anular "Pago de comisiones a…" no regresaba el efectivo: ahora se reconocen ambos textos.
- Reparto del día con etiquetas engañosas (pagos anulados contados, pendientes atribuidos a hoy): reescrito para decir solo hechos del corte.
- A la Titular se le contaban dos veces las propinas con tarjeta pagadas con la caja: se descuentan.
- Ganancia contaba dos veces comisiones en vistas diarias: fórmula devengada.
- El freno global de doble envío bloqueaba pasos del corte: ahora se identifica por texto del botón.
- El aviso de guardado tapaba el botón Cobrar en escritorio: se movió arriba.
- Todos los cortes de prueba "cuadró"; las cuentas de lo del negocio se verificaron (ej. 366 = 187 en banco + 179 pendiente).

## Incidente (14 nov)

Páginas colgadas 300 s en producción (Soporte, Inicio) después de muchos despliegues seguidos y de "Empezar de cero". Se corrigió: conexiones que se cierran solas, `maxDuration = 60` en el layout de la app, `global-error.tsx` con botón Recargar, recarga automática si la pestaña tiene una versión vieja, y SQL 0031 con timeouts. Si vuelve a pasar, revisar `get_runtime_logs` de Vercel y evitar publicar muchas versiones seguidas.
