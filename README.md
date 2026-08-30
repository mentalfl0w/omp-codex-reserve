# omp-codex-reserve

An extension for **Oh My Pi (OMP)** and upstream **Pi** that re-exposes the exact hidden `gpt-reserve` row from the authenticated ChatGPT Codex catalog. Compatible with both hosts through separate entrypoints.

The extension only adds model discovery. Authentication, OAuth refresh, request transport, native streaming, and model execution remain owned by the host's existing `openai-codex` provider.

Covered surfaces:

| Host/surface | Mechanism | Responsibility |
|---|---|---|
| Pi | Native provider wrapper | Delegate the original provider; its live `getModels()` gains only reserve |
| OMP | Catalog-preserving dynamic overlay | Register the complete preserved catalog plus reserve; every dynamic refresh returns the same complete shape |
| `/reserve-status` | Host command registration | Show detection, source, visibility, refresh time, and sanitized errors |
| `/reserve-info` | Host command registration | Show remote metadata for `gpt-reserve` |

The extension never reads an auth file, writes a token, forks the Codex transport, edits `models.yml`, or opens its own log file.

## How it works

```text
Pi: native openai-codex Provider ──► wrapper.getModels()
                                      │
                                      └── native live models + gpt-reserve

OMP: native catalog snapshot ───────► preserved rows + gpt-reserve
                                      │
                                      └── refresh returns full preserved catalog + reserve
```

Both adapters fetch the authenticated Codex catalog and select only the exact `gpt-reserve` row. Pi delegates every non-model operation to the original provider. OMP follows Copilot Auto's compatibility pattern: its dynamic fetcher always returns the whole preserved catalog plus reserve, never a reserve-only authoritative list.

## Features

### 1. Remote catalog discovery

The parser consumes the current Codex envelope (`models` or `data`) and maps each accepted row directly into the host model shape. It does not look up a bundled model or synthesize reserve metadata.

Dynamic model fields are not hardcoded:

- `context_window` is required for `contextWindow`.
- `max_output_tokens` / `max_tokens` is mapped when the server returns it. The current Codex catalog may omit a separate output limit, so the parser leaves `maxTokens` absent and `/reserve-info` reports `unknown`.
- `input_modalities` is required for `input`.
- `reasoning`, `default_reasoning_level`, or `supported_reasoning_levels` is required for reasoning metadata. Supported effort objects are mapped by their remote `effort` value, including `max`.
- Missing required or malformed values reject the catalog rather than being guessed.

Pi reads native rows live from the wrapped provider. OMP copies the host catalog before registration; neither adapter derives existing-model IDs, context windows, output limits, thinking metadata, inputs, compatibility, costs, transport settings, or priorities from the remote response. In particular, the plugin has no GPT-5.6 context-window rule.

Pi and OMP provider registration requires a concrete output limit for the **new** reserve row. If the remote reserve row omits that field, the registration adapter uses the host-compatible 128000 value only for that row; process-local state and `/reserve-info` retain the remote absence as `unknown`.

The fixed values are protocol/provider identity, not model capabilities:

| Fixed value | Reason |
|---|---|
| `openai-codex` | Existing host provider id |
| `openai-codex-responses` | Existing Codex API identifier |
| `https://chatgpt.com/backend-api` | Current Codex catalog endpoint |
| `0.144.1` | Current Codex client version used on the wire |
| `gpt-reserve` | Exact requested visibility exception |

Codex subscription rows may omit token pricing. The host model type still requires a cost object, so an absent remote cost is represented as zero host accounting; this is not copied from another model and does not affect transport.

### 2. Exact visibility rule

```ts
const hidden = visibility === "hide" || visibility === "hidden";
if (hidden && modelId !== "gpt-reserve") {
  dropRow();
}
```

The id comparison is exact and case-sensitive. All other hidden rows are removed. A hidden reserve row must provide every capability field that the remote row actually supplies; an absent optional output limit remains unknown.

### 3. Existing OAuth and native transport

The adapter reads the host's already-resolved `openai-codex` credential from the public model registry at `session_start`, then registers a merged model list. It supplies no OAuth implementation, request API, base URL, header, compatibility, or streaming override. The host continues to own OAuth refresh, request shaping, attestation, transport, and native streaming.

The request uses the current Codex discovery contract:

| Item | Value |
|---|---|
| Base URL | `https://chatgpt.com/backend-api` |
| Routes | `/codex/models`, then `/models` |
| Query | `client_version=0.144.1` |
| Authorization | `Bearer <host-supplied access token>` |
| Account header | `chatgpt-account-id` when supplied or present in the documented JWT claim |
| Beta header | `OpenAI-Beta: responses=experimental` |
| Originator | `originator: pi` |
| Version | `version: 0.144.1` |
| Accept | `application/json` |

The account id is decoded from the nested JWT claim `["https://api.openai.com/auth"].chatgpt_account_id` only when needed for the request header. The extension does not verify the JWT; credential validation remains with the host/API.

### 4. Graceful degradation

Malformed, empty, required-incomplete, unavailable, or reserve-absent catalog responses fail closed: the adapter does not call `registerProvider`, so the host's original Codex catalog remains active unchanged. A successful fetch records remote reserve metadata only in process memory.

### 5. Runtime commands

```text
/reserve-status    # Detection, source, current model, visibility, refresh time
/reserve-info      # Remote gpt-reserve metadata; absent fields show unknown
```

The plugin has no independent OAuth or transport path. A host model refresh re-runs normal host discovery; reloading the extension begins a fresh reserve augmentation.

### 6. Silent rotating runtime log

Reserve augmentation emits structured debug events to the host logger for start, success, skipped, and failure outcomes. The events carry only host, credential-present status, endpoint path, HTTP status, row counts, reserve detection, changed fields, and skip reason.

There is no `/reserve-log` command and no user-facing notification for normal events. Logging is best effort; a logger failure cannot change model discovery behavior. Credential-bearing keys and `Authorization` values are redacted, account ids are never included, and error messages use the existing sanitizer.

The extension does not create or rotate a second log file. OMP's centralized logger writes files under `~/.omp/logs/` (observed as `omp.YYYY-MM-DD.<pid>.log`) and handles rotation; Pi keeps its own logger sink and rotation policy. Delegating rotation to the host avoids competing files and preserves the host's retention settings.

### 7. Metadata diff

When a reserve row is refreshed, the process-local state compares the remote fields for changes in name, visibility, context window, output limit, reasoning, inputs, tool capabilities, WebSockets/Responses Lite flags, compaction, compatibility, request id, priority, and cost. No token or account value is included in the diff.

## Architecture

```text
extension.ts
 ├─ detect-host.ts        — Pi/OMP runtime selection
 ├─ adapters/pi.ts        — Pi reserve-only augmentation
 ├─ adapters/omp.ts       — OMP reserve-only augmentation
 ├─ adapters/reserve-only.ts — native snapshot and one-row merge invariant
 ├─ commands/             — status and info commands
 └─ core/                 — remote retrieval, parsing, state, and diagnostics
```

The shared core imports no host package. The adapters use narrow structural contracts so unit tests do not need a running host. Neither adapter implements streaming or OAuth.

## Install

Build from this checkout:

```sh
bun install
bun run build
```

Load exactly one host-specific bundle:

```sh
omp models -e ./dist/omp.js --json
pi -e ./dist/pi.js --list-models gpt-reserve --no-session
```

For a package installation:

```sh
npm install omp-codex-reserve
```

Then add the package to the host extension list:

```yaml
# ~/.omp/agent/config.yml
extensions:
  - omp-codex-reserve

# ~/.pi/agent/config.yml uses the same extension entry.
```

The package manifest also exposes separate `omp` and `pi` extension entries. Do not load both bundles in one host process. No `models.yml` entry is required.

## Configuration

There is no plugin configuration file. The host's existing provider configuration and credential store remain authoritative.

| Item | Owner | Plugin behavior |
|---|---|---|
| OAuth login/refresh | Host | Read only the resolved provider credential through the public registry |
| Access-token storage | Host | Never read or write it directly |
| Native Codex catalog | Host | Snapshot and preserve every non-reserve row unchanged |
| Reserve metadata | Codex service | Parse and register only the exact `gpt-reserve` row |

## Extension API surface used

| API | Purpose |
|---|---|
| `pi.on("session_start", ...)` | Run after the native catalog is available |
| `ctx.modelRegistry.getAll()` | Read the native Codex rows before augmentation |
| `ctx.modelRegistry.getApiKeyForProvider("openai-codex")` | Obtain the host-resolved credential without accessing token storage |
| `registerProvider("openai-codex", { models })` | Register the preserved native rows plus the one reserve row |
| Host logger `debug()` | Silent diagnostics; host owns persistence and rotation |

These are public extension/model-registry surfaces present in the current Pi and OMP versions used during implementation. A host API change is a compatibility breakpoint; the extension reports a sanitized warning instead of replacing native auth or transport.

## Known boundaries

- A real Pi OAuth smoke test was not run because Pi is not installed and no Pi credential was configured.
- The current Codex endpoint returns `context_window` but may omit `max_output_tokens`. The parser preserves that absence and `/reserve-info` reports `unknown`; only the new reserve registration row receives the host-required 128000 fallback.
- Required remote metadata is fail-closed. The extension does not invent context, input modalities, or reasoning metadata.
- The plugin does not verify JWT signatures. It only reads the documented account claim for a request header; the host/API authenticates the token.
- The extension augments model selection only; it does not replace the host request, retry, streaming, or credential implementations.

## Development and verification

```sh
bun run typecheck
bun test
bun run build
```

Current local verification:

```text
TypeScript check: passed
Tests: 21 passed, 0 failed, 65 expectations
Bundles: index.js, pi.js, omp.js built successfully
OMP linked-plugin list: omp-codex-reserve enabled
OMP models --json: openai-codex/gpt-reserve present; all six bundled Codex ids preserved
OMP models refresh --json: openai-codex/gpt-reserve present
OMP runtime log: plugin refresh events emitted to the host rotating log; no plugin-owned log file
Pi installation check: command absent, global Pi package absent, temporary test cache absent
```

## Project layout

```text
omp-codex-reserve/
├── README.md
├── LICENSE
├── package.json          ← omp/pi extension manifests and build scripts
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts          ← host-detecting default entrypoint
│   ├── pi.ts             ← Pi entrypoint
│   ├── omp.ts            ← OMP entrypoint
│   ├── extension.ts      ← adapter and command wiring
│   ├── adapters/         ← host-specific provider adapters
│   ├── commands/         ← status/info/refresh commands
│   └── core/             ← host-free fetch, parse, state, and diff logic
└── test/
    ├── catalog-parser.test.ts
    ├── catalog-client.test.ts
    ├── account-id.test.ts
    ├── metadata-diff.test.ts
    ├── pi-adapter.test.ts
    ├── omp-adapter.test.ts
    ├── runtime-log.test.ts
    └── commands.test.ts
```
