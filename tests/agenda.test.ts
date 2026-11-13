import { describe, expect, it } from "vitest";
import { CONFIG_CITAS, descansaPorRotacion, horariosLibres, instante, montoAPagar, ventanaDelDia, type Rotacion } from "@/lib/agenda";

const Z = "America/Monterrey";
const negocio = { "1": ["10:00", "20:00"], "2": ["10:00", "20:00"], "3": ["10:00", "20:00"], "4": ["10:00", "20:00"], "5": ["10:00", "20:00"], "6": ["10:00", "20:00"] } as Record<string, [string, string]>;
const rot: Rotacion[] = [{ persona1: "bere", persona2: "leo", dia1: 1, dia2: 3, semanaInicio: "2026-11-09", activo: true }];

describe("agenda", () => {
  it("horarios cada hora y el siguiente justo después del descanso", () => {
    const fecha = "2026-11-10";
    const ahora = instante(fecha, 7 * 60, Z);
    const config = { ...CONFIG_CITAS, pasoMin: 60, margenMin: 30 };
    const cita = { persona: "bere", inicio: instante(fecha, 660, Z), fin: instante(fecha, 720, Z) };
    const libres = horariosLibres({ fecha, zona: Z, ahora, duracion: 60, config, ventana: [600, 1200], persona: "bere", ocupados: [cita] });
    // Ocupado de 11:00 a 12:00 más 30 min de descanso: no se ofrece 12:00; sí 12:30 y luego 13:00.
    expect(libres.includes(720)).toBe(false);
    expect(libres.includes(750)).toBe(true);
    expect(libres.includes(780)).toBe(true);
    // 10:00 sí se ofrece (cabe antes de las 11:00) y los demás siguen cada hora: 14:00, 15:00...
    expect(libres.includes(840)).toBe(true);
  });
  it("instante respeta la zona del negocio", () => {
    // Monterrey es UTC-6: 10:00 local = 16:00 UTC.
    expect(new Date(instante("2026-11-10", 600, Z)).toISOString()).toBe("2026-11-10T16:00:00.000Z");
  });
  it("domingo cerrado y días festivos", () => {
    expect(ventanaDelDia("2026-11-15", negocio, [], null, [], "x")).toBeNull();
    expect(ventanaDelDia("2026-12-25", negocio, ["2026-12-25"], null, [], "x")).toBeNull();
    expect(ventanaDelDia("2026-11-10", negocio, [], null, [], "x")).toEqual([600, 1200]);
  });
  it("el descanso rota cada semana", () => {
    // Semana de inicio: Bere descansa lunes, Leo miércoles.
    expect(descansaPorRotacion(rot, "bere", "2026-11-09")).toBe(true);
    expect(descansaPorRotacion(rot, "leo", "2026-11-11")).toBe(true);
    expect(descansaPorRotacion(rot, "bere", "2026-11-11")).toBe(false);
    // Semana siguiente se invierte.
    expect(descansaPorRotacion(rot, "bere", "2026-11-18")).toBe(true);
    expect(descansaPorRotacion(rot, "leo", "2026-11-16")).toBe(true);
    // Y también hacia atrás.
    expect(descansaPorRotacion(rot, "leo", "2026-11-02")).toBe(true);
  });
  it("no ofrece horarios ocupados, respeta el margen y la anticipación", () => {
    const fecha = "2026-11-10";
    const ahora = instante(fecha, 9 * 60, Z); // 9:00
    const config = { ...CONFIG_CITAS, margenMin: 10, pasoMin: 30 };
    const cita = { persona: "bere", inicio: instante(fecha, 12 * 60, Z), fin: instante(fecha, 12 * 60 + 45, Z) };
    const libres = horariosLibres({ fecha, zona: Z, ahora, duracion: 45, config, ventana: [600, 1200], persona: "bere", ocupados: [cita] });
    // 9:00 + 2 h de anticipación: empieza a las 11:00.
    expect(libres[0]).toBe(660);
    // 11:30 terminaría 12:15 (choca), 12:00 y 12:30 chocan; 13:00 tampoco (12:45 + 10 de margen = 12:55, sí cabe a las 13:00).
    expect(libres.includes(690)).toBe(false);
    expect(libres.includes(720)).toBe(false);
    expect(libres.includes(750)).toBe(false);
    expect(libres.includes(780)).toBe(true);
    // La última que cabe antes de las 20:00 con 45 min: 19:00.
    expect(libres[libres.length - 1]).toBe(1140);
    // Otra persona no se ve afectada por la cita de Bere.
    expect(horariosLibres({ fecha, zona: Z, ahora, duracion: 45, config, ventana: [600, 1200], persona: "leo", ocupados: [cita] }).includes(720)).toBe(true);
    // Un bloqueo de todo el negocio afecta a todos.
    const bloqueo = { persona: null, inicio: instante(fecha, 14 * 60, Z), fin: instante(fecha, 15 * 60, Z) };
    expect(horariosLibres({ fecha, zona: Z, ahora, duracion: 30, config, ventana: [600, 1200], persona: "leo", ocupados: [bloqueo] }).includes(870)).toBe(false);
  });
  it("anticipo por porcentaje o cantidad", () => {
    expect(montoAPagar(15000, { modo: "anticipo_pct", valor: 3000 })).toEqual({ minimo: 4500, sugerido: 4500 });
    expect(montoAPagar(15000, { modo: "anticipo_fijo", valor: 5000 })).toEqual({ minimo: 5000, sugerido: 5000 });
    expect(montoAPagar(15000, { modo: "completo", valor: 0 }).minimo).toBe(15000);
    expect(montoAPagar(15000, { modo: "opcional", valor: 0 }).minimo).toBe(0);
  });
});
