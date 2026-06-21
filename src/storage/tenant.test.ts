import { afterEach, describe, expect, it } from "vitest";
import { configDir, dataRoot } from "./paths.js";

const norm = (s: string) => s.replace(/\\/g, "/");

afterEach(() => {
  delete process.env.FACTORY_TENANT;
});

describe("multi-tenant scoping", () => {
  it("is single-tenant (no subfolder) when FACTORY_TENANT is unset", () => {
    delete process.env.FACTORY_TENANT;
    expect(dataRoot()).not.toContain("_tenants");
    expect(norm(configDir())).toContain("src/config");
  });

  it("isolates data + config per tenant when set", () => {
    process.env.FACTORY_TENANT = "acme";
    expect(norm(dataRoot())).toContain("_tenants/acme");
    expect(norm(configDir())).toContain("tenants/acme/config");
  });
});
