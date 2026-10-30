import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Todo el dinero se guarda en centavos (enteros): $150.00 = 15000.

export const rolEnum = pgEnum("rol", ["admin", "duena", "encargada", "barbera", "contador"]);
export const estadoTurnoEnum = pgEnum("estado_turno", ["abierto", "cerrado"]);
export const estadoVentaEnum = pgEnum("estado_venta", ["pagada", "cancelada"]);
export const tipoMovimientoEnum = pgEnum("tipo_movimiento", ["entrada", "retiro", "devolucion"]);
export const tipoReglaEnum = pgEnum("tipo_regla", ["porcentaje", "fijo", "renta", "sueldo", "mixto"]);
export const tipoPagoComisionEnum = pgEnum("tipo_pago_comision", ["pago", "renta"]);
export const estadoIdeaEnum = pgEnum("estado_idea", ["aprobada", "descartada"]);

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const creadoEn = () => timestamp("creado_en", { withTimezone: true }).notNull().defaultNow();
const barberiaId = () =>
  uuid("barberia_id")
    .notNull()
    .references(() => barberias.id);

export const barberias = pgTable("barberias", {
  id: id(),
  nombre: text("nombre").notNull(),
  zonaHoraria: text("zona_horaria").notNull().default("America/Monterrey"),
  folioPrefijo: text("folio_prefijo").notNull().default("CRB"),
  siguienteFolio: integer("siguiente_folio").notNull().default(1),
  // Descuento máximo (en %) que puede dar alguien sin permiso especial.
  limiteDescuentoPct: integer("limite_descuento_pct").notNull().default(15),
  // Diferencia de caja (centavos) a partir de la cual se exige explicación.
  limiteDiferenciaCaja: integer("limite_diferencia_caja").notNull().default(5000),
  metaDiaria: integer("meta_diaria").notNull().default(0),
  // Efectivo que se sugiere al abrir la caja (centavos).
  fondoPredeterminado: integer("fondo_predeterminado").notNull().default(0),
  // Funciones opcionales: cada barbería decide cuáles usa.
  usaPropinas: boolean("usa_propinas").notNull().default(true),
  usaDescuentos: boolean("usa_descuentos").notNull().default(true),
  usaMetas: boolean("usa_metas").notNull().default(true),
  usaDividirPago: boolean("usa_dividir_pago").notNull().default(true),
  usaRentaSilla: boolean("usa_renta_silla").notNull().default(true),
  // Preparado para suscripciones: el plan y su estado son de cada negocio.
  plan: text("plan").notNull().default("inicial"),
  estadoCuenta: text("estado_cuenta").notNull().default("activa"),
  creadoEn: creadoEn(),
});

export const usuarios = pgTable(
  "usuarios",
  {
    id: id(),
    barberiaId: barberiaId(),
    nombre: text("nombre").notNull(),
    usuario: text("usuario").notNull(),
    hash: text("hash").notNull(),
    rol: rolEnum("rol").notNull(),
    permisosExtra: text("permisos_extra").array().notNull().default(sql`'{}'::text[]`),
    activo: boolean("activo").notNull().default(true),
    debeCambiar: boolean("debe_cambiar").notNull().default(true),
    intentosFallidos: integer("intentos_fallidos").notNull().default(0),
    avatar: text("avatar").notNull().default("tijera"),
    // Meta personal de ventas por semana (centavos). 0 = sin meta.
    metaSemanal: integer("meta_semanal").notNull().default(0),
    // Contraseña temporal cifrada, consultable por 30 minutos después de restablecerla.
    claveTemporal: text("clave_temporal"),
    claveTemporalExpira: timestamp("clave_temporal_expira", { withTimezone: true }),
    bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("usuarios_usuario_uq").on(t.usuario), index("usuarios_barberia_idx").on(t.barberiaId)],
);

export const sesiones = pgTable("sesiones", {
  // Se guarda el SHA-256 del token, nunca el token.
  id: text("id").primaryKey(),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id, { onDelete: "cascade" }),
  expiraEn: timestamp("expira_en", { withTimezone: true }).notNull(),
  creadoEn: creadoEn(),
});

export const servicios = pgTable("servicios", {
  id: id(),
  barberiaId: barberiaId(),
  nombre: text("nombre").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  duracionMin: integer("duracion_min").notNull().default(30),
  categoria: text("categoria").notNull().default("Cortes"),
  // Comisión especial de este servicio en puntos base (40% = 4000). Vacío = la de cada barbero.
  comision: integer("comision"),
  precio: integer("precio").notNull(),
  activo: boolean("activo").notNull().default(true),
  orden: integer("orden").notNull().default(0),
  creadoEn: creadoEn(),
});

export const metodosPago = pgTable("metodos_pago", {
  id: id(),
  barberiaId: barberiaId(),
  nombre: text("nombre").notNull(),
  esEfectivo: boolean("es_efectivo").notNull().default(false),
  activo: boolean("activo").notNull().default(true),
  orden: integer("orden").notNull().default(0),
});

export const turnosCaja = pgTable(
  "turnos_caja",
  {
    id: id(),
    barberiaId: barberiaId(),
    // Día al que pertenece el turno aunque se cierre después de medianoche.
    fechaOperativa: date("fecha_operativa").notNull(),
    estado: estadoTurnoEnum("estado").notNull().default("abierto"),
    fondoInicial: integer("fondo_inicial").notNull(),
    abiertoPor: uuid("abierto_por")
      .notNull()
      .references(() => usuarios.id),
    abiertoEn: timestamp("abierto_en", { withTimezone: true }).notNull().defaultNow(),
    cerradoPor: uuid("cerrado_por").references(() => usuarios.id),
    cerradoEn: timestamp("cerrado_en", { withTimezone: true }),
    efectivoEsperado: integer("efectivo_esperado"),
    efectivoContado: integer("efectivo_contado"),
    diferencia: integer("diferencia"),
    notasCierre: text("notas_cierre"),
    // Revisión de formas de pago que no son efectivo al cerrar: { "Transferencia": true, ... }
    verificacion: jsonb("verificacion").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [
    index("turnos_barberia_fecha_idx").on(t.barberiaId, t.fechaOperativa),
    // Solo puede haber un turno abierto por barbería.
    uniqueIndex("turnos_un_abierto_uq").on(t.barberiaId).where(sql`estado = 'abierto'`),
  ],
);

export const ajustesCierre = pgTable("ajustes_cierre", {
  id: id(),
  barberiaId: barberiaId(),
  turnoId: uuid("turno_id")
    .notNull()
    .references(() => turnosCaja.id),
  monto: integer("monto").notNull(),
  motivo: text("motivo").notNull(),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id),
  creadoEn: creadoEn(),
});

export const ventas = pgTable(
  "ventas",
  {
    id: id(),
    barberiaId: barberiaId(),
    folio: text("folio").notNull(),
    turnoId: uuid("turno_id")
      .notNull()
      .references(() => turnosCaja.id),
    registradaPor: uuid("registrada_por")
      .notNull()
      .references(() => usuarios.id),
    estado: estadoVentaEnum("estado").notNull().default("pagada"),
    total: integer("total").notNull(),
    descuentoTotal: integer("descuento_total").notNull().default(0),
    observaciones: text("observaciones").notNull().default(""),
    motivoCancelacion: text("motivo_cancelacion"),
    canceladaPor: uuid("cancelada_por").references(() => usuarios.id),
    canceladaEn: timestamp("cancelada_en", { withTimezone: true }),
    ventaOrigenId: uuid("venta_origen_id"),
    // Evita cobrar dos veces si se presiona el botón dos veces.
    claveUnica: text("clave_unica").notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex("ventas_folio_uq").on(t.barberiaId, t.folio),
    uniqueIndex("ventas_clave_uq").on(t.barberiaId, t.claveUnica),
    index("ventas_turno_idx").on(t.turnoId),
  ],
);

export const conceptos = pgTable(
  "conceptos",
  {
    id: id(),
    barberiaId: barberiaId(),
    ventaId: uuid("venta_id")
      .notNull()
      .references(() => ventas.id),
    servicioId: uuid("servicio_id").references(() => servicios.id),
    nombreServicio: text("nombre_servicio").notNull(),
    barberoId: uuid("barbero_id")
      .notNull()
      .references(() => usuarios.id),
    precioLista: integer("precio_lista").notNull(),
    descuento: integer("descuento").notNull().default(0),
    motivoDescuento: text("motivo_descuento"),
    autorizadoPor: uuid("autorizado_por").references(() => usuarios.id),
    precioCobrado: integer("precio_cobrado").notNull(),
    // Copia de la regla vigente al cobrar: cambiar la regla después no altera el pasado.
    reglaComision: jsonb("regla_comision"),
    comision: integer("comision").notNull().default(0),
  },
  (t) => [index("conceptos_venta_idx").on(t.ventaId), index("conceptos_barbero_idx").on(t.barberoId)],
);

export const pagos = pgTable(
  "pagos",
  {
    id: id(),
    barberiaId: barberiaId(),
    ventaId: uuid("venta_id")
      .notNull()
      .references(() => ventas.id),
    metodoPagoId: uuid("metodo_pago_id").references(() => metodosPago.id),
    nombreMetodo: text("nombre_metodo").notNull(),
    esEfectivo: boolean("es_efectivo").notNull(),
    monto: integer("monto").notNull(),
    // Para tarjeta o transferencia: solo la referencia del comprobante, nunca datos de la tarjeta.
    referencia: text("referencia"),
  },
  (t) => [index("pagos_venta_idx").on(t.ventaId)],
);

export const propinas = pgTable("propinas", {
  id: id(),
  barberiaId: barberiaId(),
  ventaId: uuid("venta_id")
    .notNull()
    .references(() => ventas.id),
  barberoId: uuid("barbero_id")
    .notNull()
    .references(() => usuarios.id),
  monto: integer("monto").notNull(),
  esEfectivo: boolean("es_efectivo").notNull(),
});

export const movimientosCaja = pgTable("movimientos_caja", {
  id: id(),
  barberiaId: barberiaId(),
  turnoId: uuid("turno_id")
    .notNull()
    .references(() => turnosCaja.id),
  tipo: tipoMovimientoEnum("tipo").notNull(),
  monto: integer("monto").notNull(),
  concepto: text("concepto").notNull(),
  ventaId: uuid("venta_id").references(() => ventas.id),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id),
  creadoEn: creadoEn(),
});

export const gastos = pgTable("gastos", {
  id: id(),
  barberiaId: barberiaId(),
  categoria: text("categoria").notNull(),
  concepto: text("concepto").notNull(),
  descripcion: text("descripcion").notNull().default(""),
  monto: integer("monto").notNull(),
  fecha: date("fecha").notNull(),
  // efectivo o transferencia. Solo el efectivo pagado con la caja abierta afecta el corte.
  metodo: text("metodo").notNull().default("efectivo"),
  // Si se pagó con el efectivo de la caja, aquí queda el turno.
  turnoId: uuid("turno_id").references(() => turnosCaja.id),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id),
  // Un gasto no se borra: se cancela con motivo y deja de contar.
  canceladoEn: timestamp("cancelado_en", { withTimezone: true }),
  canceladoPor: uuid("cancelado_por").references(() => usuarios.id),
  motivoCancelacion: text("motivo_cancelacion"),
  creadoEn: creadoEn(),
});

export const categoriasGasto = pgTable(
  "categorias_gasto",
  {
    id: id(),
    barberiaId: barberiaId(),
    nombre: text("nombre").notNull(),
    orden: integer("orden").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("categorias_gasto_uq").on(t.barberiaId, t.nombre)],
);

// Meses que se llevaban en Excel antes del sistema. Solo se consultan; las cifras nuevas salen de las ventas.
export const historicoMensual = pgTable(
  "historico_mensual",
  {
    id: id(),
    barberiaId: barberiaId(),
    mes: text("mes").notNull(),
    subtotal: integer("subtotal").notNull().default(0),
    egresos: integer("egresos").notNull().default(0),
    total: integer("total").notNull().default(0),
    // Lo de cada columna de la libreta (A, B...) cuando se conoce.
    porColumna: jsonb("por_columna").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("historico_mensual_uq").on(t.barberiaId, t.mes)],
);

export const reglasComision = pgTable("reglas_comision", {
  id: id(),
  barberiaId: barberiaId(),
  barberoId: uuid("barbero_id")
    .notNull()
    .references(() => usuarios.id),
  // Vacío = aplica a todos los servicios de esa persona.
  servicioId: uuid("servicio_id").references(() => servicios.id),
  tipo: tipoReglaEnum("tipo").notNull(),
  // Porcentaje en puntos base: 40% = 4000.
  porcentaje: integer("porcentaje").notNull().default(0),
  montoFijo: integer("monto_fijo").notNull().default(0),
  // Renta o sueldo por periodo (ver "periodo"). El nombre de la columna se conserva por compatibilidad.
  montoSemanal: integer("monto_semanal").notNull().default(0),
  periodo: text("periodo").notNull().default("semana"),
  vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
  vigenteHasta: timestamp("vigente_hasta", { withTimezone: true }),
});

export const pagosComision = pgTable("pagos_comision", {
  id: id(),
  barberiaId: barberiaId(),
  barberoId: uuid("barbero_id")
    .notNull()
    .references(() => usuarios.id),
  // pago: el negocio le paga al barbero. renta: el barbero le paga al negocio.
  tipo: tipoPagoComisionEnum("tipo").notNull(),
  monto: integer("monto").notNull(),
  semana: date("semana").notNull(),
  nota: text("nota").notNull().default(""),
  usuarioId: uuid("usuario_id")
    .notNull()
    .references(() => usuarios.id),
  creadoEn: creadoEn(),
});

export const ideas = pgTable(
  "ideas",
  {
    id: id(),
    barberiaId: barberiaId(),
    clave: text("clave").notNull(),
    titulo: text("titulo").notNull(),
    estado: estadoIdeaEnum("estado").notNull(),
    nota: text("nota").notNull().default(""),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("ideas_clave_uq").on(t.barberiaId, t.clave)],
);

// Bitácora: solo se agregan filas. Un trigger en la migración impide editarlas o borrarlas.
export const historial = pgTable(
  "historial",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    barberiaId: barberiaId(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    accion: text("accion").notNull(),
    tipo: text("tipo").notNull(),
    detalle: jsonb("detalle").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creadoEn(),
  },
  (t) => [index("historial_barberia_idx").on(t.barberiaId, t.creadoEn)],
);

// Solicitudes de "olvidé mi contraseña" que llegan al propietario y a administración.
export const solicitudesClave = pgTable(
  "solicitudes_clave",
  {
    id: id(),
    barberiaId: barberiaId(),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    atendida: boolean("atendida").notNull().default(false),
    creadoEn: creadoEn(),
  },
  (t) => [index("solicitudes_barberia_idx").on(t.barberiaId, t.atendida)],
);
