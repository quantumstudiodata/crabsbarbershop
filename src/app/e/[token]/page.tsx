import type { Metadata } from "next";
import { Encuesta } from "./Encuesta";
import { ventaDeEncuesta } from "./datos";

export const metadata: Metadata = { title: "¿Cómo te atendimos?", robots: { index: false } };

export default async function PaginaEncuesta({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const v = await ventaDeEncuesta(token);
  return (
    <main className="enc-pag fx">
      <section className="enc-tarjeta">
        {!v ? (
          <><h1>Encuesta no disponible</h1><p className="muted">Este enlace ya venció o no es válido.</p></>
        ) : v.contestada ? (
          <><small>{v.negocio}</small><h1>¡Gracias por tu opinión!</h1><p className="muted">Ya recibimos tu calificación de esta visita.</p></>
        ) : (
          <><small>{v.negocio}</small><h1>¿Cómo te atendimos?</h1><Encuesta token={token} barbero={v.barbero} /></>
        )}
      </section>
    </main>
  );
}
