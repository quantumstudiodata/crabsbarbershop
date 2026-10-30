import ExcelJS from "exceljs";
import type { FilaAnio, MesLibreta } from "./libreta";

// Mismo acomodo que los archivos de Excel que llevaba la contadora, con fórmulas para que pueda seguir editándolos.

const MONEDA = '_-"$"* #,##0.00_-;-"$"* #,##0.00_-;_-"$"* "-"??_-;_-@_-';
const pesos = (centavos: number) => centavos / 100;
const letra = (n: number) => { let s = ""; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
const BORDE: Partial<ExcelJS.Borders> = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
const RELLENO: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };

function encabezado(h: ExcelJS.Worksheet, fila: number, col: number, textos: string[]) {
  textos.forEach((t, i) => {
    const c = h.getCell(fila, col + i);
    c.value = t; c.font = { bold: true }; c.fill = RELLENO; c.border = BORDE; c.alignment = { horizontal: "center" };
  });
}
function dinero(c: ExcelJS.Cell, v: number | { formula: string }) {
  c.value = typeof v === "number" ? pesos(v) : v;
  c.numFmt = MONEDA; c.border = BORDE;
}
function titulo(h: ExcelJS.Worksheet, celda: string, texto: string) {
  const c = h.getCell(celda);
  c.value = texto; c.font = { bold: true, size: 14 };
}

/** Hoja del mes: una tabla por semana, el resumen de semanas, los egresos y la utilidad. */
export async function excelMes(negocio: string, m: MesLibreta) {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet(m.titulo);
  const com = m.columnas.filter((c) => c.comision);
  const fij = m.columnas.filter((c) => !c.comision);
  const cabeza = ["Fecha", ...com.map((c) => c.nombre), "Subtotal", ...fij.map((c) => c.nombre), "Total"];
  const colSub = 2 + com.length;
  const colTot = colSub + fij.length + 1;
  h.columns = cabeza.map((_, i) => ({ width: i === 0 ? 18 : 14 }));
  titulo(h, "B2", `${negocio.toUpperCase()} ${m.titulo}`);

  let f = 5;
  const totalesSemana: number[] = [];
  for (const s of m.semanas) {
    encabezado(h, f, 1, cabeza);
    const ini = f + 1;
    for (const d of s.dias) {
      f++;
      const c0 = h.getCell(f, 1); c0.value = d.etiqueta; c0.border = BORDE;
      com.forEach((c, i) => dinero(h.getCell(f, 2 + i), d.valores[c.clave] ?? 0));
      dinero(h.getCell(f, colSub), { formula: com.length ? `SUM(B${f}:${letra(colSub - 1)}${f})` : "0" });
      fij.forEach((c, i) => dinero(h.getCell(f, colSub + 1 + i), d.valores[c.clave] ?? 0));
      dinero(h.getCell(f, colTot), { formula: fij.length ? `${letra(colSub)}${f}+SUM(${letra(colSub + 1)}${f}:${letra(colTot - 1)}${f})` : `${letra(colSub)}${f}` });
    }
    f++;
    const t = h.getCell(f, 1); t.value = "TOTAL:"; t.font = { bold: true }; t.border = BORDE;
    for (let c = 2; c <= colTot; c++) { dinero(h.getCell(f, c), { formula: `SUM(${letra(c)}${ini}:${letra(c)}${f - 1})` }); h.getCell(f, c).font = { bold: true }; }
    totalesSemana.push(f);
    f += 3;
  }

  // Resumen por semana
  encabezado(h, f, 1, ["Semana", ...cabeza.slice(1)]);
  const iniSem = f + 1;
  totalesSemana.forEach((tf, i) => {
    f++;
    const c0 = h.getCell(f, 1); c0.value = i + 1; c0.border = BORDE; c0.alignment = { horizontal: "center" };
    for (let c = 2; c <= colTot; c++) dinero(h.getCell(f, c), { formula: `${letra(c)}${tf}` });
  });
  f++;
  const filaTotal = f;
  for (let c = 2; c <= colTot; c++) { dinero(h.getCell(f, c), { formula: `SUM(${letra(c)}${iniSem}:${letra(c)}${f - 1})` }); h.getCell(f, c).font = { bold: true }; }

  // Egresos y utilidad
  f += 2;
  encabezado(h, f, 2, ["Egreso", "Cantidad"]);
  encabezado(h, f, 5, ["Concepto", "Subtotal", "Total"]);
  const iniEg = f + 1;
  const egresos = m.egresos.length ? m.egresos : [{ concepto: "Sin egresos", monto: 0 }];
  egresos.forEach((e, i) => {
    const r = iniEg + i;
    const c = h.getCell(r, 2); c.value = e.concepto; c.border = BORDE;
    dinero(h.getCell(r, 3), e.monto);
  });
  const filaEg = iniEg + egresos.length + 1;
  const te = h.getCell(filaEg, 2); te.value = "TOTAL:"; te.font = { bold: true };
  dinero(h.getCell(filaEg, 3), { formula: `SUM(C${iniEg}:C${filaEg - 1})` }); h.getCell(filaEg, 3).font = { bold: true };
  const filas: [string, string, string][] = [
    ["Ingresos", `${letra(colSub)}${filaTotal}`, `${letra(colTot)}${filaTotal}`],
    ["Egresos", `C${filaEg}`, `C${filaEg}`],
    ["Utilidad", `F${iniEg}-F${iniEg + 1}`, `G${iniEg}-G${iniEg + 1}`],
  ];
  filas.forEach(([n, a, b], i) => {
    const c = h.getCell(iniEg + i, 5); c.value = n; c.border = BORDE; if (n === "Utilidad") c.font = { bold: true };
    dinero(h.getCell(iniEg + i, 6), { formula: a });
    dinero(h.getCell(iniEg + i, 7), { formula: b });
    if (n === "Utilidad") { h.getCell(iniEg + i, 6).font = { bold: true }; h.getCell(iniEg + i, 7).font = { bold: true }; }
  });
  for (const k of ["E", "F", "G"]) if (h.getColumn(k).width! < 14) h.getColumn(k).width = 14;
  return libro.xlsx.writeBuffer();
}

/** Hoja anual: un bloque por año con Subtotal, Egresos, Utilidad, Total y Utilidad neta. */
export async function excelAnual(negocio: string, anios: { anio: string; filas: FilaAnio[] }[]) {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet("Anual");
  h.columns = [{ width: 4 }, { width: 14 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }];
  titulo(h, "C2", negocio.toUpperCase());
  let f = 5;
  for (const { anio, filas } of anios) {
    encabezado(h, f, 2, [anio, "SUBTOTAL", "EGRESOS", "UTILIDAD", "TOTAL", "UTILIDAD NETA"]);
    const ini = f + 1;
    for (const x of filas) {
      f++;
      const c = h.getCell(f, 2); c.value = x.nombre; c.border = BORDE;
      const vacio = x.origen === "vacio";
      for (const [col, v] of [[3, x.subtotal], [4, x.egresos], [6, x.total]] as [number, number][]) {
        const celda = h.getCell(f, col); celda.numFmt = MONEDA; celda.border = BORDE; if (!vacio) celda.value = pesos(v);
      }
      dinero(h.getCell(f, 5), { formula: `IF(F${f}="","",C${f}-D${f})` });
      dinero(h.getCell(f, 7), { formula: `IF(F${f}="","",F${f}-D${f})` });
    }
    f++;
    for (const col of [5, 7]) { dinero(h.getCell(f, col), { formula: `SUM(${letra(col)}${ini}:${letra(col)}${f - 1})` }); h.getCell(f, col).font = { bold: true }; }
    f += 3;
  }
  return libro.xlsx.writeBuffer();
}

/** Hoja por barbero: lo de cada quien por mes y su suma (ST). */
export async function excelBarberos(negocio: string, anios: { anio: string; columnas: { clave: string; nombre: string }[]; meses: { nombre: string; valores: Record<string, number> }[] }[]) {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet("Por barbero");
  titulo(h, "B2", negocio.toUpperCase());
  h.getColumn(2).width = 16;
  let f = 5;
  for (const { columnas, meses } of anios) {
    const n = columnas.length;
    for (let c = 3; c <= 3 + n; c++) if ((h.getColumn(c).width ?? 0) < 14) h.getColumn(c).width = 14;
    encabezado(h, f, 2, ["Mes/año", ...columnas.map((c) => c.nombre), "ST"]);
    const ini = f + 1;
    for (const m of meses) {
      f++;
      const c = h.getCell(f, 2); c.value = m.nombre; c.border = BORDE;
      columnas.forEach((col, i) => {
        const celda = h.getCell(f, 3 + i); celda.numFmt = MONEDA; celda.border = BORDE;
        if (m.valores[col.clave] !== undefined) celda.value = pesos(m.valores[col.clave]);
      });
      dinero(h.getCell(f, 3 + n), { formula: n ? `IF(COUNT(C${f}:${letra(2 + n)}${f})=0,"",SUM(C${f}:${letra(2 + n)}${f}))` : "0" });
    }
    f++;
    const t = h.getCell(f, 2); t.value = "TOTAL:"; t.font = { bold: true };
    for (let c = 3; c <= 3 + n; c++) { dinero(h.getCell(f, c), { formula: `SUM(${letra(c)}${ini}:${letra(c)}${f - 1})` }); h.getCell(f, c).font = { bold: true }; }
    f += 3;
  }
  return libro.xlsx.writeBuffer();
}
