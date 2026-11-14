# Crabs Barbería: contexto para Claude

Lee esto completo antes de trabajar. Resume los gustos de la usuaria, el negocio, la forma de trabajar y lo pendiente.

## La usuaria y cómo responderle

- Responde siempre en **español**, **breve y concreto**: primero qué se hizo o qué pasa, luego lo mínimo necesario. Nada de explicaciones largas salvo que las pida.
- Usa **lenguaje neutro de género** (ni "el barbero" ni "la barbera" cuando se pueda: "la persona", "quien atiende", "Titular").
- Cuando reporte un bug: investiga en el código y en los registros, reprodúcelo, corrígelo, verifica con capturas y súbelo. Si algo no se puede comprobar, dilo claro.
- Cuando pide "propuestas": haz mockups/opciones visuales para elegir, no implementes directo.
- Cuando pide "auditoría": primero documenta sin cambiar código y espera autorización.
- No inventes resultados: si una prueba no se hizo, dilo.

## Proyecto técnico

- Repositorio `quantumstudiodata/crabsbarbershop`, carpeta local `/home/user/crabsbarbershop`.
- **Next.js 15 (App Router, server actions), React 19, drizzle + Postgres (postgres-js, `prepare:false`, `max:5`, `idle_timeout:20`, `max_lifetime:600`)**, Supabase en producción, Vercel para desplegar.
- Dinero en **centavos**. Zona horaria **America/Monterrey**.
- Ramas: se trabaja en `rediseno` y se publica con `git push origin rediseno` y `git push origin rediseno:main`. Vercel despliega `www.crabsbarber.shop` desde `main`.
- Firma de commits:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: <enlace de la sesión actual>
  ```
- Nunca poner el identificador del modelo en commits, PR o código. No crear PR salvo que lo pida.
- Vercel: proyecto `prj_1DbBygU6ZhoomqBBam7IQ3ZljKhm`, equipo `team_cSIGPDpqX95jlWYuLl0kBVRb`. Para errores de producción usar `get_runtime_errors` y `get_runtime_logs`.

### Base de datos y SQL

- Cambios de esquema: generar `crabs_actualizar_00XX.sql` **idempotente** en la raíz del repo, mandarlo a la usuaria y **esperar "listo sql"** antes de subir código que dependa de él. Último aplicado: **0031** (timeouts: `statement_timeout 60s`, `idle_in_transaction_session_timeout 60s`, `lock_timeout 30s`).
- Configuración que no necesita columnas nuevas va en JSON (`citasConfig`, etc.).
- **Nunca leer la base de producción.** Nunca borrar o reiniciar negocios reales.
- Archivos que no se suben ni se comparten: `crabs_preparar_base.sql`, `crabs_vercel_DATABASE_URL.txt`, `/home/pgtest/deploy/secreto.json`. `crabs_*` y `capturas-guia/` están en `.git/info/exclude`.
- No guardar números de tarjeta ni CVV. Respetar roles y permisos. Nunca pedir que pegue secretos.

### Entorno local (si existe en la sesión)

- Postgres local puerto 5433. Si se cae:
  `rm -f /tmp/.s.PGSQL.5433* /home/pgtest/data/postmaster.pid; su pgtest -c "/usr/lib/postgresql/16/bin/pg_ctl -D /home/pgtest/data -l /home/pgtest/log.txt -o '-p 5433 -k /tmp' start"`
- Servidor de prueba: `npm run build` y `npx next start -p 3100` (reiniciar después de cada build).
- Usuarios de prueba (contraseña `demo1234`): `DPRUEBA` titular, `APRUEBA` soporte de plataforma, `KRUIZ` barbero, `JLOPEZ` contador/administrador, `AMARTINEZ` encargada. Negocio `crabs-barberia`; negocios de prueba "Barbería Demo".
- Antes de pruebas que guardan datos: `pg_dump` de respaldo y `pg_restore` al terminar.
- Verificar con Playwright (Chromium ya instalado) en **390×844, 360×800, 768×1024 y 1440×900**; laptops también 1366×650. Revisar capturas, no solo que "cargue".
- Pruebas unitarias: `npx vitest run` (35 pasan). Tipos: `npx tsc --noEmit`.

## El negocio

- **Crabs Barbería**, Monterrey, México. La app es un sistema para barberías (pensado como SaaS multi-negocio, con una cuenta de **Soporte de plataforma**).
- Puestos: Titular, Administrador, Encargada, Barbero, Contador, Recepcionista y Soporte técnico, más puestos personalizados con permisos.
- Módulos: Inicio (pendientes, acciones rápidas, equipo hoy, semana pasada), **Cobro** (servicios, promociones, descuentos, propina, dividir pago, efectivo/transferencia/tarjeta/QR), **Caja** (apertura con fondo, gastos, retiros, corte de caja en 4 pasos con comisiones y conteo), **Citas y agenda** + **página pública de reservas** `/reservar/[slug]`, **Equipo** (comisiones automáticas, sueldos, renta de silla, faltantes), **Analítica** (Resumen, Ventas, Equipo, Corte de caja, Finanzas), **Datos/Libreta** para el contador, **Historial**, **Ajustes**, **Soporte**, guía de primer uso por puesto y encuesta de servicio.
- Reglas del negocio ya decididas:
  - Pago en línea (Stripe Connect): **la comisión la paga el cliente**, `cargoEnLinea` = 3.6% + $3 + IVA.
  - En reservas la **transferencia se ofrece siempre**, sin importar la hora de la cita.
  - En Cobro el **total grande incluye la propina** y abajo va el desglose ("$290 de servicios + $29 de propina").
  - Contraseña temporal dura 30 min y se muestra la hora en que vence.
  - Gasto (sale de la caja, afecta el corte) vs. Egreso (Finanzas, no sale de caja) vs. Retiro (sacar efectivo, no es gasto).
- Contexto laboral: los barberos tienen horario e instrucciones, así que legalmente es relación laboral. Se hicieron dos contratos en Word (laboral a comisión y servicios independientes/renta de silla) en `capturas-guia/`. Recomendar siempre revisión con abogado o contador.

## Gustos de diseño (respetar siempre)

- Paleta: **gris vidrio, negro y gris azulado**. **Sin énfasis verde, rojo ni naranja**. Excepción decidida: el **ámbar solo para alertas de dinero** (corte pendiente, faltantes). Los montos negativos siguen en rojo (pendiente confirmar si los quiere en gris).
- **Sin "·"** en textos, **sin emojis**, **nada de líneas punteadas**, sin texto curvo, sin estrellas decorativas, sin diseños cargados ni tarjetas innecesarias.
- **Primero celular**, pero sin sacrificar escritorio. Nada encimado, cortado ni apilado sin necesidad; botones horizontales cuando caben.
- **Los modales se cierran solo con la X** (tocar fuera no los cierra). Escape sí los cierra (decisión tomada).
- App interna: fondo de un solo tono `#e4e9ee`. En laptops (≥1024 px de ancho, ≤820 px de alto, con mouse) la app se dibuja al **90%** (`html[data-zoom="ok"]`). Las ventanas flotantes dividen sus coordenadas entre `zoomPagina()`.
- Páginas del cliente (reservas, comprobante de cita, encuesta, página no encontrada) en **tema grafito oscuro**: fondo `#0c0d0f` con polvo fino y grano, tarjetas `#202329`, acento `#eef1f5`, letra Geist. Cangrejo pequeño animado (solo tenazas y parpadeo) asomándose en las tarjetas o en el botón.
- Animaciones discretas: entradas cortas, nada de flotados lentos infinitos.
- Textos claros, sin frases de anuncio, títulos sencillos.

## Pendiente o por decidir

- **G5**: en escritorio, Ventas, Cortes, Finanzas e Historial viven en un recuadro con su propio scroll. Propuesta: quitar el recuadro y dejar la lista completa con sus páginas. Esperando autorización.
- Detalles de la segunda auditoría sin hacer: ticket de 80 mm al imprimir (sin fondo ni margen), nombres de puestos neutros, alinear tarjetas de puesto en Agregar usuario, ejemplo de motivo al anular comisión, quitar verdes/rojos que quedan en Cobro y en el cierre de corte, misma flecha en los pasos del corte, categorías de gasto duplicadas ("Papelería2").
- Por probar en dispositivo real: cobro con QR, Apple Pay y Google Pay, Safari en iPhone, impresión en impresora térmica.
- Ofrecido: pasar `/pagar` a tema oscuro; comprobantes por correo (Resend); aviso de "No vino" en la encuesta (requiere proveedor de mensajes).
- Para instalar como app en iPhone: agregar desde **www.crabsbarber.shop** (sin www redirige y muestra la barra de Safari) y con "Abrir como app web" encendido.

## Incidente reciente (14 nov)

Páginas colgadas 300 s en producción (Soporte, Inicio) después de muchos despliegues seguidos y de "Empezar de cero". Se corrigió: conexiones que se cierran solas, `maxDuration = 60` en el layout de la app, `global-error.tsx` con botón Recargar, recarga automática si la pestaña tiene una versión vieja, y SQL 0031 con timeouts. Si vuelve a pasar, revisar `get_runtime_logs` de Vercel y evitar publicar muchas versiones seguidas.
