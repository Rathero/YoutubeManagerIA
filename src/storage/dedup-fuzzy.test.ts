import { describe, expect, it } from "vitest";
import { jaccard, nearDuplicate } from "./dedup.js";

describe("fuzzy dedup", () => {
  it("scores word-set overlap", () => {
    expect(jaccard("la luz baja mañana", "la luz baja mañana")).toBe(1);
    expect(jaccard("la luz baja mañana", "mañana baja la luz")).toBe(1); // order-insensitive
    expect(jaccard("precio de la luz", "recetas de cocina")).toBeLessThan(0.3);
  });

  it("flags near-duplicates above the threshold", () => {
    const recent = ["Mañana la luz sube un 10%", "Receta de tortilla"];
    const near = nearDuplicate("Mañana la luz sube bastante", recent, 0.4);
    expect(near?.match).toContain("luz sube");
    expect(nearDuplicate("Tema completamente distinto hoy", recent, 0.7)).toBeNull();
  });
});
