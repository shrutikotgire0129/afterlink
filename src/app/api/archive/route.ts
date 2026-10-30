import { NextRequest, NextResponse } from "next/server";

const MAX_URL_LENGTH = 2048;
const TIMEOUT_MS = 10000;

type ArchiveCapture = {
  timestamp: string;
  original: string;
  status: string;
  mimeType: string;
  archiveUrl: string;
};

function validatePublicUrl(value: string): URL | null {
  try {
    const url = new URL(value);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return null;
    }

    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

    if (
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "metadata.google.internal"
    ) {
      return null;
    }

    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

    if (ipv4) {
      const octets = ipv4.slice(1).map(Number);

      if (octets.some((part) => part < 0 || part > 255)) {
        return null;
      }

      const [a, b, c] = octets;

      if (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        a >= 224 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 192 && b === 0 && c === 0) ||
        (a === 192 && b === 0 && c === 2) ||
        (a === 198 && b === 51 && c === 100) ||
        (a === 203 && b === 0 && c === 113)
      ) {
        return null;
      }
    }

    if (
      hostname === "::" ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      hostname.startsWith("fe8") ||
      hostname.startsWith("fe9") ||
      hostname.startsWith("fea") ||
      hostname.startsWith("feb")
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}

function buildArchiveUrl(timestamp: string, original: string): string | null {
  const archivedUrl = validatePublicUrl(original);

  if (!archivedUrl) {
    return null;
  }

  return `https://web.archive.org/web/${timestamp}/${archivedUrl.toString()}`;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Request body must contain valid JSON." },
        { status: 400 },
      );
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { error: "Request body must be a JSON object." },
        { status: 400 },
      );
    }

    const requestBody = body as Record<string, unknown>;

    if (
      typeof requestBody.url !== "string" ||
      requestBody.url.length === 0 ||
      requestBody.url.length > MAX_URL_LENGTH
    ) {
      return NextResponse.json(
        { error: "Provide a valid URL to investigate." },
        { status: 400 },
      );
    }

    const target = validatePublicUrl(requestBody.url as string);

    if (!target) {
      return NextResponse.json(
        { error: "Only valid public HTTP and HTTPS URLs are accepted." },
        { status: 400 },
      );
    }

    const params = new URLSearchParams({
      url: target.toString(),
      output: "json",
      fl: "timestamp,original,statuscode,mimetype",
      filter: "statuscode:200",
      collapse: "digest",
      from: "1996",
      to: "2030",
      limit: "20",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(
        `https://web.archive.org/cdx/search/cdx?${params.toString()}`,
        {
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "User-Agent": "Afterlink/0.1 documentation-recovery-tool",
          },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        return NextResponse.json(
          {
            error: `The Internet Archive returned HTTP ${response.status}. Try again later.`,
          },
          { status: 502 },
        );
      }

      const data: unknown = await response.json();

      if (!Array.isArray(data)) {
        return NextResponse.json(
          { error: "The archive returned an unexpected response." },
          { status: 502 },
        );
      }

      if (data.length === 0) {
        return NextResponse.json({
          queriedUrl: target.toString(),
          captureCount: 0,
          captures: [],
          message:
            "No matching successful captures were returned. This does not prove that the page never existed.",
        });
      }

      const header = data[0];

      if (!Array.isArray(header)) {
        return NextResponse.json(
          { error: "The archive returned an unexpected response format." },
          { status: 502 },
        );
      }

      const timestampIndex = header.indexOf("timestamp");
      const originalIndex = header.indexOf("original");
      const statusIndex = header.indexOf("statuscode");
      const mimeTypeIndex = header.indexOf("mimetype");

      if (
        timestampIndex === -1 ||
        originalIndex === -1 ||
        statusIndex === -1 ||
        mimeTypeIndex === -1
      ) {
        console.error("[Afterlink] Unexpected CDX response header:", header);

        return NextResponse.json(
          { error: "The archive returned an unexpected response format." },
          { status: 502 },
        );
      }

      if (
        !Array.isArray(header) ||
        header.length < 4 ||
        header[0] !== "timestamp" ||
        header[1] !== "original" ||
        header[2] !== "statuscode" ||
        header[3] !== "mimetype"
      ) {
        return NextResponse.json(
          { error: "The archive returned an unexpected response format." },
          { status: 502 },
        );
      }

      const rows: unknown[][] = data.slice(1).filter(Array.isArray);
      const captures: ArchiveCapture[] = [];
      const seen = new Set<string>();

      for (const row of rows) {
        const timestamp = row[timestampIndex];
        const original = row[originalIndex];
        const status = row[statusIndex];
        const mimeType = row[mimeTypeIndex];

        if (
          typeof timestamp !== "string" ||
          typeof original !== "string" ||
          typeof status !== "string" ||
          typeof mimeType !== "string"
        ) {
          continue;
        }

        if (
          typeof timestamp !== "string" ||
          !/^\d{14}$/.test(timestamp) ||
          typeof original !== "string" ||
          status !== "200"
        ) {
          continue;
        }

        const archivedUrl = validatePublicUrl(original);

        if (
          !archivedUrl ||
          archivedUrl.hostname.toLowerCase() !== target.hostname.toLowerCase()
        ) {
          continue;
        }

        const archiveUrl = buildArchiveUrl(timestamp, original);

        if (!archiveUrl) {
          continue;
        }

        const key = `${timestamp}:${archivedUrl.toString()}`;

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);

        captures.push({
          timestamp,
          original: archivedUrl.toString(),
          status,
          mimeType: mimeType ?? "unknown",
          archiveUrl,
        });
      }

      captures.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

      return NextResponse.json({
        queriedUrl: target.toString(),
        captureCount: captures.length,
        captures,
        message:
          captures.length > 0
            ? "Historical captures found. Verify the archived page's content and relevance before using it as recovery evidence."
            : "No matching successful captures were returned for this hostname. This does not prove that the page never existed.",
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.name === "AbortError"
            ? "The archive request timed out. Please try again."
            : "Could not complete the archive lookup.",
      },
      { status: 502 },
    );
  }
}
