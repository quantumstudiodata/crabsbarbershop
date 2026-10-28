"use server";

import { redirect } from "next/navigation";
import { cerrarSesion } from "@/lib/auth";

export async function salir() {
  await cerrarSesion();
  redirect("/entrar");
}
