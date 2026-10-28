# Crabs Barbería

Sistema de cobros, caja y reportes para Crabs Barbería (Tampico). Funciona en computadora, tableta y celular, y se puede instalar como aplicación.

## Qué incluye esta primera versión

| Pantalla | Para qué sirve |
| --- | --- |
| **Inicio** | Lo que entró hoy, comparado con el mismo día de la semana pasada a la misma hora. Para cada barbera, su propio día y su comisión estimada. |
| **Cobrar** | Tres pasos: qué se hizo, quién atendió y cómo pagó. Incluye descuento con motivo, propina aparte, pago dividido y folio automático. Un doble clic no cobra dos veces. |
| **Ventas** | Ventas por día. Se cancelan con motivo y nunca se borran. Si la caja de esa venta ya se cerró, el efectivo se devuelve desde la caja abierta. |
| **Caja** | Apertura con fondo, retiros, entradas, gastos pagados con la caja, cierre con conteo y cortes anteriores. Si falta o sobra más del límite, el cierre pide una explicación. La dueña puede corregir un cierre agregando un ajuste; el cierre original no se edita. |
| **Equipo** | Por semana: servicios, lo vendido, lo que le toca a cada barbera, lo que ya se le pagó y lo pendiente. Acepta porcentaje, monto fijo por servicio, renta de silla, sueldo fijo o sueldo más porcentaje. |
| **Reportes** | Semana, mes o fechas a elegir: ventas por día, lo que más se vendió, cómo pagaron, ventas por barbera y un estimado después de comisiones y gastos. Descarga a Excel (CSV). |
| **Ideas** | Calendario comercial. Con 8 semanas de ventas detecta horarios tranquilos y horarios llenos, y avisa de las fechas que vienen. Ninguna idea se aplica sola: la dueña la aprueba o la descarta. |
| **Ajustes** | Alta de personas con rol y permisos extra, contraseñas temporales, servicios y precios, formas de pago, límites del negocio, formas de pago del equipo e historial. |

### Roles

| Rol | Puede |
| --- | --- |
| Administración | Todo, más mantenimiento. |
| Dueña | Todo lo del negocio. |
| Encargada | Cobrar a cualquier barbera, dar descuentos, cancelar con motivo y operar la caja. |
| Barbera | Registrar sus servicios y ver solo lo suyo. |
| Contador | Ver reportes, equipo e historial y descargarlos. No puede cobrar ni cambiar nada. |

La dueña puede dar permisos extra a cada persona desde **Ajustes**.

### Contraseñas

- El usuario se arma con las iniciales de los nombres y el primer apellido. Por ejemplo, *María Paulette Whitaker Nava* queda como `MPWHITAKER`.
- Al dar de alta a alguien o restablecer su contraseña, el sistema genera una **temporal** con las iniciales y tres números (`MPWN931`). Se muestra **una sola vez** y la persona debe cambiarla al entrar.
- Las contraseñas se guardan cifradas. Nadie, ni la dueña, puede leerlas después. Si alguien la olvida, se restablece.
- Después de 5 intentos fallidos, el usuario se bloquea 15 minutos.

## Ponerlo en línea, paso a paso

Se necesitan dos cuentas gratuitas: **Supabase** (base de datos) y **Vercel** (donde vive la app).

### 1. Base de datos en Supabase

1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo.
   - Nombre: `crabs`.
   - Región: la más cercana, por ejemplo *East US*.
   - Guarda la contraseña de la base de datos en un lugar seguro.
2. En el proyecto, presiona **Connect** y copia dos cadenas de conexión:
   - **Session pooler** (puerto 5432): para preparar la base desde tu computadora.
   - **Transaction pooler** (puerto 6543): para Vercel.

### 2. Preparar la base desde tu computadora (una sola vez)

Necesitas tener **Node.js 20 o más nuevo** (<https://nodejs.org>, versión LTS) y **Git**.

```bash
git clone https://github.com/quantumstudiodata/crabsbarbershop.git
cd crabsbarbershop
npm install
cp .env.example .env
```

Abre `.env` y escribe:

- `DATABASE_URL`: la cadena del **Session pooler**, con tu contraseña.
- `SEED_DUENA_NOMBRE`: el nombre completo de tu hermana.
- `SEED_ADMIN_NOMBRE`: tu nombre completo.

Después corre:

```bash
npm run db:migrate   # crea las tablas
npm run db:seed      # crea la barbería, la dueña, tu usuario, servicios y formas de pago
```

`db:seed` muestra los usuarios y las contraseñas temporales **una sola vez**. Guárdalos.

### 3. Publicar en Vercel

1. Entra a <https://vercel.com> con tu cuenta de GitHub.
2. Ve a **Add New**, luego **Project**, e importa `quantumstudiodata/crabsbarbershop`.
3. En **Environment Variables** agrega `DATABASE_URL` con la cadena del **Transaction pooler** (puerto 6543).
4. Presiona **Deploy**. Vercel te da una dirección como `crabs-xxxx.vercel.app`.
5. Opcional: conecta un dominio propio en **Settings**, luego **Domains**.

Cada vez que se suba un cambio a la rama `main`, Vercel publica la nueva versión sola.

### 4. Primer uso

1. Entra con tu usuario y tu contraseña temporal, y elige una contraseña propia.
2. En **Ajustes**, luego **Servicios y precios**, confirma los precios. Los que vienen son de ejemplo.
3. Da de alta a las barberas y a la encargada en **Ajustes**, luego **Personas**.
4. En **Ajustes**, luego **Formas de pago del equipo**, configura cómo se le paga a cada una.
5. Abre la caja y empieza a cobrar.

### Instalarla como aplicación

- **Computadora (Chrome o Edge):** abre la dirección y presiona el ícono de instalar en la barra de direcciones. Queda con el ícono del cangrejo y se abre en su propia ventana.
- **Celular o tableta:** abre la dirección y elige **Agregar a pantalla de inicio**.

## Para desarrollar

```bash
npm run dev          # servidor local en http://localhost:3000
npm run test         # pruebas de las reglas de negocio
npm run typecheck    # revisión de tipos
npm run db:demo      # SOLO en una base local: equipo de ejemplo y 9 semanas de ventas inventadas
npm run db:generate  # crea una migración nueva después de cambiar src/lib/db/schema.ts
```

### Cómo está hecho

- **Next.js 15** (App Router y acciones de servidor) con TypeScript.
- **PostgreSQL** con **Drizzle ORM**. Las migraciones están en `drizzle/`.
- El dinero se guarda en **centavos** (enteros).
- Las fechas usan la zona `America/Monterrey`. Un turno que cierra después de medianoche cuenta para el día en que se abrió.
- **Varias barberías:** cada registro lleva el id de su barbería. El servidor lo toma siempre de la sesión, nunca de la URL ni del formulario.
- **Seguridad:**
  - Historial que no se puede editar ni borrar, y ventas que no se pueden borrar (reglas en la base de datos).
  - RLS activado en todas las tablas para cerrar la API pública de Supabase.
  - Sesiones en cookie `httpOnly`.
  - Contraseñas con bcrypt.
  - No se guardan datos de tarjetas.

### Cómo se calcula cada número

| Indicador | Fórmula |
| --- | --- |
| Ventas | precio de lista − descuentos, sin propinas ni ventas canceladas |
| Por cliente | ventas ÷ número de ventas |
| Efectivo que debe haber | fondo + cobros en efectivo + propinas en efectivo + entradas − retiros − gastos de caja − devoluciones |
| Diferencia de caja | lo que se contó − lo que debe haber |
| Comisión | se calcula sobre lo cobrado ya con descuento; nunca sobre la propina; se guarda con la regla vigente al cobrar |
| Le toca (semana) | comisiones + sueldo semanal; con renta de silla, lo que cobró para ella |
| Comparación | (actual − anterior) ÷ anterior, contra el mismo tramo del periodo anterior |
| Queda tras gastos registrados | ventas − comisiones − gastos anotados. Es un estimado, no la ganancia neta |
| Horario tranquilo | día y hora con menos del 70% de los servicios de una hora normal del negocio (con al menos 8 semanas de datos) |

## Qué sigue

- Fase 2: PIN rápido para cambiar de barbera en la tableta, modo sin conexión y descarga directa en `.xlsx`.
- Fase 3: clientes y tarjeta de lealtad, recibo por WhatsApp, citas en línea.
- Fase 4: suscripciones para otras barberías y facturación CFDI.
