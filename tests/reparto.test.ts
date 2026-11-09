import { describe, expect, it } from "vitest";
import { repartir } from "@/lib/reparto";

describe("repartir faltante", () => {
  it("partes iguales sin perder centavos", () => {
    expect(repartir(10001, [1, 1, 1])).toEqual([3334, 3334, 3333]);
  });
  it("proporcional al efectivo", () => {
    expect(repartir(9000, [30000, 60000])).toEqual([3000, 6000]);
  });
  it("sin pesos no reparte", () => {
    expect(repartir(500, [0, 0])).toEqual([0, 0]);
  });
});
