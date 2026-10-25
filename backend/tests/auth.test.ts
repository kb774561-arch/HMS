import { describe, expect, it } from "vitest";
import { buildWhatsAppLink } from "../src/utils/whatsapp.js";

describe("whatsapp link helper", () => {
  it("adds India country code for 10-digit numbers", () => {
    expect(buildWhatsAppLink("9876543210")).toBe("https://wa.me/919876543210");
  });

  it("returns null for empty input", () => {
    expect(buildWhatsAppLink(null)).toBeNull();
  });
});
