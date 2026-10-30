"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  Clock3,
  ExternalLink,
  FileSearch,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  ClipboardCopy,
  Download,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

type ExtractedLink = {
  text: string;
  url: string;
  line: number;
};

type CheckedLink = ExtractedLink & {
  status: number | null;
  result: "working" | "broken" | "redirected" | "unverified" | "invalid";
  detail: string;
};

type ArchiveCapture = {
  timestamp: string;
  original: string;
  status: string;
  mimeType: string;
  archiveUrl: string;
};

type ArchiveResult = {
  queriedUrl: string;
  captureCount: number;
  captures: ArchiveCapture[];
  message: string;
};

type ArchiveCandidateWithContent = ArchiveCapture & {
  archivedTitle: string;
  archivedContent: string;
  contentError: string;
};

type AIRecommendation = {
  candidateUrl: string;
  archiveUrl: string;
  relevance: "high" | "medium" | "low" | "uncertain";
  confidence: number;
  reason: string;
  evidence: string[];
  limitations: string[];
  needsHumanReview: boolean;
};

type AIAnalysis = {
  summary: string;
  recommendations: AIRecommendation[];
  needsHumanReview: boolean;
};

type AIAnalysisResult = {
  originalUrl: string;
  model: string;
  analysis: AIAnalysis;
  disclaimer: string;
};

type ContentComparison = {
  originalUrl: string;
  archiveUrl: string;
  timestamp: string;
  originalTitle: string;
  archivedTitle: string;
  originalCharacterCount: number;
  archivedCharacterCount: number;
  addedLines: string[];
  removedLines: string[];
  addedLineCount: number;
  removedLineCount: number;
  unchangedLineCount: number;
  originalTruncated: boolean;
  archivedTruncated: boolean;
  message: string;
};

type InvestigationHistoryEntry = {
  id: string;
  savedAt: string;
  fileName: string;
  markdown: string;
  links: ExtractedLink[];
  checkedLinks: CheckedLink[];
  archiveResults: Record<string, ArchiveResult>;
  aiResults: Record<string, AIAnalysisResult>;
  comparisonResults: Record<string, ContentComparison>;
};

const exampleMarkdown = `# Project documentation

Welcome to the project.

Read the [API guide](https://example.com/api) before integrating.
See the [migration notes](https://example.com/migration) for upgrade details.
Visit our [contribution guide](https://example.com/contributing) to get started.

You can also review the [React documentation](https://react.dev/learn).
For framework guidance, see the [Next.js documentation](https://nextjs.org/docs).`;

function getLinkContext(markdownLines: string[], lineNumber: number) {
  const start = Math.max(0, lineNumber - 3);
  const end = Math.min(markdownLines.length, lineNumber + 2);

  return markdownLines.slice(start, end).join("\n").slice(0, 5000);
}

function formatCaptureDate(timestamp: string) {
  if (!/^\d{14}$/.test(timestamp)) return timestamp;

  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)} ${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)} UTC`;
}

function removeKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

const HISTORY_STORAGE_KEY = "afterlink-investigation-history";
const MAX_HISTORY_ENTRIES = 5;

function readInvestigationHistory(): InvestigationHistoryEntry[] {
  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed: unknown = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(
        (entry): entry is InvestigationHistoryEntry =>
          typeof entry === "object" &&
          entry !== null &&
          typeof entry.id === "string" &&
          typeof entry.savedAt === "string" &&
          typeof entry.fileName === "string" &&
          typeof entry.markdown === "string" &&
          Array.isArray(entry.links) &&
          Array.isArray(entry.checkedLinks) &&
          typeof entry.archiveResults === "object" &&
          entry.archiveResults !== null &&
          typeof entry.aiResults === "object" &&
          entry.aiResults !== null &&
          typeof entry.comparisonResults === "object" &&
          entry.comparisonResults !== null,
      )
      .slice(0, MAX_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

function writeInvestigationHistory(
  entries: InvestigationHistoryEntry[],
): boolean {
  try {
    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(entries.slice(0, MAX_HISTORY_ENTRIES)),
    );

    return true;
  } catch {
    return false;
  }
}

function buildInvestigationReport(data: {
  fileName: string;
  markdown: string;
  links: ExtractedLink[];
  checkedLinks: CheckedLink[];
  archiveResults: Record<string, ArchiveResult>;
  aiResults: Record<string, AIAnalysisResult>;
  comparisonResults: Record<string, ContentComparison>;
}) {
  const {
    fileName,
    markdown,
    links,
    checkedLinks,
    archiveResults,
    aiResults,
    comparisonResults,
  } = data;

  const checkedByLink = new Map<string, CheckedLink[]>();

  for (const checked of checkedLinks) {
    const existing = checkedByLink.get(checked.url) ?? [];
    existing.push(checked);
    checkedByLink.set(checked.url, existing);
  }

  const investigations = links.map((link) => ({
    ...link,
    linkChecks: checkedByLink.get(link.url) ?? [],
    archiveSearch: archiveResults[link.url] ?? null,
    aiAssessment: aiResults[link.url] ?? null,
    comparisons: Object.entries(comparisonResults)
      .filter(([key]) => key.startsWith(`${link.url}|`))
      .map(([, comparison]) => comparison),
  }));

  return {
    reportVersion: 1,
    application: "Afterlink",
    exportedAt: new Date().toISOString(),
    source: {
      fileName,
      characterCount: markdown.length,
      lineCount: markdown.split("\n").length,
    },
    summary: {
      extractedLinks: links.length,
      checkedLinks: checkedLinks.length,
      archiveSearchesCompleted: Object.keys(archiveResults).length,
      archiveCaptures: Object.values(archiveResults).reduce(
        (total, result) => total + result.captures.length,
        0,
      ),
      aiAssessmentsCompleted: Object.keys(aiResults).length,
      comparisonsCompleted: Object.keys(comparisonResults).length,
    },
    investigations,
    limitations: [
      "Link availability checks may be inconclusive when hosts block automated requests.",
      "Archived snapshots may be incomplete or outdated.",
      "AI recommendations require human verification and are not proof of a correct replacement.",
      "Text comparisons may be incomplete when extraction limits are reached.",
    ],
  };
}

function buildMarkdownReport(
  report: ReturnType<typeof buildInvestigationReport>,
) {
  const sections = [
    "# Afterlink Investigation Report",
    "",
    `- Exported: ${report.exportedAt}`,
    `- Source document: ${report.source.fileName}`,
    `- Extracted links: ${report.summary.extractedLinks}`,
    `- Links checked: ${report.summary.checkedLinks}`,
    `- Archive captures: ${report.summary.archiveCaptures}`,
    `- AI assessments: ${report.summary.aiAssessmentsCompleted}`,
    `- Comparisons: ${report.summary.comparisonsCompleted}`,
    "",
  ];

  for (const investigation of report.investigations) {
    sections.push(
      `## ${investigation.text}`,
      "",
      `- URL: ${investigation.url}`,
      `- Source line: ${investigation.line}`,
      "",
    );

    for (const checked of investigation.linkChecks) {
      sections.push(
        `### Link check`,
        "",
        `- Result: ${checked.result}`,
        `- HTTP status: ${checked.status ?? "Unavailable"}`,
        `- Details: ${checked.detail || "None provided"}`,
        "",
      );
    }

    if (investigation.archiveSearch) {
      sections.push(
        "### Archive search",
        "",
        `- Captures reported: ${investigation.archiveSearch.captureCount}`,
        `- Message: ${investigation.archiveSearch.message}`,
        "",
      );

      for (const capture of investigation.archiveSearch.captures) {
        sections.push(
          `- [${capture.timestamp}](${capture.archiveUrl}) — HTTP ${capture.status}`,
        );
      }

      sections.push("");
    }

    if (investigation.aiAssessment) {
      sections.push(
        "### AI assessment",
        "",
        `- Model: ${investigation.aiAssessment.model}`,
        `- Summary: ${investigation.aiAssessment.analysis.summary}`,
        "",
      );

      for (const recommendation of investigation.aiAssessment.analysis
        .recommendations) {
        sections.push(
          `#### Candidate: ${recommendation.candidateUrl}`,
          "",
          `- Relevance: ${recommendation.relevance}`,
          `- Model confidence: ${recommendation.confidence}%`,
          `- Reason: ${recommendation.reason}`,
          `- Human review required: ${recommendation.needsHumanReview ? "Yes" : "No"}`,
          "",
          "Evidence:",
          ...(recommendation.evidence.length
            ? recommendation.evidence.map((item) => `- ${item}`)
            : ["- No evidence supplied"]),
          "",
          "Limitations:",
          ...(recommendation.limitations.length
            ? recommendation.limitations.map((item) => `- ${item}`)
            : ["- None reported by the model"]),
          "",
        );
      }

      sections.push(investigation.aiAssessment.disclaimer, "");
    }

    for (const comparison of investigation.comparisons) {
      sections.push(
        "### Original versus archive",
        "",
        `- Capture: ${comparison.timestamp}`,
        `- Archived source: ${comparison.archiveUrl}`,
        `- Added in archive: ${comparison.addedLineCount}`,
        `- Removed from archive: ${comparison.removedLineCount}`,
        `- Unchanged lines: ${comparison.unchangedLineCount}`,
        `- Current page characters: ${comparison.originalCharacterCount}`,
        `- Archived page characters: ${comparison.archivedCharacterCount}`,
        `- Current page truncated: ${comparison.originalTruncated ? "Yes" : "No"}`,
        `- Archived page truncated: ${comparison.archivedTruncated ? "Yes" : "No"}`,
        "",
        "Added in archive:",
        ...(comparison.addedLines.length
          ? comparison.addedLines.map((line) => `- ${line}`)
          : ["- None recorded"]),
        "",
        "Removed from archive:",
        ...(comparison.removedLines.length
          ? comparison.removedLines.map((line) => `- ${line}`)
          : ["- None recorded"]),
        "",
        comparison.message,
        "",
      );
    }
  }

  sections.push(
    "## Important limitations",
    "",
    ...report.limitations.map((limitation) => `- ${limitation}`),
    "",
  );

  return sections.join("\n");
}

function StatusBadge({ result }: { result?: CheckedLink["result"] }) {
  const styles: Record<string, string> = {
    working: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
    broken: "border-red-400/20 bg-red-400/[0.07] text-red-300",
    redirected: "border-sky-400/20 bg-sky-400/[0.07] text-sky-300",
    invalid: "border-red-400/20 bg-red-400/[0.07] text-red-300",
    unverified: "border-amber-400/20 bg-amber-400/[0.07] text-amber-300",
  };

  if (!result) {
    return (
      <Badge
        variant="outline"
        className="border-white/10 bg-white/[0.03] text-slate-400"
      >
        Not checked
      </Badge>
    );
  }

  const labels: Record<string, string> = {
    working: "Working",
    broken: "Broken",
    redirected: "Redirected",
    invalid: "Invalid URL",
    unverified: "Unverified",
  };

  return (
    <Badge variant="outline" className={styles[result]}>
      {labels[result]}
    </Badge>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-white/[0.10] bg-white/[0.015] px-4 py-10 text-center">
      <div className="mx-auto mb-3 flex w-fit items-center justify-center text-slate-600">
        {icon}
      </div>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-slate-500">
        {description}
      </p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-red-400/15 bg-red-400/[0.05] p-3.5 text-sm text-red-200"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="break-words leading-5">{message}</p>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <Card className="border-white/[0.08] bg-[#10131b]/85 text-slate-100 shadow-none transition-colors hover:border-white/[0.13]">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-500">{label}</span>
          <span className="text-slate-500">{icon}</span>
        </div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500">{note}</p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [markdown, setMarkdown] = useState("");
  const [fileName, setFileName] = useState("README.md");
  const [links, setLinks] = useState<ExtractedLink[]>([]);
  const [hasScanned, setHasScanned] = useState(false);
  const [checkedLinks, setCheckedLinks] = useState<CheckedLink[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [archiveResults, setArchiveResults] = useState<
    Record<string, ArchiveResult>
  >({});
  const [archiveLoadingUrl, setArchiveLoadingUrl] = useState<string | null>(
    null,
  );
  const [archiveError, setArchiveError] = useState("");
  const [aiResults, setAiResults] = useState<Record<string, AIAnalysisResult>>(
    {},
  );
  const [aiLoadingUrl, setAiLoadingUrl] = useState<string | null>(null);
  const [aiError, setAiError] = useState("");
  const [comparisonResults, setComparisonResults] = useState<
    Record<string, ContentComparison>
  >({});
  const [comparisonLoadingUrl, setComparisonLoadingUrl] = useState<
    string | null
  >(null);
  const [comparisonError, setComparisonError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const lines = useMemo(() => markdown.split("\n"), [markdown]);
  const [exportMessage, setExportMessage] = useState("");
  const [historyEntries, setHistoryEntries] = useState<
    InvestigationHistoryEntry[]
  >([]);
  const [historyMessage, setHistoryMessage] = useState("");
  const [isHistoryReady, setIsHistoryReady] = useState(false);

  const uniqueDomains = useMemo(
    () =>
      new Set(
        links.map((link) => {
          try {
            return new URL(link.url).hostname;
          } catch {
            return link.url;
          }
        }),
      ),
    [links],
  );

  const checkedCount = checkedLinks.length;
  const brokenCount = checkedLinks.filter(
    (link) => link.result === "broken" || link.result === "invalid",
  ).length;
  const archiveCaptureCount = Object.values(archiveResults).reduce(
    (total, result) => total + result.captures.length,
    0,
  );
  const recommendationCount = Object.values(aiResults).reduce(
    (total, result) => total + result.analysis.recommendations.length,
    0,
  );

  function clearInvestigationResults() {
    setLinks([]);
    setHasScanned(false);
    setCheckedLinks([]);
    setCheckError("");
    setArchiveResults({});
    setArchiveError("");
    setAiResults({});
    setAiError("");
    setArchiveLoadingUrl(null);
    setAiLoadingUrl(null);
    setComparisonResults({});
    setComparisonError("");
    setComparisonLoadingUrl(null);
  }

  function handleMarkdownChange(value: string) {
    setMarkdown(value);
    clearInvestigationResults();
  }

  function scanMarkdown() {
    const extracted: ExtractedLink[] = [];
    const pattern = /\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+[^)]*)?\)/g;

    lines.forEach((line, index) => {
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(line)) !== null) {
        extracted.push({
          text: match[1] || "Untitled link",
          url: match[2].replace(/[.,;]+$/, ""),
          line: index + 1,
        });
      }

      pattern.lastIndex = 0;
    });

    setLinks(extracted);
    setCheckedLinks([]);
    setCheckError("");
    setArchiveResults({});
    setArchiveError("");
    setAiResults({});
    setAiError("");
    setHasScanned(true);
  }

  async function checkLinks() {
    if (links.length === 0 || isChecking) return;

    setIsChecking(true);
    setCheckError("");
    setCheckedLinks([]);

    try {
      const response = await fetch("/api/check-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Could not check these links.",
        );
      }

      if (!Array.isArray(data.results)) {
        throw new Error("The link checker returned an unexpected response.");
      }

      setCheckedLinks(data.results as CheckedLink[]);
    } catch (error) {
      setCheckError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while checking links.",
      );
    } finally {
      setIsChecking(false);
    }
  }

  async function findArchivedVersions(url: string) {
    if (archiveLoadingUrl || aiLoadingUrl) return;

    setArchiveLoadingUrl(url);
    setArchiveError("");
    setAiError("");
    setArchiveResults((previous) => removeKey(previous, url));
    setAiResults((previous) => removeKey(previous, url));

    try {
      const response = await fetch("/api/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Could not search the Internet Archive.",
        );
      }

      setArchiveResults((previous) => ({
        ...previous,
        [url]: data as ArchiveResult,
      }));
    } catch (error) {
      setArchiveError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred during archive lookup.",
      );
    } finally {
      setArchiveLoadingUrl(null);
    }
  }

  async function analyzeArchivedVersions(link: ExtractedLink) {
    const archiveResult = archiveResults[link.url];

    if (!archiveResult || archiveResult.captures.length === 0) {
      setAiError(
        "Search for archived versions first. AI analysis requires at least one archive candidate.",
      );
      return;
    }

    if (aiLoadingUrl || archiveLoadingUrl) return;

    setAiLoadingUrl(link.url);
    setAiError("");
    setAiResults((previous) => removeKey(previous, link.url));

    try {
      const candidatesWithContent: ArchiveCandidateWithContent[] =
        await Promise.all(
          archiveResult.captures.slice(0, 5).map(async (candidate) => {
            try {
              const contentResponse = await fetch("/api/archive-content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  archiveUrl: candidate.archiveUrl,
                }),
              });

              const contentData = await contentResponse.json();

              if (!contentResponse.ok) {
                return {
                  ...candidate,
                  archivedTitle: "",
                  archivedContent: "",
                  contentError:
                    typeof contentData.error === "string"
                      ? contentData.error
                      : "Could not retrieve archived content.",
                };
              }

              return {
                ...candidate,
                archivedTitle:
                  typeof contentData.title === "string"
                    ? contentData.title
                    : "",
                archivedContent:
                  typeof contentData.text === "string"
                    ? contentData.text.slice(0, 8000)
                    : "",
                contentError: "",
              };
            } catch {
              return {
                ...candidate,
                archivedTitle: "",
                archivedContent: "",
                contentError: "Could not retrieve archived content.",
              };
            }
          }),
        );

      const usableCandidates = candidatesWithContent.filter(
        (candidate) => candidate.archivedContent.trim().length > 0,
      );

      if (usableCandidates.length === 0) {
        throw new Error(
          "Archive snapshots were found, but none returned readable page content. Try another link or capture.",
        );
      }

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalUrl: link.url,
          linkText: link.text,
          context: getLinkContext(lines, link.line),
          candidates: usableCandidates,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "AI analysis failed.",
        );
      }

      setAiResults((previous) => ({
        ...previous,
        [link.url]: data as AIAnalysisResult,
      }));
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "Could not analyze archive candidates.",
      );
    } finally {
      setAiLoadingUrl(null);
    }
  }

  async function compareOriginalWithArchive(
    link: ExtractedLink,
    candidate: ArchiveCapture,
  ) {
    const comparisonKey = `${link.url}|${candidate.timestamp}`;

    if (
      comparisonLoadingUrl !== null ||
      archiveLoadingUrl !== null ||
      aiLoadingUrl !== null
    ) {
      return;
    }

    setComparisonLoadingUrl(comparisonKey);
    setComparisonError("");
    setComparisonResults((previous) => removeKey(previous, comparisonKey));

    try {
      const response = await fetch("/api/compare-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalUrl: candidate.original,
          archiveUrl: candidate.archiveUrl,
          timestamp: candidate.timestamp,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Could not compare the original page with its archived capture.",
        );
      }

      setComparisonResults((previous) => ({
        ...previous,
        [comparisonKey]: data as ContentComparison,
      }));
    } catch (error) {
      setComparisonError(
        error instanceof Error
          ? error.message
          : "Could not compare the original page with its archived capture.",
      );
    } finally {
      setComparisonLoadingUrl(null);
    }
  }

  async function handleCopyReport() {
    try {
      const report = buildInvestigationReport({
        fileName,
        markdown,
        links,
        checkedLinks,
        archiveResults,
        aiResults,
        comparisonResults,
      });

      await navigator.clipboard.writeText(buildMarkdownReport(report));
      setExportMessage("Investigation report copied to clipboard.");
    } catch {
      setExportMessage(
        "Could not copy the report. Check clipboard permissions and try again.",
      );
    }
  }

  function handleDownloadReport() {
    try {
      const report = buildInvestigationReport({
        fileName,
        markdown,
        links,
        checkedLinks,
        archiveResults,
        aiResults,
        comparisonResults,
      });

      const blob = new Blob([JSON.stringify(report, null, 2)], {
        type: "application/json",
      });

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeFileName = fileName
        .replace(/\.[^/.]+$/, "")
        .replace(/[^\w-]+/g, "-");

      anchor.href = objectUrl;
      anchor.download = `afterlink-${safeFileName || "investigation"}-report.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setExportMessage("JSON investigation report downloaded.");
    } catch {
      setExportMessage("Could not download the report. Please try again.");
    }
  }

  function loadExample() {
    setMarkdown(exampleMarkdown);
    setFileName("README.md");
    clearInvestigationResults();
  }

  function handleFile(file?: File) {
    if (!file) return;

    if (!/\.(md|mdx|markdown|txt)$/i.test(file.name)) {
      window.alert("Please select a Markdown or text file.");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      setMarkdown(String(reader.result ?? ""));
      setFileName(file.name);
      clearInvestigationResults();
    };

    reader.onerror = () => {
      window.alert("Could not read this file. Please try another file.");
    };

    reader.readAsText(file);
  }

  function handleSaveInvestigation() {
    if (!hasScanned || links.length === 0) {
      setHistoryMessage("Scan a document and extract links before saving.");
      return;
    }

    const entry: InvestigationHistoryEntry = {
      id: crypto.randomUUID(),
      savedAt: new Date().toISOString(),
      fileName,
      markdown,
      links,
      checkedLinks,
      archiveResults,
      aiResults,
      comparisonResults,
    };

    const currentEntries = readInvestigationHistory();

    const updatedEntries = [
      entry,
      ...currentEntries.filter(
        (existing) =>
          existing.fileName !== entry.fileName ||
          existing.markdown !== entry.markdown,
      ),
    ].slice(0, MAX_HISTORY_ENTRIES);

    if (!writeInvestigationHistory(updatedEntries)) {
      setHistoryMessage(
        "Could not save history. Browser storage may be full or unavailable.",
      );
      return;
    }

    setHistoryEntries(updatedEntries);
    setHistoryMessage("Investigation saved to history.");
  }

  function handleOpenHistory() {
    const entries = readInvestigationHistory();
    setHistoryEntries(entries);
    setIsHistoryReady(true);
    setHistoryMessage(
      entries.length === 0
        ? "No saved investigations yet."
        : `${entries.length} saved investigation${entries.length === 1 ? "" : "s"}.`,
    );
  }

  function handleRestoreInvestigation(entry: InvestigationHistoryEntry) {
    setFileName(entry.fileName);
    setMarkdown(entry.markdown);
    setLinks(entry.links);
    setCheckedLinks(entry.checkedLinks);
    setArchiveResults(entry.archiveResults);
    setAiResults(entry.aiResults);
    setComparisonResults(entry.comparisonResults);

    setHasScanned(true);
    setCheckError("");
    setArchiveError("");
    setAiError("");
    setComparisonError("");
    setExportMessage("");
    setHistoryMessage(`Restored "${entry.fileName}".`);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleDeleteInvestigation(id: string) {
    const updatedEntries = historyEntries.filter((entry) => entry.id !== id);

    if (!writeInvestigationHistory(updatedEntries)) {
      setHistoryMessage("Could not update history. Please try again.");
      return;
    }

    setHistoryEntries(updatedEntries);
    setHistoryMessage("Investigation removed from history.");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#090a0f] text-slate-100">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(124,58,237,0.12),transparent_35%),radial-gradient(ellipse_at_bottom_right,rgba(14,165,233,0.06),transparent_30%)]"
      />

      <div className="relative mx-auto max-w-[1600px]">
        <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] bg-[#090a0f]/90 px-5 py-4 backdrop-blur-xl sm:px-8">
          <a href="#top" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10">
              <Archive className="h-5 w-5 text-violet-300" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">
                Afterlink
              </h1>
              <p className="text-xs text-slate-500">
                Documentation recovery workbench
              </p>
            </div>
          </a>

          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"
            >
              <span className="mr-2 h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Local workspace
            </Badge>

            <a
              href="https://github.com/shrutikotgire0129/afterlink"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Afterlink on GitHub"
              title="View on GitHub"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.009-.866-.013-1.7-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.089 2.91.833.092-.647.35-1.089.636-1.34-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.203 2.397.1 2.65.64.7 1.027 1.595 1.027 2.688 0 3.847-2.339 4.695-4.566 4.944.359.31.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.523 2 12 2Z"
                />
              </svg>
            </a>
          </div>
        </header>

        <div id="top" className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden border-r border-white/[0.08] px-4 py-7 lg:block">
            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              Workspace
            </p>

            <a
              href="#investigation"
              className="flex items-center gap-3 rounded-lg border border-violet-400/15 bg-violet-500/[0.09] px-3 py-2.5 text-sm text-violet-200"
            >
              <FileSearch className="h-4 w-4" />
              Archive desk
            </a>

            <a
              href="#results"
              className="mt-2 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/[0.04] hover:text-slate-200"
            >
              <Clock3 className="h-4 w-4" />
              Investigation results
            </a>

            <Separator className="my-6 bg-white/[0.08]" />

            <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              Current session
            </p>

            <div className="space-y-3 px-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Link extraction</span>
                <span className="text-emerald-300">Ready</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Archive lookup</span>
                <span className="text-slate-300">Available</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Local AI</span>
                <span className="text-slate-300">Ollama</span>
              </div>
            </div>

            <div className="mt-8 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-300">
                <LockKeyhole className="h-3.5 w-3.5 text-violet-300" />
                Human-controlled recovery
              </div>
              <p className="text-xs leading-5 text-slate-500">
                Suggestions are assessments, not verified replacements. Review
                archived evidence before using a candidate.
              </p>
            </div>
          </aside>

          <section className="min-w-0 px-4 py-7 sm:px-7 sm:py-9 lg:px-10">
            <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
              <div>
                <div className="mb-3 flex items-center gap-2 text-xs font-medium tracking-wide text-violet-300">
                  <Sparkles className="h-3.5 w-3.5" />
                  RECOVER LOST DOCUMENTATION
                </div>

                <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  Your code remembers.
                  <br />
                  <span className="text-slate-500">
                    Let&apos;s find the evidence.
                  </span>
                </h2>

                <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400">
                  Trace Markdown links, search historical snapshots, and use
                  local AI to assess possible documentation matches. Nothing is
                  silently rewritten or committed.
                </p>
              </div>

              <Button
                variant="outline"
                onClick={loadExample}
                className="w-fit shrink-0 border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07] hover:text-white"
              >
                Load sample project
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>

            <div className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={<FileSearch className="h-4 w-4" />}
                label="Links extracted"
                value={hasScanned ? String(links.length) : "—"}
                note={
                  hasScanned ? "From the current document" : "Awaiting scan"
                }
              />
              <MetricCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="Links checked"
                value={hasScanned ? String(checkedCount) : "—"}
                note={
                  checkedCount
                    ? `${brokenCount} confirmed broken or invalid`
                    : "Availability has not been checked"
                }
              />
              <MetricCard
                icon={<Archive className="h-4 w-4" />}
                label="Archive captures"
                value={String(archiveCaptureCount)}
                note="From completed archive searches"
              />
              <MetricCard
                icon={<ShieldCheck className="h-4 w-4" />}
                label="AI recommendations"
                value={String(recommendationCount)}
                note="Require human verification"
              />
            </div>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]">
              <Card
                id="investigation"
                className="min-w-0 border-white/[0.09] bg-[#10131b]/90 text-slate-100 shadow-xl shadow-black/10"
              >
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">
                        Start an investigation
                      </CardTitle>
                      <CardDescription className="mt-2 max-w-md leading-5 text-slate-500">
                        Paste Markdown or upload a README to extract its
                        documentation links.
                      </CardDescription>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-2">
                      <Search className="h-4 w-4 text-violet-300" />
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-xs text-slate-400">
                      <FileSearch className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{fileName}</span>
                    </div>

                    <label
                      className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDragActive(false);
                        handleFile(event.dataTransfer.files?.[0]);
                      }}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      Upload Markdown
                      <input
                        type="file"
                        accept=".md,.mdx,.markdown,.txt,text/plain,text/markdown"
                        className="sr-only"
                        onChange={(event) => {
                          handleFile(event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>

                  <div
                    className={`rounded-xl transition ${
                      dragActive ? "ring-2 ring-violet-400/60" : ""
                    }`}
                  >
                    <Textarea
                      value={markdown}
                      onChange={(event) =>
                        handleMarkdownChange(event.target.value)
                      }
                      placeholder={`Paste your README.md or documentation here...\n\nExample:\n[API reference](https://old-domain.com/api)`}
                      className="min-h-[300px] resize-y rounded-xl border-white/10 bg-[#0b0d12] p-4 font-mono text-xs leading-6 text-slate-300 placeholder:text-slate-700 focus-visible:ring-violet-500/40"
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>{markdown.length.toLocaleString()} characters</span>
                    <span>{lines.length} lines</span>
                  </div>

                  <Button
                    onClick={scanMarkdown}
                    disabled={!markdown.trim()}
                    className="mt-5 w-full bg-violet-600 text-white shadow-lg shadow-violet-950/20 hover:bg-violet-500 disabled:opacity-40"
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Extract documentation links
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </Button>

                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                    <p className="text-xs leading-5 text-slate-500">
                      Extraction only reads the text you provide. Link checks,
                      archive searches, and AI assessments run only when you
                      request them.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card
                id="results"
                className="min-w-0 border-white/[0.09] bg-[#10131b]/90 text-slate-100 shadow-xl shadow-black/10"
              >
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg border border-sky-400/10 bg-sky-400/[0.07] p-2">
                        <Link2 className="h-4 w-4 text-sky-300" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          Extracted links
                        </CardTitle>
                        <CardDescription className="mt-1 text-xs text-slate-500">
                          {hasScanned
                            ? `${links.length} link${links.length === 1 ? "" : "s"} · ${uniqueDomains.size} unique domain${uniqueDomains.size === 1 ? "" : "s"}`
                            : "Waiting for Markdown analysis"}
                        </CardDescription>
                      </div>
                    </div>

                    {hasScanned && links.length > 0 && (
                      <Badge
                        variant="outline"
                        className="border-white/10 bg-white/[0.03] text-slate-400"
                      >
                        {links.length} found
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {!hasScanned ? (
                    <EmptyState
                      icon={<FileSearch className="h-6 w-6" />}
                      title="No investigation yet"
                      description="Paste Markdown and extract its links to start tracing documentation."
                    />
                  ) : links.length === 0 ? (
                    <EmptyState
                      icon={<CircleHelp className="h-6 w-6" />}
                      title="No Markdown links found"
                      description="Try a document containing links such as [API guide](https://example.com/api)."
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs leading-5 text-slate-500">
                          Check availability first, then investigate historical
                          captures for relevant links.
                        </p>
                        <Button
                          size="sm"
                          onClick={checkLinks}
                          disabled={isChecking}
                          className="bg-white/[0.07] text-slate-200 hover:bg-white/[0.12]"
                        >
                          {isChecking ? (
                            <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Search className="mr-2 h-3.5 w-3.5" />
                          )}
                          {isChecking ? "Checking..." : "Check links"}
                        </Button>

                        <button
                          type="button"
                          onClick={handleCopyReport}
                          disabled={!hasScanned || links.length === 0}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ClipboardCopy className="h-4 w-4" />
                          Copy report
                        </button>

                        <button
                          type="button"
                          onClick={handleDownloadReport}
                          disabled={!hasScanned || links.length === 0}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Download className="h-4 w-4" />
                          Download JSON
                        </button>

                        {exportMessage && (
                          <p
                            role="status"
                            className="mt-2 text-sm text-muted-foreground"
                          >
                            {exportMessage}
                          </p>
                        )}
                      </div>

                      <ErrorMessage message={checkError} />

                      {isChecking && (
                        <div
                          role="status"
                          aria-live="polite"
                          className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5"
                        >
                          <LoaderCircle className="h-4 w-4 animate-spin text-violet-300" />
                          <p className="text-xs text-slate-400">
                            Checking link responses. Some sites block automated
                            requests, so certain results may remain unverified.
                          </p>
                        </div>
                      )}

                      {links.map((link, index) => {
                        const checked = checkedLinks[index];
                        const archive = archiveResults[link.url];
                        const ai = aiResults[link.url];
                        const isArchiveLoading = archiveLoadingUrl === link.url;
                        const isAiLoading = aiLoadingUrl === link.url;

                        return (
                          <article
                            key={`${link.url}-${link.line}-${index}`}
                            className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0d12]/70 transition-colors hover:border-white/[0.13]"
                          >
                            <div className="p-4 sm:p-5">
                              <div className="flex items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-400/10 bg-sky-400/[0.06]">
                                  <Link2 className="h-4 w-4 text-sky-300" />
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="break-words text-sm font-semibold text-slate-100">
                                      {link.text}
                                    </h3>
                                    <StatusBadge result={checked?.result} />
                                  </div>

                                  <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 block break-all text-xs leading-5 text-sky-300/80 transition hover:text-sky-200"
                                  >
                                    {link.url}
                                  </a>

                                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                                    <span>Line {link.line}</span>
                                    {checked?.status !== null &&
                                      checked?.status !== undefined && (
                                        <span>HTTP {checked.status}</span>
                                      )}
                                  </div>

                                  {checked?.detail && (
                                    <p className="mt-2 text-xs leading-5 text-slate-400">
                                      {checked.detail}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    archiveLoadingUrl !== null ||
                                    aiLoadingUrl !== null
                                  }
                                  onClick={() => findArchivedVersions(link.url)}
                                  className="border-violet-400/20 bg-violet-500/[0.06] text-violet-200 hover:bg-violet-500/15 hover:text-white"
                                >
                                  {isArchiveLoading
                                    ? "Searching archive..."
                                    : "Find archived versions"}
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    !archive?.captures.length ||
                                    archiveLoadingUrl !== null ||
                                    aiLoadingUrl !== null
                                  }
                                  onClick={() => analyzeArchivedVersions(link)}
                                  className="border-white/10 bg-white/[0.025] text-slate-300 hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
                                >
                                  {isAiLoading
                                    ? "Analyzing..."
                                    : "Analyze with local AI"}
                                </Button>
                              </div>
                            </div>

                            {(isArchiveLoading || isAiLoading) && (
                              <div
                                role="status"
                                aria-live="polite"
                                className="mx-4 mb-4 rounded-xl border border-violet-400/10 bg-violet-500/[0.035] p-3.5 sm:mx-5"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-400/15 bg-violet-500/[0.08]">
                                    <LoaderCircle className="h-4 w-4 animate-spin text-violet-300" />
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold text-slate-200">
                                      {isArchiveLoading
                                        ? "Searching historical records"
                                        : "Analyzing archived documentation"}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-slate-400">
                                      {isArchiveLoading
                                        ? "Searching the Internet Archive for available snapshots."
                                        : "Retrieving archived text and assessing relevance with your local AI model. This may take several seconds."}
                                    </p>
                                    <div
                                      className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.06]"
                                      aria-hidden="true"
                                    >
                                      <div className="h-full w-1/3 animate-pulse rounded-full bg-violet-400/80" />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {archive && (
                              <div className="border-t border-white/[0.07] bg-white/[0.015] p-4 sm:p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <h4 className="text-sm font-semibold text-slate-200">
                                      Historical snapshots
                                    </h4>
                                    <p className="mt-1 text-xs text-slate-500">
                                      {archive.captureCount} capture
                                      {archive.captureCount === 1
                                        ? ""
                                        : "s"}{" "}
                                      reported by the archive search
                                    </p>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="border-white/10 text-slate-400"
                                  >
                                    Internet Archive
                                  </Badge>
                                </div>

                                <p className="mt-3 text-xs leading-5 text-slate-400">
                                  {archive.message}
                                </p>

                                {archive.captures.length === 0 ? (
                                  <div className="mt-3 rounded-lg border border-white/[0.06] p-3 text-xs leading-5 text-slate-500">
                                    No usable captures were returned for this
                                    URL. Try another link or review the original
                                    address.
                                  </div>
                                ) : (
                                  <div className="mt-4 space-y-2">
                                    {archive.captures.map((capture) => (
                                      <div
                                        key={`${capture.timestamp}-${capture.original}`}
                                        className="rounded-lg border border-white/[0.07] bg-black/15 p-3"
                                      >
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                          <p className="text-xs font-medium text-slate-200">
                                            {formatCaptureDate(
                                              capture.timestamp,
                                            )}
                                          </p>
                                          <span className="text-[10px] text-slate-500">
                                            HTTP {capture.status}
                                          </span>
                                        </div>
                                        <p className="mt-1 break-all text-[11px] text-slate-500">
                                          {capture.original}
                                        </p>

                                        <a
                                          href={capture.archiveUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="mt-2 inline-flex items-center text-xs text-sky-300 transition hover:text-sky-200"
                                        >
                                          Review archived page
                                          <ArrowRight className="ml-1 h-3 w-3" />
                                        </a>

                                        <Button
                                          variant="outline"
                                          size="sm"
                                          disabled={
                                            comparisonLoadingUrl !== null ||
                                            archiveLoadingUrl !== null ||
                                            aiLoadingUrl !== null
                                          }
                                          onClick={() =>
                                            compareOriginalWithArchive(
                                              link,
                                              capture,
                                            )
                                          }
                                          className="mt-3 flex w-full border-violet-400/15 bg-violet-500/[0.04] text-xs text-violet-200 hover:bg-violet-500/[0.10] hover:text-white disabled:opacity-40"
                                        >
                                          {comparisonLoadingUrl ===
                                          `${link.url}|${capture.timestamp}`
                                            ? "Comparing pages..."
                                            : "Compare original vs archive"}
                                        </Button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {comparisonError && (
                              <div
                                role="alert"
                                className="border-t border-rose-400/10 bg-rose-500/[0.025] p-4 sm:p-5"
                              >
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                                  <div>
                                    <p className="text-sm font-semibold text-rose-200">
                                      Comparison failed
                                    </p>
                                    <p className="mt-1 break-words text-xs leading-5 text-slate-400">
                                      {comparisonError}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {Object.entries(comparisonResults)
                              .filter(([key]) => key.startsWith(`${link.url}|`))
                              .map(([key, comparison]) => (
                                <div
                                  key={key}
                                  className="border-t border-violet-400/10 bg-violet-500/[0.025] p-4 sm:p-5"
                                >
                                  <div className="flex items-center gap-2">
                                    <FileSearch className="h-4 w-4 text-violet-300" />
                                    <h4 className="text-sm font-semibold text-slate-100">
                                      Original vs archive
                                    </h4>
                                  </div>

                                  <p className="mt-2 break-words text-xs leading-5 text-slate-400">
                                    Capture:{" "}
                                    {formatCaptureDate(comparison.timestamp)}
                                  </p>

                                  <p className="mt-1 text-xs leading-5 text-slate-400">
                                    Current page:{" "}
                                    {comparison.originalCharacterCount.toLocaleString()}{" "}
                                    characters
                                    {" · "}
                                    Archived page:{" "}
                                    {comparison.archivedCharacterCount.toLocaleString()}{" "}
                                    characters
                                  </p>

                                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                    <div className="rounded-lg border border-rose-400/10 bg-rose-400/[0.035] p-3">
                                      <p className="text-xs text-slate-400">
                                        Added in archive
                                      </p>
                                      <p className="mt-1 text-xl font-semibold text-rose-200">
                                        {comparison.addedLineCount}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-emerald-400/10 bg-emerald-400/[0.035] p-3">
                                      <p className="text-xs text-slate-400">
                                        Removed from archive
                                      </p>
                                      <p className="mt-1 text-xl font-semibold text-emerald-200">
                                        {comparison.removedLineCount}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
                                      <p className="text-xs text-slate-400">
                                        Unchanged lines
                                      </p>
                                      <p className="mt-1 text-xl font-semibold text-slate-200">
                                        {comparison.unchangedLineCount}
                                      </p>
                                    </div>
                                  </div>

                                  {comparison.addedLineCount > 0 && (
                                    <div className="mt-4">
                                      <p className="text-xs font-semibold text-rose-200">
                                        Added in archive
                                      </p>
                                      <ul className="mt-2 space-y-2">
                                        {comparison.addedLines.map(
                                          (line, index) => (
                                            <li
                                              key={`${index}-${line}`}
                                              className="break-words rounded-lg border border-rose-400/10 bg-black/15 p-2.5 font-mono text-[11px] leading-5 text-slate-300"
                                            >
                                              {line}
                                            </li>
                                          ),
                                        )}
                                      </ul>
                                      {comparison.addedLineCount >
                                        comparison.addedLines.length && (
                                        <p className="mt-2 text-[11px] text-slate-500">
                                          Showing {comparison.addedLines.length}{" "}
                                          of {comparison.addedLineCount}{" "}
                                          distinct lines.
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {comparison.removedLineCount > 0 && (
                                    <div className="mt-4">
                                      <p className="text-xs font-semibold text-emerald-200">
                                        Removed from archive
                                      </p>
                                      <ul className="mt-2 space-y-2">
                                        {comparison.removedLines.map(
                                          (line, index) => (
                                            <li
                                              key={`${index}-${line}`}
                                              className="break-words rounded-lg border border-emerald-400/10 bg-black/15 p-2.5 font-mono text-[11px] leading-5 text-slate-300"
                                            >
                                              {line}
                                            </li>
                                          ),
                                        )}
                                      </ul>
                                      {comparison.removedLineCount >
                                        comparison.removedLines.length && (
                                        <p className="mt-2 text-[11px] text-slate-500">
                                          Showing{" "}
                                          {comparison.removedLines.length} of{" "}
                                          {comparison.removedLineCount} distinct
                                          lines.
                                        </p>
                                      )}
                                    </div>
                                  )}

                                  {comparison.addedLineCount === 0 &&
                                    comparison.removedLineCount === 0 && (
                                      <p className="mt-4 rounded-lg border border-white/[0.07] p-3 text-xs leading-5 text-slate-400">
                                        No differences were detected among the
                                        distinct, non-empty extracted text
                                        lines.
                                      </p>
                                    )}

                                  {(comparison.originalTruncated ||
                                    comparison.archivedTruncated) && (
                                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3">
                                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                                      <p className="text-xs leading-5 text-amber-200">
                                        One or both pages exceeded the text
                                        extraction limit. The comparison may be
                                        incomplete.
                                      </p>
                                    </div>
                                  )}

                                  <p className="mt-4 text-[11px] leading-5 text-slate-500">
                                    {comparison.message}
                                  </p>

                                  <a
                                    href={comparison.archiveUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-3 inline-flex items-center text-xs text-sky-300 transition hover:text-sky-200"
                                  >
                                    Inspect archived source
                                    <ExternalLink className="ml-1 h-3 w-3" />
                                  </a>
                                </div>
                              ))}

                            {ai && (
                              <div className="border-t border-violet-400/10 bg-violet-500/[0.025] p-4 sm:p-5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-violet-300" />
                                    <h4 className="text-sm font-semibold text-slate-100">
                                      Local AI assessment
                                    </h4>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="max-w-full border-violet-400/15 text-violet-200"
                                  >
                                    {ai.model}
                                  </Badge>
                                </div>

                                <p className="mt-3 text-sm leading-6 text-slate-300">
                                  {ai.analysis.summary}
                                </p>

                                {ai.analysis.recommendations.length === 0 ? (
                                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-3">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                                    <p className="text-xs leading-5 text-amber-200">
                                      No candidate was recommended. Review the
                                      archived snapshots manually; no
                                      replacement has been verified.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="mt-4 space-y-3">
                                    {ai.analysis.recommendations.map(
                                      (recommendation, recommendationIndex) => (
                                        <div
                                          key={`${recommendation.candidateUrl}-${recommendationIndex}`}
                                          className="rounded-xl border border-white/[0.08] bg-black/20 p-3.5"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <Badge
                                              variant="outline"
                                              className={
                                                recommendation.relevance ===
                                                "high"
                                                  ? "border-emerald-400/20 text-emerald-300"
                                                  : recommendation.relevance ===
                                                      "medium"
                                                    ? "border-sky-400/20 text-sky-300"
                                                    : "border-amber-400/20 text-amber-300"
                                              }
                                            >
                                              {recommendation.relevance}{" "}
                                              relevance
                                            </Badge>
                                            <span className="text-xs text-slate-400">
                                              Model confidence:{" "}
                                              {recommendation.confidence}%
                                            </span>
                                          </div>

                                          <p className="mt-3 break-all text-xs leading-5 text-slate-200">
                                            Candidate:{" "}
                                            {recommendation.candidateUrl}
                                          </p>

                                          <p className="mt-2 text-xs leading-5 text-slate-400">
                                            {recommendation.reason}
                                          </p>

                                          {recommendation.evidence.length >
                                            0 && (
                                            <div className="mt-4">
                                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                                Evidence supplied to the model
                                              </p>
                                              <ul className="mt-2 space-y-1.5">
                                                {recommendation.evidence.map(
                                                  (item, evidenceIndex) => (
                                                    <li
                                                      key={evidenceIndex}
                                                      className="flex items-start gap-2 text-xs leading-5 text-slate-300"
                                                    >
                                                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
                                                      <span>{item}</span>
                                                    </li>
                                                  ),
                                                )}
                                              </ul>
                                            </div>
                                          )}

                                          {recommendation.limitations.length >
                                            0 && (
                                            <div className="mt-4">
                                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                                Limitations
                                              </p>
                                              <ul className="mt-2 space-y-1.5">
                                                {recommendation.limitations.map(
                                                  (item, limitationIndex) => (
                                                    <li
                                                      key={limitationIndex}
                                                      className="flex items-start gap-2 text-xs leading-5 text-slate-400"
                                                    >
                                                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                                                      <span>{item}</span>
                                                    </li>
                                                  ),
                                                )}
                                              </ul>
                                            </div>
                                          )}

                                          <a
                                            href={recommendation.archiveUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-4 inline-flex items-center text-xs text-sky-300 transition hover:text-sky-200"
                                          >
                                            Inspect source snapshot
                                            <ExternalLink className="ml-1.5 h-3 w-3" />
                                          </a>

                                          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] p-2.5">
                                            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                                            <p className="text-[11px] leading-5 text-amber-200">
                                              Human review required. AI
                                              confidence is not proof that this
                                              candidate is the correct
                                              replacement.
                                            </p>
                                          </div>
                                        </div>
                                      ),
                                    )}
                                  </div>
                                )}

                                <p className="mt-4 text-[11px] leading-5 text-slate-500">
                                  {ai.disclaimer}
                                </p>
                              </div>
                            )}
                          </article>
                        );
                      })}

                      {(archiveError || aiError) && (
                        <div className="space-y-3" role="status">
                          <ErrorMessage message={archiveError} />
                          <ErrorMessage message={aiError} />
                        </div>
                      )}

                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-xs leading-5 text-slate-500">
                        Link checks can be inconclusive when a host blocks
                        automated requests. Historical snapshots can be
                        incomplete or outdated. Always inspect the source before
                        using a suggested replacement.
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">
                    Investigation history
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Save and revisit your five most recent investigations on
                    this device.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOpenHistory}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5"
                >
                  View history
                </button>
              </div>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleSaveInvestigation}
                  disabled={!hasScanned || links.length === 0}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save current investigation
                </button>
              </div>

              {historyMessage && (
                <p role="status" className="mt-3 text-sm text-muted-foreground">
                  {historyMessage}
                </p>
              )}

              {isHistoryReady && historyEntries.length > 0 && (
                <div className="mt-4 space-y-3">
                  {historyEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{entry.fileName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(entry.savedAt).toLocaleString()} ·{" "}
                          {entry.links.length} links
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestoreInvestigation(entry)}
                          className="rounded-lg border border-white/15 px-3 py-2 text-sm transition hover:bg-white/5"
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteInvestigation(entry.id)}
                          className="rounded-lg border border-red-400/30 px-3 py-2 text-sm text-red-300 transition hover:bg-red-400/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <footer className="mt-10 flex flex-col gap-3 border-t border-white/[0.08] pt-5 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
              <span>Afterlink · Recover the knowledge your codebase lost.</span>
              <span className="flex items-center gap-2">
                <LockKeyhole className="h-3.5 w-3.5" />
                Local AI · Human-reviewed recovery
              </span>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}
