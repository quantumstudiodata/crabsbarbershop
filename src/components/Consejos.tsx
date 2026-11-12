"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icono } from "./Icono";

type Consejo = { id: string; t: string; x: string };

// Consejos por pantalla. Cada uno sale una sola vez por persona; se cierran con Entendido.
const CONSEJOS: Record<string, Consejo[]> = {
  "/": [
    { id: "ini-pend", t: "Pendientes por registrar", x: "Aquí aparece lo que falta: clientes por llegar, cobros y transferencias por revisar. Se quita solo cuando lo registras." },
    { id: "ini-acc", t: "Tus acciones rápidas", x: "Toca Personalizar para ordenarlas a tu gusto y ocultar las que no uses." },
  ],
  "/cobrar": [
    { id: "cob-svc", t: "Cobrar en segundos", x: "Toca un servicio para agregarlo y usa + para repetirlo. Elige la forma de pago y cobra." },
    { id: "cob-tr", t: "Transferencias", x: "Al elegir Transferencia aparecen los datos de la cuenta del negocio para que el cliente los copie o se los mandes por WhatsApp." },
  ],
  "/citas": [
    { id: "cit-hora", t: "Agenda", x: "Toca una hora libre para agendar. La línea azul marca la hora actual." },
    { id: "cit-comp", t: "Que reserven solos", x: "Con Compartir reservaciones mandas tu enlace o QR y tus clientes agendan a cualquier hora." },
  ],
  "/analitica/finanzas": [{ id: "fin-egr", t: "Registra tus gastos", x: "Cada egreso que registras aquí se resta en Resumen para que veas la utilidad real del día y del mes." }],
  "/equipo": [{ id: "eq-pago", t: "Pagos al equipo", x: "Registra comisiones y sueldos desde aquí; todo queda en Pagos del equipo." }],
  "/ajustes/cobro": [{ id: "aj-cob", t: "Formas de cobro", x: "Aquí activas formas de pago, la cuenta para transferencias y los cobros en línea con tarjeta." }],
};
const CLAVE = "crabs-consejos";

export function Consejos({ usuario }: { usuario: string }) {
  const ruta = usePathname();
  const [vistos, setVistos] = useState<string[] | null>(null);
  const [cerrando, setCerrando] = useState(false);
  const clave = `${CLAVE}-${usuario}`;
  useEffect(() => { try { setVistos(JSON.parse(localStorage.getItem(clave) ?? "[]")); } catch { setVistos([]); } }, [clave]);
  const lista = CONSEJOS[ruta] ?? [];
  const actual = vistos ? lista.find((c) => !vistos.includes(c.id)) : undefined;
  // Espera un momento antes de aparecer, para no tapar la pantalla al llegar.
  const [listo, setListo] = useState(false);
  useEffect(() => { setListo(false); const t = setTimeout(() => setListo(true), 1200); return () => clearTimeout(t); }, [ruta]);
  if (!actual || !listo || !vistos) return null;
  const i = lista.indexOf(actual);
  const cerrar = (todos = false) => {
    setCerrando(true);
    setTimeout(() => {
      const nuevos = [...vistos, ...(todos ? lista.map((c) => c.id) : [actual.id])];
      try { localStorage.setItem(clave, JSON.stringify([...new Set(nuevos)])); } catch { /* sin almacenamiento */ }
      setVistos(nuevos); setCerrando(false);
    }, 220);
  };
  return (
    <aside className={`consejo ${cerrando ? "sale" : ""}`} role="status" key={actual.id}>
      <span className="consejo-i" aria-hidden="true"><Icono n="chispa" /></span>
      <span className="consejo-t"><small>Consejo{lista.length > 1 ? ` ${i + 1} de ${lista.length}` : ""}</small><b>{actual.t}</b><span>{actual.x}</span></span>
      <span className="consejo-acc">
        {lista.length > 1 && i < lista.length - 1 && <button type="button" className="consejo-omitir" onClick={() => cerrar(true)}>Omitir</button>}
        <button type="button" className="consejo-ok" onClick={() => cerrar()}>{i < lista.length - 1 ? "Siguiente" : "Entendido"}</button>
      </span>
    </aside>
  );
}
