const MAX_BYTES = 1_000_000;
const MAX_TEXT_LENGTH = 12_000;
const TIMEOUT_MS = 15_000;

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, number: string) =>
      String.fromCodePoint(Math.min(Number(number), 0x10ffff)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, number: string) =>
      String.fromCodePoint(Math.min(parseInt(number, 16), 0x10ffff)),
    );
}

function extractReadableText(html: string) {
  // Remove executable and non-content elements before extracting text.
  let page = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript\s*>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg\s*>/gi, " ")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, " ")
    .replace(/<canvas\b[^>]*>[\s\S]*?<\/canvas\s*>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template\s*>/gi, " ");

  // Remove Wayback toolbar elements. These elements may contain nested divs,
  // so remove their contents through the corresponding closing toolbar element.
  page = page.replace(
    /<(div|header|section)\b(?=[^>]*(?:id|class)=["'][^"']*(?:wm-ipp|wb-toolbar|wayback-toolbar|donato)[^"']*["'])[^>]*>[\s\S]*?<\/\1\s*>/gi,
    " ",
  );

  const titleMatch = page.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);

  const title = titleMatch
    ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300)
    : "";

  const text = page
    .replace(/<(nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(
      /<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr|\/main)[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:nbsp|amp|quot|apos|lt|gt);|&#(?:\d+|x[0-9a-f]+);/gi,
      (entity) => decodeHtmlEntities(entity),
    )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();

  // Keep the original decoded Unicode text. Do not apply a lossy encoding
  // conversion unless a genuine encoding problem has been demonstrated.
  return {
    title,
    text: text.slice(0, MAX_TEXT_LENGTH),
    truncated: text.length > MAX_TEXT_LENGTH,
    characterCount: Math.min(text.length, MAX_TEXT_LENGTH),
  };
}

async function readLimitedBody(response: Response): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_BYTES) {
        await reader.cancel();
        throw new Error("ARCHIVE_CONTENT_TOO_LARGE");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(combined);
}

export async function POST(request: Request) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 },
      );
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return Response.json(
        { error: "Request body must be a JSON object." },
        { status: 400 },
      );
    }

    const requestBody = body as Record<string, unknown>;
    const archiveUrl = requestBody.archiveUrl;

    if (typeof archiveUrl !== "string" || archiveUrl.length > 2_000) {
      return Response.json(
        { error: "Provide a valid archived page URL." },
        { status: 400 },
      );
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(archiveUrl);
    } catch {
      return Response.json(
        { error: "Provide a valid archived page URL." },
        { status: 400 },
      );
    }

    if (
      parsedUrl.protocol !== "https:" ||
      parsedUrl.hostname.toLowerCase() !== "web.archive.org" ||
      parsedUrl.username ||
      parsedUrl.password
    ) {
      return Response.json(
        {
          error:
            "Only HTTPS URLs hosted on web.archive.org are accepted for archive retrieval.",
        },
        { status: 400 },
      );
    }

    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let response: Response;

    try {
      response = await fetch(parsedUrl.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "User-Agent":
            "Afterlink/1.0 (archived documentation text extraction)",
          Accept: "text/html,text/plain;q=0.9",
        },
      });
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }

    if (response.status >= 300 && response.status < 400) {
      return Response.json(
        {
          error:
            "The archive redirected this request. For safety, Afterlink did not follow the redirect.",
          archiveUrl,
        },
        { status: 502 },
      );
    }

    if (!response.ok) {
      return Response.json(
        {
          error: `The archived page could not be retrieved (HTTP ${response.status}).`,
          archiveUrl,
        },
        { status: 502 },
      );
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (
      !contentType.includes("text/html") &&
      !contentType.includes("text/plain")
    ) {
      return Response.json(
        {
          error: "The archived resource is not an HTML or plain-text page.",
          archiveUrl,
          contentType,
        },
        { status: 415 },
      );
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);

    if (declaredLength > MAX_BYTES) {
      return Response.json(
        { error: "The archived page exceeds the 1 MB retrieval limit." },
        { status: 413 },
      );
    }

    const rawContent = await readLimitedBody(response);

    const extracted = extractReadableText(rawContent);

    if (!extracted.text) {
      return Response.json(
        {
          error:
            "The archived page was retrieved, but no readable text was extracted.",
          archiveUrl,
        },
        { status: 422 },
      );
    }

    return Response.json({
      archiveUrl,
      title: extracted.title,
      text: extracted.text,
      characterCount: extracted.characterCount,
      truncated: extracted.truncated,
      contentType,
      message:
        "Archived text extracted. Review it before using it as evidence.",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return Response.json(
        { error: "Retrieving the archived page timed out." },
        { status: 504 },
      );
    }

    if (
      error instanceof Error &&
      error.message === "ARCHIVE_CONTENT_TOO_LARGE"
    ) {
      return Response.json(
        { error: "The archived page exceeds the 1 MB retrieval limit." },
        { status: 413 },
      );
    }

    console.error("Archive content extraction failed:", error);

    return Response.json(
      { error: "Could not retrieve or extract the archived page." },
      { status: 500 },
    );
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}
