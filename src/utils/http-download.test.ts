/**
 * Tests for HTTP download utility
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadFromHttpUrl } from "./http-download.js";

describe("http-download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("downloadFromHttpUrl", () => {
    it("should download content from HTTP URL successfully", async () => {
      const testContent = "test file content";
      const mockResponse = new Response(testContent, { status: 200 });

      vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse as any);

      const result = await downloadFromHttpUrl("http://example.com/test.txt");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.content).toBe(testContent);
      }
    });

    it("should download content from HTTPS URL successfully", async () => {
      const testContent = "secure content";
      const mockResponse = new Response(testContent, { status: 200 });

      vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse as any);

      const result = await downloadFromHttpUrl("https://example.com/secure.txt");

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.content).toBe(testContent);
      }
    });

    it("should reject non-HTTP URLs", async () => {
      const result = await downloadFromHttpUrl("ftp://example.com/file.txt");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("http:// or https://");
      }
    });

    it("should reject empty URLs", async () => {
      const result = await downloadFromHttpUrl("");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("empty URL");
      }
    });

    it("should handle HTTP errors", async () => {
      const mockResponse = new Response("Not Found", {
        status: 404,
        statusText: "Not Found",
      });

      vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse as any);

      const result = await downloadFromHttpUrl("http://example.com/notfound.txt");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("HTTP 404");
      }
    });
  });
});
