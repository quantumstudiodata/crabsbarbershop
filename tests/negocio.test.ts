import { describe, expect, it } from "vitest";
import { compararConteo, efectivoEsperado, requiereExplicacion } from "@/lib/caja";
import { comisionDeServicio, elegirRegla, resumenSemana, type Regla } from "@/lib/comisiones";
import { contrasenaTemporal, problemaContrasena, sugerirUsuario } from "@/lib/cuentas";
import { diaDeSemana, esFechaValida, fechaLocal, finDeMes, lunesDe, sumarDias } from "@/lib/fechas";
import { detectarFranjas, fechasComerciales } from "@/lib/ideas";
import { cambio, formatoDinero, leerPesos } from "@/lib/money";
import { permisosDe, rolesAsignables } from "@/lib/permisos";

describe("dinero", () => {
  it("lee montos escritos de varias formas", () => {
    expect(leerPesos("150")).toBe(15000);
    expect(leerPesos("$1,250")).toBe(125000);
    expect(leerPesos("12.5")).toBe(1250);
    expect(leerPesos("12,5")).toBe(1250);
    expect(leerPesos("0")).toBe(0);
    expect(leerPesos("-5")).toBeNull();
    expect(leerPesos("abc")).toBeNull();
    expect(leerPesos("1.234")).toBeNull();
  });
  it("muestra montos sin decimales cuando son pesos cerrados", () => {
    expect(formatoDinero(285000)).toBe("$2,850");
    expect(formatoDinero(1250)).toBe("$12.50");
    expect(formatoDinero(-5000)).toBe("−$50");
  });
  it("calcula el cambio entre periodos", () => {
    expect(cambio(112, 100)).toBe(12);
    expect(cambio(5, 0)).toBeNull();
  });
});

describe("caja", () => {
  const m = { fondoInicial: 50000, cobrosEfectivo: 132000, propinasEfectivo: 7000, entradas: 0, retiros: 15000, gastosDeCaja: 10000, devolucionesEfectivo: 0 };
  it("efectivo esperado = fondo + cobros + propinas + entradas − retiros − gastos − devoluciones", () => {
    expect(efectivoEsperado(m)).toBe(164000);
    expect(efectivoEsperado({ ...m, devolucionesEfectivo: 22000, entradas: 1000 })).toBe(143000);
  });
  it("compara el conteo y dice si cuadra, sobra o falta", () => {
    expect(compararConteo(164000, 164000, formatoDinero).estado).toBe("cuadro");
    const f = compararConteo(164000, 159000, formatoDinero);
    expect(f).toMatchObject({ estado: "falta", diferencia: -5000, texto: "Faltan $50." });
    expect(compararConteo(164000, 165000, formatoDinero).texto).toBe("Sobran $10.");
    expect(requiereExplicacion(-5000, 5000)).toBe(false);
    expect(requiereExplicacion(-5001, 5000)).toBe(true);
  });
});

describe("comisiones", () => {
  const base = { servicioId: null, porcentaje: 0, montoFijo: 0, montoSemanal: 0, vigenteDesde: new Date("2026-01-01"), vigenteHasta: null };
  it("calcula por tipo de regla y nunca sobre propinas", () => {
    expect(comisionDeServicio({ tipo: "porcentaje", porcentaje: 4000, montoFijo: 0, montoSemanal: 0 }, 22000)).toBe(8800);
    expect(comisionDeServicio({ tipo: "fijo", porcentaje: 0, montoFijo: 6000, montoSemanal: 0 }, 22000)).toBe(6000);
    expect(comisionDeServicio({ tipo: "fijo", porcentaje: 0, montoFijo: 6000, montoSemanal: 0 }, 5000)).toBe(5000);
    expect(comisionDeServicio({ tipo: "sueldo", porcentaje: 0, montoFijo: 0, montoSemanal: 150000 }, 22000)).toBe(0);
    expect(comisionDeServicio({ tipo: "renta", porcentaje: 0, montoFijo: 0, montoSemanal: 80000 }, 22000)).toBe(22000);
    expect(comisionDeServicio(null, 22000)).toBe(0);
  });
  it("prefiere la regla del servicio y respeta la vigencia", () => {
    const reglas: Regla[] = [
      { ...base, barberoId: "ana", tipo: "porcentaje", porcentaje: 4000 },
      { ...base, barberoId: "ana", servicioId: "barba", tipo: "fijo", montoFijo: 5000 },
      { ...base, barberoId: "ana", tipo: "porcentaje", porcentaje: 3000, vigenteHasta: new Date("2026-01-01") },
    ];
    const cuando = new Date("2026-10-27");
    expect(elegirRegla(reglas, "ana", "barba", cuando)?.tipo).toBe("fijo");
    expect(elegirRegla(reglas, "ana", "corte", cuando)?.porcentaje).toBe(4000);
    expect(elegirRegla(reglas, "luz", "corte", cuando)).toBeNull();
  });
  it("resume la semana con sueldo, pagos y renta", () => {
    const k = resumenSemana({ reglaGeneral: { tipo: "mixto", porcentaje: 2000, montoFijo: 0, montoSemanal: 150000 }, servicios: 16, vendido: 310000, propinas: 0, comisiones: 62000, pagado: 150000, rentaPagada: 0 });
    expect(k.leToca).toBe(212000);
    expect(k.pendiente).toBe(62000);
    const l = resumenSemana({ reglaGeneral: { tipo: "renta", porcentaje: 0, montoFijo: 0, montoSemanal: 80000 }, servicios: 27, vendido: 524000, propinas: 0, comisiones: 524000, pagado: 0, rentaPagada: 80000 });
    expect(l.renta).toBe(80000);
    expect(l.rentaPendiente).toBe(0);
    expect(l.leToca).toBe(524000);
  });
});

describe("cuentas", () => {
  it("arma el usuario con iniciales y primer apellido", () => {
    expect(sugerirUsuario("María Paulette Whitaker Nava")).toBe("MPWHITAKER");
    expect(sugerirUsuario("Ana Martínez López")).toBe("AMARTINEZ");
    expect(sugerirUsuario("Luz Hernández")).toBe("LHERNANDEZ");
    expect(sugerirUsuario("Ana Martínez López", ["AMARTINEZ"])).toBe("AMARTINEZ2");
    expect(sugerirUsuario("José Ñúñez de la Peña")).toBe("JNUNEZ");
  });
  it("contraseña temporal: iniciales más 3 dígitos", () => {
    expect(contrasenaTemporal("María Paulette Whitaker Nava", () => 0.931)).toBe("MPWN931");
    expect(contrasenaTemporal("Karla Ruiz Pérez", () => 0.004)).toBe("KRP004");
  });
  it("pide contraseñas propias razonables", () => {
    expect(problemaContrasena("corta1", "AMARTINEZ")).not.toBeNull();
    expect(problemaContrasena("solamenteletras", "AMARTINEZ")).not.toBeNull();
    expect(problemaContrasena("amartinez2024", "AMARTINEZ")).not.toBeNull();
    expect(problemaContrasena("tijeras2024", "AMARTINEZ")).toBeNull();
  });
});

describe("permisos", () => {
  it("cada rol ve solo lo suyo", () => {
    expect(permisosDe("barbera").has("ventas.cancelar")).toBe(false);
    expect(permisosDe("barbera", ["ventas.cancelar"]).has("ventas.cancelar")).toBe(true);
    expect(permisosDe("barbera", ["no.existe"]).size).toBe(1);
    expect(permisosDe("contador").has("ventas.registrar")).toBe(false);
    expect(permisosDe("contador").has("reportes.exportar")).toBe(true);
    expect(rolesAsignables("duena")).not.toContain("admin");
    expect(rolesAsignables("encargada")).toEqual([]);
  });
});

describe("fechas", () => {
  it("usa la hora de Tampico, también cerca de medianoche", () => {
    expect(fechaLocal(new Date("2026-10-28T05:30:00Z"))).toBe("2026-10-27");
    expect(fechaLocal(new Date("2026-10-28T06:30:00Z"))).toBe("2026-10-28");
  });
  it("calcula semanas y meses", () => {
    expect(lunesDe("2026-10-27")).toBe("2026-10-26");
    expect(lunesDe("2026-11-01")).toBe("2026-10-26");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(finDeMes("2028-02-10")).toBe("2028-02-29");
    expect(diaDeSemana("2026-10-27")).toBe(2);
    expect(esFechaValida("2026-02-30")).toBe(false);
    expect(esFechaValida("2026-02-28")).toBe(true);
  });
});

describe("ideas", () => {
  it("espera 8 semanas de datos antes de sugerir horarios", () => {
    const r = detectarFranjas([{ fecha: "2026-10-20", hora: 12 }], "2026-10-27");
    expect(r.listo).toBe(false);
  });
  it("detecta los martes al mediodía como horario tranquilo", () => {
    const servicios: { fecha: string; hora: number }[] = [];
    let f = "2026-08-31"; // lunes
    while (f <= "2026-10-25") {
      for (let h = 10; h < 20; h++) {
        const martesMediodia = diaDeSemana(f) === 2 && h >= 12 && h < 15;
        const n = martesMediodia ? 0 : diaDeSemana(f) === 5 ? 4 : 2;
        for (let i = 0; i < n; i++) servicios.push({ fecha: f, hora: h });
      }
      f = sumarDias(f, 1);
    }
    // Unas ventas sueltas de noche no deben volver "tranquilas" las horas en que el local está cerrado.
    servicios.push({ fecha: "2026-10-24", hora: 23 }, { fecha: "2026-10-24", hora: 22 });
    const r = detectarFranjas(servicios, "2026-10-27");
    expect(r.listo).toBe(true);
    if (r.listo) {
      expect(r.flojas).toHaveLength(1);
      expect(r.flojas[0]).toMatchObject({ dia: 2, desde: 12, hasta: 15 });
      expect(r.picos[0].dia).toBe(5);
    }
  });
  it("lista fechas comerciales próximas en orden", () => {
    const fs = fechasComerciales("2026-10-28", 30);
    expect(fs[0]).toMatchObject({ fecha: "2026-10-31", titulo: "Quincena" });
    expect(fs.some((x) => x.titulo === "Buen Fin")).toBe(true);
  });
});
