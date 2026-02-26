/**
 * HTTP file download utility for fetching bootstrap files from URLs.
 * Supports basic HTTP/HTTPS URLs with timeout and size limits.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 1_000_000; // 1MB

export type HttpDownloadOptions = {
  timeoutMs?: number;
  maxBytes?: number;
};

export type HttpDownloadResult =
  | { ok: true; content: string; bytes: number }
  | { ok: false; error: string };

/**
 * Download content from an HTTP/HTTPS URL.
 * Returns the content as a UTF-8 string.
 */
export async function downloadFromHttpUrl(
  url: string,
  options?: HttpDownloadOptions,
): Promise<HttpDownloadResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  const trimmed = url.trim();
  if (!trimmed) {
    return { ok: false, error: "empty URL" };
  }

  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return { ok: false, error: "URL must start with http:// or https://" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(trimmed, {
      signal: controller.signal,
      headers: {
        "User-Agent": "OpenClaw/1.0",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (length > maxBytes) {
        return {
          ok: false,
          error: `content too large: ${length} bytes (max ${maxBytes})`,
        };
      }
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { ok: false, error: "no response body" };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      totalBytes += value.length;
      if (totalBytes > maxBytes) {
        reader.cancel();
        return {
          ok: false,
          error: `content too large: ${totalBytes} bytes (max ${maxBytes})`,
        };
      }
      chunks.push(value);
    }

    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const content = new TextDecoder("utf-8", { fatal: false }).decode(combined);
    return { ok: true, content, bytes: totalBytes };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error) {
      if (err.name === "AbortError") {
        return { ok: false, error: `timeout after ${timeoutMs}ms` };
      }
      return { ok: false, error: err.message };
    }
    return { ok: false, error: String(err) };
  }
}

/**
 * Download content from multiple URLs and return a map of URL -> content.
 * If any download fails, returns the first error.
 */
export async function downloadMultipleUrls(
  urls: Record<string, string>,
  options?: HttpDownloadOptions,
): Promise<{ ok: true; contents: Record<string, string> } | { ok: false; error: string }> {
  const contents: Record<string, string> = {};

  for (const [key, url] of Object.entries(urls)) {
    if (!url?.trim()) {
      continue;
    }

    const result = await downloadFromHttpUrl(url, options);
    if (!result.ok) {
      return { ok: false, error: `failed to download ${key}: ${result.error}` };
    }
    contents[key] = result.content;
  }

  return { ok: true, contents };
}

/**
 * Merge inline bootstrap files with URL-downloaded bootstrap files.
 * Inline content takes precedence over URL content.
 */
export async function resolveBootstrapFiles(params: {
  inline?: Record<string, string>;
  urls?: Record<string, string>;
  options?: HttpDownloadOptions;
}): Promise<{ ok: true; files: Record<string, string> } | { ok: false; error: string }> {
  const { inline, urls, options } = params;
  const files: Record<string, string> = {};

  // Download URLs first
  if (urls && Object.keys(urls).length > 0) {
    const downloadResult = await downloadMultipleUrls(urls, options);
    if (!downloadResult.ok) {
      return downloadResult;
    }
    Object.assign(files, downloadResult.contents);
  }

  // Inline content takes precedence
  if (inline) {
    for (const [key, content] of Object.entries(inline)) {
      if (content?.trim()) {
        files[key] = content;
      }
    }
  }

  return { ok: true, files };
}
