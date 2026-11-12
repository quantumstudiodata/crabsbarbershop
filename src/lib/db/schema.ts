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
  serial,
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
  // Lo que el negocio quiere que le quede al mes (centavos). De aquí sale la meta diaria de cada barbero.
  metaMensual: integer("meta_mensual").notNull().default(0),
  // Efectivo que se sugiere al abrir la caja (centavos).
  fondoPredeterminado: integer("fondo_predeterminado").notNull().default(0),
  // Funciones opcionales: cada barbería decide cuáles usa.
  usaPropinas: boolean("usa_propinas").notNull().default(true),
  usaDescuentos: boolean("usa_descuentos").notNull().default(true),
  usaMetas: boolean("usa_metas").notNull().default(true),
  usaDividirPago: boolean("usa_dividir_pago").notNull().default(true),
  usaRentaSilla: boolean("usa_renta_silla").notNull().default(true),
  // Caja: con apertura manual alguien abre la caja contando el fondo; si no, se abre sola con el fondo sugerido.
  aperturaManual: boolean("apertura_manual").notNull().default(true),
  // compartida: una caja para todos. individual: cada trabajador abre y corta la suya.
  modeloCaja: text("modelo_caja").notNull().default("compartida"),
  // Si es obligatorio, no se puede cobrar con la caja de un día anterior abierta: primero se hace el corte.
  corteObligatorio: boolean("corte_obligatorio").notNull().default(true),
  // Al cerrar la caja se pueden adjuntar fotos o archivos (comprobantes de transferencias, vouchers de tarjeta).
  usaEvidenciaCorte: boolean("usa_evidencia_corte").notNull().default(false),
  usaPromociones: boolean("usa_promociones").notNull().default(false),
  // Pagos al equipo automáticos: cada periodo se da por pagado en su fecha de pago y se anota solo en Finanzas y la libreta.
  pagosEquipoAuto: boolean("pagos_equipo_auto").notNull().default(false),
  // Desde qué día se lleva la cuenta de lo pendiente al equipo (al encender los pagos automáticos). Vacío: desde su forma de pago.
  pagosEquipoDesde: date("pagos_equipo_desde"),
  // Renta de silla automática: cada periodo se da por cobrado en su fecha límite. Desde cuándo se lleva su cuenta.
  rentasAuto: boolean("rentas_auto").notNull().default(false),
  rentasDesde: date("rentas_desde"),
  // Citas y reservaciones en línea. La dirección pública es /reservar/<slug>.
  usaCitas: boolean("usa_citas").notNull().default(false),
  slug: text("slug"),
  // Horario del negocio por día de la semana (0 = domingo): { "1": ["10:00", "20:00"], ... }; día sin entrada = cerrado.
  horario: jsonb("horario").$type<Record<string, [string, string]>>().notNull().default({ "1": ["10:00", "20:00"], "2": ["10:00", "20:00"], "3": ["10:00", "20:00"], "4": ["10:00", "20:00"], "5": ["10:00", "20:00"], "6": ["10:00", "20:00"] }),
  // Días en que el negocio cierra (festivos): ["2026-12-25", ...]
  diasCerrados: jsonb("dias_cerrados").$type<string[]>().notNull().default([]),
  // Reglas de las reservaciones: anticipación, margen entre citas, opciones del cliente, pago y políticas.
  citasConfig: jsonb("citas_config").$type<Record<string, unknown>>().notNull().default({}),
  // Pagos en línea: cada negocio conecta su propia cuenta de Stripe (Connect). sin | pendiente | activa
  stripeCuenta: text("stripe_cuenta"),
  // Cuenta propia para recibir transferencias (se muestra al cobrar y al reservar). Sin comisión.
  transferenciaBanco: text("transferencia_banco").notNull().default(""),
  transferenciaClabe: text("transferencia_clabe").notNull().default(""),
  transferenciaTitular: text("transferencia_titular").notNull().default(""),
  stripeEstado: text("stripe_estado").notNull().default("sin"),
  usaComprobantes: boolean("usa_comprobantes").notNull().default(true),
  // Con comprobantes activos: si el comprobante es obligatorio en egresos pagados con transferencia o tarjeta.
  comprobanteObligatorio: boolean("comprobante_obligatorio").notNull().default(false),
  usaPeriodicidad: boolean("usa_periodicidad").notNull().default(true),
  // Formas de pago que se pueden usar al registrar un egreso.
  metodosEgreso: text("metodos_egreso").array().notNull().default(sql`'{efectivo,transferencia,tarjeta}'::text[]`),
  // Preparado para suscripciones: el plan y su estado son de cada negocio.
  plan: text("plan").notNull().default("inicial"),
  estadoCuenta: text("estado_cuenta").notNull().default("activa"),
  // Negocio de pruebas: solo estos se pueden restablecer o eliminar desde Soporte.
  esPrueba: boolean("es_prueba").notNull().default(false),
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
    // Cuenta de soporte de la plataforma (no de un negocio): puede limpiar los datos de prueba.
    esSoporte: boolean("es_soporte").notNull().default(false),
    rol: rolEnum("rol").notNull(),
    permisosExtra: text("permisos_extra").array().notNull().default(sql`'{}'::text[]`),
    // Permisos de su puesto que se le quitaron solo a esta persona.
    permisosQuitados: text("permisos_quitados").array().notNull().default(sql`'{}'::text[]`),
    // Puesto personalizado del negocio. Vacío: usa la plantilla de su rol.
    puestoId: uuid("puesto_id").references(() => puestos.id),
    activo: boolean("activo").notNull().default(true),
    debeCambiar: boolean("debe_cambiar").notNull().default(true),
    intentosFallidos: integer("intentos_fallidos").notNull().default(0),
    avatar: text("avatar").notNull().default("tijera"),
    // Meta personal de ventas por semana (centavos). 0 = sin meta.
    metaSemanal: integer("meta_semanal").notNull().default(0),
    // Horario propio por día (igual formato que el del negocio). Vacío: trabaja en el horario del negocio.
    horario: jsonb("horario").$type<Record<string, [string, string]> | null>(),
    // Acciones rápidas de Inicio elegidas por la persona: en qué orden y cuáles oculta.
    accionesRapidas: jsonb("acciones_rapidas").$type<{ orden: string[]; ocultas: string[] } | null>(),
    // Si aparece en la agenda y en las reservaciones en línea.
    atiendeCitas: boolean("atiende_citas").notNull().default(true),
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
  descripcion: text("descripcion").notNull().default(""),
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
    // Con caja individual, de quién es esta caja. Vacío = caja compartida.
    responsableId: uuid("responsable_id").references(() => usuarios.id),
    // Un corte con faltante queda pendiente hasta que alguien lo marca como revisado.
    revisadoPor: uuid("revisado_por").references(() => usuarios.id),
    revisadoEn: timestamp("revisado_en", { withTimezone: true }),
    // Cómo se cubrió un faltante: abrio, iguales, proporcional, manual o negocio.
    faltanteRegla: text("faltante_regla"),
  },
  (t) => [
    index("turnos_barberia_fecha_idx").on(t.barberiaId, t.fechaOperativa),
    // Solo puede haber un turno abierto por barbería (o por persona, con caja individual).
    uniqueIndex("turnos_un_abierto_uq").on(t.barberiaId, sql`coalesce(${t.responsableId}, '00000000-0000-0000-0000-000000000000'::uuid)`).where(sql`estado = 'abierto'`),
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
    // Clave del enlace de la encuesta que se comparte con el cliente al cobrar.
    tokenEncuesta: text("token_encuesta"),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex("ventas_folio_uq").on(t.barberiaId, t.folio),
    uniqueIndex("ventas_token_encuesta_uq").on(t.tokenEncuesta),
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
    // Promoción que se aplicó a este servicio, si hubo.
    promocionId: uuid("promocion_id"),
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
  // unica, semanal, quincenal o mensual.
  periodicidad: text("periodicidad").notNull().default("unica"),
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

// Gastos que se repiten, para registrarlos con un toque.
export const conceptosFrecuentes = pgTable("conceptos_frecuentes", {
  id: id(),
  barberiaId: barberiaId(),
  concepto: text("concepto").notNull(),
  categoria: text("categoria").notNull(),
  monto: integer("monto").notNull().default(0),
  metodo: text("metodo").notNull().default("efectivo"),
  periodicidad: text("periodicidad").notNull().default("mensual"),
  creadoEn: creadoEn(),
});

// Foto o archivo de un egreso. Se guarda en la base (máximo 2 MB) para no depender de otro servicio.
export const comprobantes = pgTable("comprobantes", {
  id: id(),
  barberiaId: barberiaId(),
  gastoId: uuid("gasto_id").notNull().references(() => gastos.id),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(),
  datos: text("datos").notNull(),
  creadoEn: creadoEn(),
});

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
  // Cada cuánto se le paga: dia | semana | quincena | mes | servicio. Vacío: igual que "periodo".
  frecuenciaPago: text("frecuencia_pago"),
  // Semanal: día de la semana en que cierra el periodo (0 domingo ... 6 sábado).
  diaCorte: integer("dia_corte"),
  // Días después del corte en que se paga (0 = el mismo día).
  diaPago: integer("dia_pago"),
  // Forma de pago habitual: efectivo | transferencia | otro.
  formaPago: text("forma_pago").notNull().default("efectivo"),
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

// Puestos que cada negocio crea (Recepcionista, Contador externo...). Parten de una plantilla y guardan sus propios permisos.
export const puestos = pgTable(
  "puestos",
  {
    id: id(),
    barberiaId: barberiaId(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion").notNull().default(""),
    // Plantilla de la que partió; define el menú principal (por ejemplo, si atiende clientes).
    plantilla: rolEnum("plantilla").notNull().default("duena"),
    permisos: text("permisos").array().notNull().default(sql`'{}'::text[]`),
    activo: boolean("activo").notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("puestos_uq").on(t.barberiaId, t.nombre)],
);

// Categorías de servicios, con su propio orden. Los servicios las enlazan por nombre.
export const categoriasServicio = pgTable(
  "categorias_servicio",
  {
    id: id(),
    barberiaId: barberiaId(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion").notNull().default(""),
    orden: integer("orden").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("categorias_servicio_uq").on(t.barberiaId, t.nombre)],
);

// Centro de ayuda: solicitudes que el equipo de un negocio envía al soporte de la plataforma.
export const solicitudesSoporte = pgTable(
  "solicitudes_soporte",
  {
    id: id(),
    barberiaId: barberiaId(),
    folio: serial("folio").notNull(),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    // problema, duda o mejora
    tipo: text("tipo").notNull(),
    categoria: text("categoria"),
    asunto: text("asunto").notNull(),
    // pendiente, revision, esperando, resuelto
    estado: text("estado").notNull().default("pendiente"),
    // baja, normal, alta, urgente
    prioridad: text("prioridad").notNull().default("normal"),
    responsableId: uuid("responsable_id").references(() => usuarios.id),
    // Página, puesto y errores recientes al momento de enviar: ayudan a diagnosticar sin preguntar.
    contexto: jsonb("contexto").notNull().default(sql`'{}'::jsonb`),
    creadoEn: creadoEn(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
    vistoUsuarioEn: timestamp("visto_usuario_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("solicitudes_soporte_estado_idx").on(t.estado, t.actualizadoEn), index("solicitudes_soporte_usuario_idx").on(t.usuarioId)],
);

export const mensajesSoporte = pgTable(
  "mensajes_soporte",
  {
    id: id(),
    solicitudId: uuid("solicitud_id").notNull().references(() => solicitudesSoporte.id, { onDelete: "cascade" }),
    autorId: uuid("autor_id").notNull().references(() => usuarios.id),
    deSoporte: boolean("de_soporte").notNull().default(false),
    texto: text("texto").notNull(),
    adjuntoNombre: text("adjunto_nombre"),
    adjuntoTipo: text("adjunto_tipo"),
    adjuntoDatos: text("adjunto_datos"),
    creadoEn: creadoEn(),
  },
  (t) => [index("mensajes_soporte_solicitud_idx").on(t.solicitudId, t.creadoEn)],
);

// Lo que pasó con cada solicitud: cambios de estado, prioridad y responsable.
export const eventosSoporte = pgTable(
  "eventos_soporte",
  {
    id: id(),
    solicitudId: uuid("solicitud_id").notNull().references(() => solicitudesSoporte.id, { onDelete: "cascade" }),
    autorId: uuid("autor_id").references(() => usuarios.id),
    accion: text("accion").notNull(),
    creadoEn: creadoEn(),
  },
  (t) => [index("eventos_soporte_solicitud_idx").on(t.solicitudId)],
);

// Fallos de la aplicación, del servidor o del navegador, para que soporte los vea sin investigar a mano.
export const erroresSistema = pgTable(
  "errores_sistema",
  {
    id: id(),
    barberiaId: uuid("barberia_id").references(() => barberias.id, { onDelete: "set null" }),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    origen: text("origen").notNull(),
    ruta: text("ruta").notNull().default(""),
    mensaje: text("mensaje").notNull(),
    digest: text("digest"),
    creadoEn: creadoEn(),
  },
  (t) => [index("errores_sistema_fecha_idx").on(t.creadoEn)],
);

// Remuneración de quienes no son barberos (los barberos usan reglas_comision). Es solo para llevar el control:
// no genera pagos ni egresos. Cambiarla cierra la anterior (vigente_hasta) para conservar el historial.
export const remuneraciones = pgTable(
  "remuneraciones",
  {
    id: id(),
    barberiaId: barberiaId(),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    // sueldo, hora, dia, comision, mixto, trabajo
    modalidad: text("modalidad").notNull(),
    monto: integer("monto").notNull().default(0),
    periodo: text("periodo").notNull().default("mes"),
    // Centésimas de porcentaje, sobre los servicios que realiza la persona.
    porcentaje: integer("porcentaje").notNull().default(0),
    horasSemana: integer("horas_semana").notNull().default(0),
    descripcion: text("descripcion").notNull().default(""),
    vigenteDesde: timestamp("vigente_desde", { withTimezone: true }).notNull().defaultNow(),
    vigenteHasta: timestamp("vigente_hasta", { withTimezone: true }),
    creadoEn: creadoEn(),
  },
  (t) => [index("remuneraciones_usuario_idx").on(t.usuarioId, t.vigenteHasta)],
);

// Evidencias de un corte de caja: fotos o PDF de transferencias, vouchers de tarjeta, etc.
export const evidenciasCorte = pgTable(
  "evidencias_corte",
  {
    id: id(),
    barberiaId: barberiaId(),
    turnoId: uuid("turno_id").notNull().references(() => turnosCaja.id),
    // Forma de pago a la que corresponde (Transferencia, Tarjeta...) o vacío si es general.
    etiqueta: text("etiqueta").notNull().default(""),
    nombre: text("nombre").notNull(),
    tipo: text("tipo").notNull(),
    datos: text("datos").notNull(),
    subidoPor: uuid("subido_por").references(() => usuarios.id),
    creadoEn: creadoEn(),
  },
  (t) => [index("evidencias_corte_turno_idx").on(t.turnoId)],
);

// Promociones del negocio: precio especial, descuento fijo o porcentual, paquete o por horario.
export const promociones = pgTable(
  "promociones",
  {
    id: id(),
    barberiaId: barberiaId(),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion").notNull().default(""),
    // precio | fijo | porcentaje | paquete | horario
    tipo: text("tipo").notNull(),
    // precio y paquete: precio final en centavos; fijo: centavos de descuento; porcentaje y horario: puntos base (20% = 2000).
    valor: integer("valor").notNull(),
    servicioIds: jsonb("servicio_ids").$type<string[]>().notNull().default([]),
    categorias: jsonb("categorias").$type<string[]>().notNull().default([]),
    desde: date("desde").notNull(),
    hasta: date("hasta"),
    // 0 = domingo ... 6 = sábado
    dias: jsonb("dias").$type<number[]>().notNull().default([0, 1, 2, 3, 4, 5, 6]),
    horaDesde: text("hora_desde"),
    horaHasta: text("hora_hasta"),
    // auto | codigo
    aplicacion: text("aplicacion").notNull().default("auto"),
    codigo: text("codigo"),
    enCobro: boolean("en_cobro").notNull().default(true),
    enLinea: boolean("en_linea").notNull().default(true),
    limiteUsos: integer("limite_usos"),
    usos: integer("usos").notNull().default(0),
    pausada: boolean("pausada").notNull().default(false),
    creadoPor: uuid("creado_por").references(() => usuarios.id),
    creadoEn: creadoEn(),
  },
  (t) => [index("promociones_barberia_idx").on(t.barberiaId)],
);

// Faltante de un corte de caja asignado a una persona; se resta de lo que se le paga.
export const faltantesCaja = pgTable(
  "faltantes_caja",
  {
    id: id(),
    barberiaId: barberiaId(),
    turnoId: uuid("turno_id").notNull().references(() => turnosCaja.id),
    usuarioId: uuid("usuario_id").notNull().references(() => usuarios.id),
    monto: integer("monto").notNull(),
    // abrio | iguales | proporcional | manual
    regla: text("regla").notNull(),
    fecha: date("fecha").notNull(),
    asignadoPor: uuid("asignado_por").references(() => usuarios.id),
    // revision | autorizado | descartado. Solo lo autorizado se descuenta (LFT art. 110).
    estado: text("estado").notNull().default("revision"),
    autorizadoPor: uuid("autorizado_por").references(() => usuarios.id),
    autorizadoEn: timestamp("autorizado_en", { withTimezone: true }),
    nota: text("nota").notNull().default(""),
    creadoEn: creadoEn(),
  },
  (t) => [index("faltantes_caja_usuario_idx").on(t.usuarioId, t.fecha), index("faltantes_caja_turno_idx").on(t.turnoId)],
);

// Descanso que se rota cada semana entre dos personas (por ejemplo, lunes y miércoles).
// En la semana de inicio, la persona 1 descansa el día 1 y la persona 2 el día 2; la semana siguiente se invierten.
export const rotacionesDescanso = pgTable("rotaciones_descanso", {
  id: id(),
  barberiaId: barberiaId(),
  persona1: uuid("persona1").notNull().references(() => usuarios.id),
  persona2: uuid("persona2").notNull().references(() => usuarios.id),
  dia1: integer("dia1").notNull(),
  dia2: integer("dia2").notNull(),
  // Lunes de la semana en la que empieza la rotación.
  semanaInicio: date("semana_inicio").notNull(),
  activo: boolean("activo").notNull().default(true),
  creadoEn: creadoEn(),
});

// Horarios bloqueados: comida, ausencia, vacaciones. Sin persona = bloquea a todo el negocio.
export const bloqueosAgenda = pgTable(
  "bloqueos_agenda",
  {
    id: id(),
    barberiaId: barberiaId(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fin: timestamp("fin", { withTimezone: true }).notNull(),
    motivo: text("motivo").notNull().default(""),
    creadoPor: uuid("creado_por").references(() => usuarios.id),
    creadoEn: creadoEn(),
  },
  (t) => [index("bloqueos_agenda_idx").on(t.barberiaId, t.inicio)],
);

// Citas. "apartada" es un horario guardado unos minutos mientras el cliente termina (por ejemplo, el pago).
export const citas = pgTable(
  "citas",
  {
    id: id(),
    barberiaId: barberiaId(),
    folio: text("folio").notNull(),
    clienteNombre: text("cliente_nombre").notNull(),
    clienteTelefono: text("cliente_telefono").notNull(),
    barberoId: uuid("barbero_id").notNull().references(() => usuarios.id),
    // El cliente eligió "cualquier barbero".
    indiferente: boolean("indiferente").notNull().default(false),
    inicio: timestamp("inicio", { withTimezone: true }).notNull(),
    fin: timestamp("fin", { withTimezone: true }).notNull(),
    duracionMin: integer("duracion_min").notNull(),
    // [{ servicioId, nombre, precio, duracionMin, descuento, promocionId }]
    servicios: jsonb("servicios").$type<{ servicioId: string; nombre: string; precio: number; duracionMin: number; descuento: number; promocionId: string | null }[]>().notNull(),
    total: integer("total").notNull(),
    pagado: integer("pagado").notNull().default(0),
    metodoPago: text("metodo_pago"),
    // sin_pago | anticipo | pagada
    estadoPago: text("estado_pago").notNull().default("sin_pago"),
    // Lo que el cliente dijo que va a transferir; se suma a "pagado" cuando el negocio confirma que llegó.
    transferenciaMonto: integer("transferencia_monto").notNull().default(0),
    // apartada | en_espera | llego | en_atencion | completada | no_asistio | cancelada | expirada
    estado: text("estado").notNull().default("en_espera"),
    observaciones: text("observaciones").notNull().default(""),
    // linea | negocio
    origen: text("origen").notNull().default("negocio"),
    // Enlace privado del cliente para ver, cambiar o cancelar su cita.
    token: text("token").notNull(),
    expiraEn: timestamp("expira_en", { withTimezone: true }),
    ventaId: uuid("venta_id").references(() => ventas.id),
    motivoCancelacion: text("motivo_cancelacion"),
    creadoPor: uuid("creado_por").references(() => usuarios.id),
    creadoEn: creadoEn(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("citas_agenda_idx").on(t.barberiaId, t.inicio),
    index("citas_barbero_idx").on(t.barberoId, t.inicio),
    uniqueIndex("citas_token_uq").on(t.token),
    uniqueIndex("citas_folio_uq").on(t.barberiaId, t.folio),
  ],
);

// Avisos por enviar (al cliente o al negocio). Se guardan aquí; el envío por WhatsApp u otro medio se conecta después.
export const notificacionesCita = pgTable(
  "notificaciones_cita",
  {
    id: id(),
    barberiaId: barberiaId(),
    citaId: uuid("cita_id").references(() => citas.id),
    // reserva_confirmada | pago_confirmado | cita_modificada | cita_cancelada | recordatorio | nueva_reserva
    tipo: text("tipo").notNull(),
    // cliente | negocio
    para: text("para").notNull(),
    destino: text("destino").notNull().default(""),
    mensaje: text("mensaje").notNull(),
    // pendiente | enviada | omitida
    estado: text("estado").notNull().default("pendiente"),
    programadaPara: timestamp("programada_para", { withTimezone: true }).notNull().defaultNow(),
    enviadaEn: timestamp("enviada_en", { withTimezone: true }),
    creadoEn: creadoEn(),
  },
  (t) => [index("notificaciones_cita_idx").on(t.barberiaId, t.estado, t.programadaPara)],
);

// Reseñas que deja el cliente desde la encuesta de su venta. Se atribuyen a quien atendió el primer servicio.
export const resenas = pgTable(
  "resenas",
  {
    id: id(),
    barberiaId: barberiaId(),
    ventaId: uuid("venta_id").notNull().references(() => ventas.id),
    barberoId: uuid("barbero_id").notNull().references(() => usuarios.id),
    calificacion: integer("calificacion").notNull(),
    comentario: text("comentario").notNull().default(""),
    cliente: text("cliente").notNull().default(""),
    respuesta: text("respuesta"),
    respondidaPor: uuid("respondida_por").references(() => usuarios.id),
    respondidaEn: timestamp("respondida_en", { withTimezone: true }),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("resenas_venta_uq").on(t.ventaId), index("resenas_barberia_idx").on(t.barberiaId, t.creadoEn)],
);

// Pagos en línea con Stripe: anticipos de citas y cobros con QR. Nunca se guardan datos de tarjetas:
// solo el identificador del intento de pago de Stripe, el monto y la marca y terminación que Stripe reporta.
// Un pago cuenta únicamente cuando llega el aviso verificado de Stripe (webhook).
export const pagosLinea = pgTable(
  "pagos_linea",
  {
    id: id(),
    barberiaId: barberiaId(),
    // cita | venta
    tipo: text("tipo").notNull(),
    // Enlace público del pago (página que abre el cliente al escanear el QR).
    token: text("token").notNull(),
    intento: text("intento"),
    citaId: uuid("cita_id").references(() => citas.id),
    ventaId: uuid("venta_id").references(() => ventas.id),
    monto: integer("monto").notNull(),
    propina: integer("propina").notNull().default(0),
    // pendiente | pagado | cancelado | reembolsado
    estado: text("estado").notNull().default("pendiente"),
    // Venta lista para registrarse cuando Stripe confirme (cobros con QR).
    plan: jsonb("plan").$type<Record<string, unknown>>(),
    // Lo que ve el cliente: conceptos y para quién es la propina.
    detalle: jsonb("detalle").$type<Record<string, unknown>>().notNull().default({}),
    tarjeta: text("tarjeta").notNull().default(""),
    creadoPor: uuid("creado_por").references(() => usuarios.id),
    creadoEn: creadoEn(),
    pagadoEn: timestamp("pagado_en", { withTimezone: true }),
  },
  (t) => [uniqueIndex("pagos_linea_token_uq").on(t.token), uniqueIndex("pagos_linea_intento_uq").on(t.intento), index("pagos_linea_barberia_idx").on(t.barberiaId, t.creadoEn)],
);
