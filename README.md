# Afterlink — Investigate the Ghost in the Machine

**Find what disappeared. Recover what remains. Understand what changed.**

Afterlink is a documentation investigation tool that helps developers investigate broken, missing, or changed documentation links using the Internet Archive and locally running AI.

Instead of simply reporting that a link is broken, Afterlink searches for historical snapshots, extracts archived content, compares original and archived material, and produces evidence-backed investigation recommendations.

## The Problem

Documentation links disappear, pages move, and important technical information gets lost.

A broken link checker can tell you that a page is unavailable today. It cannot necessarily tell you:

- What the page contained before it disappeared.
- Whether an archived version still exists.
- What changed between the original and archived content.
- Which historical snapshot is relevant to the investigation.

Afterlink helps investigate those questions.

## Features

### 1. Markdown Document Analysis
- Upload Markdown or text documentation.
- Extract documentation links for investigation.
- Review discovered links and their status.

### 2. Link Status Checking
- Check whether extracted links are accessible.
- Identify common HTTP failures, redirects, and unavailable pages.
- Distinguish verified results from unverified checks.

### 3. Historical Archive Retrieval
- Search the Internet Archive for historical captures.
- Retrieve available archived versions.
- Display capture information for further investigation.

### 4. Archived Content Extraction
- Extract readable text from archived HTML or plain-text pages.
- Remove common non-content elements and Wayback toolbar content.
- Apply response-size and text-length limits.
- Handle unavailable, oversized, redirected, and unreadable archived pages.

### 5. Local AI Investigation
- Analyze archived evidence using Ollama.
- Use the `gemma3:1b` model locally.
- Generate investigation recommendations grounded in supplied archive evidence.
- Validate recommendation URLs and evidence excerpts before displaying results.

Afterlink does not treat AI-generated conclusions as independently verified facts.

### 6. Original-versus-Archive Comparison
- Compare available original and archived content.
- Highlight similarities and differences.
- Help identify whether historical content is relevant to the original documentation link.

### 7. Investigation History
- Save multiple investigation snapshots.
- Restore previously saved investigations.
- Delete individual history entries.
- Keep up to five saved investigations in browser storage.

### 8. Investigation Report Export
- Copy an investigation report in Markdown format.
- Download investigation data as JSON.
- Preserve useful findings for later review or sharing.

### 9. Failure Handling
- Validate incoming requests and URLs.
- Handle archive retrieval failures and timeouts.
- Handle unavailable local AI services and incomplete model responses.
- Display meaningful error feedback instead of silently accepting invalid results.

## Technology Stack

| Technology | Purpose |
|---|---|
| Next.js 16 | Application framework and API routes |
| React | User interface |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| Ollama | Local AI runtime |
| Gemma 3 1B | Local language model |
| Internet Archive | Historical documentation captures |
| Browser localStorage | Investigation history |

## Architecture

```text
Markdown / Text Document
          |
          v
   Link Extraction
          |
          v
    Link Checking
          |
          v
 Internet Archive Lookup
          |
          v
  Archived Content Retrieval
          |
          v
   Local AI Investigation
          |
          v
 Original vs Archive Comparison
          |
          v
 Recommendations & Evidence
          |
          v
 History / Markdown / JSON
```

The application uses Next.js API routes for link checking, archive retrieval, archived-content extraction, and local AI analysis.

Ollama runs separately on the user's machine. AI analysis is sent to the local Ollama service rather than a hosted AI API.

## Getting Started

### Prerequisites

- Node.js and npm
- Git
- Ollama
- Sufficient system resources to run the Gemma 3 1B model locally
- Internet access for retrieving historical captures from the Internet Archive

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd afterlink
```

Replace `YOUR_GITHUB_REPOSITORY_URL` with your repository's actual GitHub URL.

### 2. Install dependencies

```bash
npm install
```

### 3. Install the local AI model

Install Ollama from:

https://ollama.com/

Pull the model:

```bash
ollama pull gemma3:1b
```

Verify that it works:

```bash
ollama run gemma3:1b "Reply with READY"
```

### 4. Start the application

In the project directory:

```bash
npm run dev
```

The application will be available at:

http://localhost:3000

Ensure Ollama is running locally and accessible at:

```text
http://localhost:11434
```

The current application configuration uses:

```text
Model: gemma3:1b
Ollama API: http://localhost:11434/api/chat
```

### 5. Create a production build

```bash
npm run build
```

Run the production server with:

```bash
npm run start
```

## Important Limitations

Afterlink is an investigation aid, not an authoritative source of historical truth.

- Historical captures are dependent on Internet Archive availability.
- Some pages may have no archived snapshots.
- Archived content may be incomplete, unavailable, or difficult to extract.
- Dynamic websites and JavaScript-rendered content may not yield complete readable text.
- Content extraction is bounded by a 1 MB response limit and a 12,000-character text limit.
- AI recommendations depend on the quality and availability of the supplied evidence.
- Local AI analysis can take longer depending on hardware and the size of the investigation.
- Browser history is limited to five entries and is stored locally.

An unavailable archived page does not prove that the original page never existed.

## Privacy and Data Handling

- AI analysis uses the locally running Ollama service.
- Historical archive lookups and archived-page retrieval require communication with the Internet Archive.
- Investigation history is stored in the browser's localStorage.
- Do not assume that locally stored history is a secure backup; clearing browser data can remove it.

## Project Motivation

Afterlink was built for the DEV challenge **Ghost in the Machine**.

The project explores a practical question: