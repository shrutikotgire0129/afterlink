import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextRequest, NextResponse } from "next/server";

const MAX_URL_LENGTH = 2048;
const MAX_BYTES = 1_000_000;
const MAX_TEXT_LENGTH = 30000;
const MAX_DIFF_LINES = 30;
const TIMEOUT_MS = 12_000;

type PageContent = {
  title: string;
  text: string;
  characterCount: number;
  truncated: boolean;
};

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }

  const [a, b, c] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function isPrivateIPv6(address: string): boolean {
  const value = address.toLowerCase().split("%")[0];

  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("2001:db8:") ||
    value.startsWith("::ffff:")
  );
}

async function validatePublicUrl(value: string): Promise<URL | null> {
  try {
    if (
      typeof value !== "string" ||
      value.length === 0 ||
      value.length > MAX_URL_LENGTH
    ) {
      return null;
    }

    const url = new URL(value);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.port ||
      url.hostname.endsWith(".") ||
      url.hostname.length === 0
    ) {
      return null;
    }

    const hostname = url.hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      isIP(hostname)
    ) {
      return null;
    }

    const addresses = await lookup(hostname, { all: true, verbatim: true });

    if (
      addresses.length === 0 ||
      addresses.some(({ address, family }) =>
        family === 4
          ? isPrivateIPv4(address)
          : family === 6
            ? isPrivateIPv6(address)
            : true,
      )
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, number: string) => {
      const code = Number(number);
      return code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, number: string) => {
      const code = parseInt(number, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    });
}

function extractReadableText(html: string): PageContent {
  let page = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(
      /<(script|style|noscript|svg|iframe|canvas|template|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    );

  // Remove known Internet Archive toolbar and injected interface elements.
  page = page
    .replace(
      /<(div|header|section|nav)\b(?=[^>]*(?:id|class)=["'][^"']*(?:wm-ipp|wb-toolbar|wayback-toolbar|donato|wm-ipp-base|wm-ipp-print)[^"']*["'])[^>]*>[\s\S]*?<\/\1\s*>/gi,
      " ",
    )
    .replace(
      /<iframe\b[^>]*(?:web\.archive\.org|archive\.org)[^>]*>[\s\S]*?<\/iframe\s*>/gi,
      " ",
    );

  const titleMatch = page.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);

  const title = titleMatch
    ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]*>/g, " "))
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 300)
    : "";

  // Prefer the document's main content when a main/article element exists.
  const mainMatch = page.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1\s*>/i);

  const contentHtml = mainMatch ? mainMatch[2] : page;

  const text = decodeHtmlEntities(
    contentHtml
      .replace(/<(nav|footer|header|aside)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(
        /<(br|\/p|\/div|\/li|\/h[1-6]|\/section|\/article|\/tr|\/main)[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  return {
    title,
    text: text.slice(0, MAX_TEXT_LENGTH),
    characterCount: Math.min(text.length, MAX_TEXT_LENGTH),
    truncated: text.length > MAX_TEXT_LENGTH,
  };
}

async function fetchPage(url: URL): Promise<PageContent> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "Afterlink/1.0 documentation comparison",
        Accept: "text/html,text/plain;q=0.9",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      throw new Error("PAGE_REDIRECTED");
    }

    if (!response.ok) {
      throw new Error(`PAGE_HTTP_${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (
      !contentType.toLowerCase().includes("text/html") &&
      !contentType.toLowerCase().includes("text/plain")
    ) {
      throw new Error("UNSUPPORTED_CONTENT_TYPE");
    }

    const declaredLength = Number(response.headers.get("content-length") ?? 0);

    if (declaredLength > MAX_BYTES) {
      throw new Error("CONTENT_TOO_LARGE");
    }

    if (!response.body) {
      throw new Error("EMPTY_RESPONSE");
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
          throw new Error("CONTENT_TOO_LARGE");
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

    const rawText = new TextDecoder("utf-8", {
      fatal: false,
    }).decode(combined);

    const content = extractReadableText(rawText);

    if (!content.text) {
      throw new Error("NO_READABLE_TEXT");
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function compareLines(originalText: string, archivedText: string) {
  const originalLines = originalText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const archivedLines = archivedText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter(Boolean);

  const originalSet = new Set(originalLines);
  const archivedSet = new Set(archivedLines);

  const added = [...new Set(archivedLines)].filter(
    (line) => !originalSet.has(line),
  );

  const removed = [...new Set(originalLines)].filter(
    (line) => !archivedSet.has(line),
  );

  return {
    addedLines: added.slice(0, MAX_DIFF_LINES),
    removedLines: removed.slice(0, MAX_DIFF_LINES),
    addedLineCount: added.length,
    removedLineCount: removed.length,
    unchangedLineCount: [...new Set(originalLines)].filter((line) =>
      archivedSet.has(line),
    ).length,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const originalUrlValue = body?.originalUrl;
    const archiveUrlValue = body?.archiveUrl;
    const timestamp = body?.timestamp;

    if (
      typeof originalUrlValue !== "string" ||
      typeof archiveUrlValue !== "string" ||
      typeof timestamp !== "string" ||
      !/^\d{14}$/.test(timestamp)
    ) {
      return NextResponse.json(
        {
          error:
            "Provide an original URL, archive URL, and valid capture timestamp.",
        },
        { status: 400 },
      );
    }

    const originalUrl = await validatePublicUrl(originalUrlValue);

    if (!originalUrl) {
      return NextResponse.json(
        {
          error: "The original URL is not an accepted public HTTP(S) address.",
        },
        { status: 400 },
      );
    }

    let archiveUrl: URL;

    try {
      archiveUrl = new URL(archiveUrlValue);
    } catch {
      return NextResponse.json(
        { error: "The archive URL is invalid." },
        { status: 400 },
      );
    }

    const expectedPrefix = `/web/${timestamp}/`;
    const archivedOriginalValue = archiveUrl.pathname.startsWith(expectedPrefix)
      ? archiveUrl.pathname.slice(expectedPrefix.length)
      : "";

    let archivedOriginal: URL | null = null;

    if (archivedOriginalValue) {
      archivedOriginal = await validatePublicUrl(archivedOriginalValue);
    }

    if (
      archiveUrl.protocol !== "https:" ||
      archiveUrl.hostname !== "web.archive.org" ||
      archiveUrl.username ||
      archiveUrl.password ||
      archiveUrl.port ||
      !archivedOriginal ||
      archivedOriginal.toString() !== originalUrl.toString()
    ) {
      return NextResponse.json(
        {
          error:
            "The archive URL does not match the supplied original URL and capture timestamp.",
        },
        { status: 400 },
      );
    }

    const archiveAddresses = await lookup("web.archive.org", {
      all: true,
      verbatim: true,
    });

    if (
      archiveAddresses.some(({ address, family }) =>
        family === 4
          ? isPrivateIPv4(address)
          : family === 6
            ? isPrivateIPv6(address)
            : true,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The archive host did not resolve to accepted public addresses.",
        },
        { status: 502 },
      );
    }

    const archivedContent = await fetchPage(archiveUrl);

    // Do not follow redirects. This avoids silently comparing a different URL.
    const originalContent = await fetchPage(originalUrl);

    const diff = compareLines(originalContent.text, archivedContent.text);

    return NextResponse.json({
      originalUrl: originalUrl.toString(),
      archiveUrl: archiveUrl.toString(),
      timestamp,
      originalTitle: originalContent.title,
      archivedTitle: archivedContent.title,
      originalCharacterCount: originalContent.characterCount,
      archivedCharacterCount: archivedContent.characterCount,
      originalTruncated: originalContent.truncated,
      archivedTruncated: archivedContent.truncated,
      ...diff,
      message:
        originalContent.truncated || archivedContent.truncated
          ? "Comparison completed on truncated text. Differences may be incomplete."
          : "Comparison completed on extracted readable text. This is a line-based comparison, not a semantic or source-code diff.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";

    if (message === "PAGE_REDIRECTED") {
      return NextResponse.json(
        {
          error:
            "One page redirected. For safety, Afterlink did not follow the redirect; compare the destination URL separately.",
        },
        { status: 502 },
      );
    }

    if (message === "CONTENT_TOO_LARGE") {
      return NextResponse.json(
        { error: "A page exceeded the 1 MB retrieval limit." },
        { status: 413 },
      );
    }

    if (message === "UNSUPPORTED_CONTENT_TYPE") {
      return NextResponse.json(
        { error: "A page was not HTML or plain text." },
        { status: 415 },
      );
    }

    if (message === "NO_READABLE_TEXT" || message === "EMPTY_RESPONSE") {
      return NextResponse.json(
        {
          error:
            "A page was retrieved, but no readable text could be extracted.",
        },
        { status: 422 },
      );
    }

    if (message === "AbortError" || message.includes("timed out")) {
      return NextResponse.json(
        {
          error: "A page retrieval timed out. Try the comparison again later.",
        },
        { status: 504 },
      );
    }

    if (message.startsWith("PAGE_HTTP_")) {
      return NextResponse.json(
        {
          error: `A page could not be retrieved (${message.replace("PAGE_HTTP_", "HTTP ")}).`,
        },
        { status: 502 },
      );
    }

    console.error("Content comparison failed:", error);

    return NextResponse.json(
      { error: "Could not compare the original page and archived capture." },
      { status: 502 },
    );
  }
}
