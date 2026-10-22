// public/_headers: the security headers Workers Static Assets adds to the app's
// pages. Checked here because only a deployed (or previewed) build serves them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const file = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
const lines = file.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));

function header(name: string): string {
  const line = lines.find((l) => l.trim().toLowerCase().startsWith(`${name.toLowerCase()}:`));
  if (!line) throw new Error(`no ${name} in public/_headers`);
  return line.slice(line.indexOf(":") + 1).trim();
}

describe("public/_headers", () => {
  it("applies to every path", () => {
    expect(lines[0]).toBe("/*");
  });

  it("sets a CSP that allows the app, Google Fonts, Google avatars and our sockets, and forbids framing", () => {
    const csp = Object.fromEntries(
      header("Content-Security-Policy")
        .split(";")
        .map((d) => d.trim().split(/\s+/))
        .map(([k, ...v]) => [k!, v]),
    );
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["script-src"]).toEqual(["'self'"]);
    expect(csp["style-src"]).toContain("https://fonts.googleapis.com");
    expect(csp["font-src"]).toContain("https://fonts.gstatic.com");
    expect(csp["img-src"]).toEqual(expect.arrayContaining(["'self'", "blob:", "https://*.googleusercontent.com"]));
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["object-src"]).toEqual(["'none'"]);
    // The socket host must follow APP_URL (docs/RENAME.md).
    const wrangler = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    const appUrl = /"APP_URL":\s*"([^"]+)"/.exec(wrangler)![1]!;
    expect(csp["connect-src"]).toEqual(["'self'", `wss://${new URL(appUrl).host}`]);
  });

  it("sets nosniff, a referrer policy and frame denial", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("X-Frame-Options")).toBe("DENY");
  });
});
