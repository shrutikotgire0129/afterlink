import { NextRequest, NextResponse } from "next/server";

type LinkInput = {
  url: string;
  text?: string;
  line?: number;
};

type LinkResult = {
  url: string;
  text: string;
  line?: number;
  status: number | null;
  result: "working" | "broken" | "redirected" | "unverified" | "invalid";
  detail: string;
};

const MAX_LINKS = 30;
const TIMEOUT_MS = 8000;

function isPublicHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return false;
  }

  if (host.includes(":")) {
    return (
      (host === "::1" ||
        host === "::" ||
        host.startsWith("fc") ||
        host.startsWith("fd") ||
        host.startsWith("fe80:")) === false
    );
  }

  const parts = host.split(".");

  if (
    parts.length === 4 &&
    parts.every((part) => /^\d+$/.test(part) && Number(part) <= 255)
  ) {
    const [a, b] = parts.map(Number);

    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19))
    ) {
      return false;
    }
  }

  return true;
}

function validateUrl(value: string): URL | null {
  try {
    const url = new URL(value);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      !isPublicHostname(url.hostname) ||
      url.username ||
      url.password
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

async function checkLink(link: LinkInput): Promise<LinkResult> {
  const url = validateUrl(link.url);

  if (!url) {
    return {
      url: link.url,
      text: link.text ?? "",
      line: link.line,
      status: null,
      result: "invalid",
      detail: "Invalid URL or a URL that this checker does not allow.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": "Afterlink/0.1 documentation-link-checker",
      },
      cache: "no-store",
    });

    const status = response.status;

    if ([301, 302, 303, 307, 308].includes(status)) {
      return {
        url: link.url,
        text: link.text ?? "",
        line: link.line,
        status,
        result: "redirected",
        detail: "The URL redirects. The destination has not been verified.",
      };
    }

    if (status === 404 || status === 410) {
      return {
        url: link.url,
        text: link.text ?? "",
        line: link.line,
        status,
        result: "broken",
        detail:
          status === 404
            ? "The server returned HTTP 404 Not Found."
            : "The server returned HTTP 410 Gone.",
      };
    }

    if (status === 405 || status === 501) {
      return {
        url: link.url,
        text: link.text ?? "",
        line: link.line,
        status,
        result: "unverified",
        detail:
          "The server does not support this HEAD request. The link is not confirmed broken.",
      };
    }

    if (status === 401 || status === 403 || status === 429) {
      return {
        url: link.url,
        text: link.text ?? "",
        line: link.line,
        status,
        result: "unverified",
        detail:
          status === 429
            ? "The server rate-limited the request."
            : `The server returned HTTP ${status}. Access is restricted or blocked.`,
      };
    }

    if (status >= 200 && status < 300) {
      return {
        url: link.url,
        text: link.text ?? "",
        line: link.line,
        status,
        result: "working",
        detail: "The server accepted the HEAD request.",
      };
    }

    if (status >= 500) {
      return {
        url: link.url,
        text: link.text ?? "",
        line: link.line,
        status,
        result: "unverified",
        detail: `The server returned HTTP ${status}. This may be temporary.`,
      };
    }

    return {
      url: link.url,
      text: link.text ?? "",
      line: link.line,
      status,
      result: "unverified",
      detail: `HTTP ${status} does not establish that the link is broken.`,
    };
  } catch (error) {
    return {
      url: link.url,
      text: link.text ?? "",
      line: link.line,
      status: null,
      result: "unverified",
      detail:
        error instanceof Error && error.name === "AbortError"
          ? "The request timed out. The link's status remains unverified."
          : "The request failed. Network restrictions or server behavior may be responsible.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const links: unknown = body?.links;

    if (!Array.isArray(links)) {
      return NextResponse.json(
        { error: "Expected a links array." },
        { status: 400 },
      );
    }

    if (links.length > MAX_LINKS) {
      return NextResponse.json(
        { error: `Check at most ${MAX_LINKS} links per request.` },
        { status: 400 },
      );
    }

    const validInputs: LinkInput[] = [];

    for (const item of links) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.url !== "string" ||
        item.url.length > 2048 ||
        (item.text !== undefined && typeof item.text !== "string") ||
        (item.line !== undefined &&
          (!Number.isInteger(item.line) || item.line < 1))
      ) {
        return NextResponse.json(
          { error: "One or more links have an invalid format." },
          { status: 400 },
        );
      }

      validInputs.push({
        url: item.url,
        text: item.text,
        line: item.line,
      });
    }

    const results: LinkResult[] = [];

    for (const link of validInputs) {
      results.push(await checkLink(link));
    }

    return NextResponse.json({
      checked: results.length,
      results,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 },
      );
    }

    console.error("[Afterlink] Link checking failed:", error);

    return NextResponse.json(
      { error: "Link checking failed unexpectedly. Please try again." },
      { status: 500 },
    );
  }
}
