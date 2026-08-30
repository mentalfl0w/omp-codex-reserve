# omp-codex-reserve

A Pi/OMP extension that re-exposes the exact hidden `gpt-reserve` row from the authenticated ChatGPT Codex catalog.

The plugin only augments model discovery. It does not modify OMP or Pi, write `models.yml`/`models.json`, implement OAuth, replace request transport, or register commands.

## Design

| Host | Registration path | Native behavior |
|---|---|---|
| OMP | Load-time `fetchDynamicModels` source; session-time native snapshot refresh | The callback always returns a complete Codex catalog plus reserve. It never returns reserve-only data. |
| Pi | `session_start` native provider wrapper | The wrapper delegates every original provider operation and changes only `getModels()`. |

The implementation follows the useful parts of `copilot-auto`: registration happens during extension load, OMP runtime discovery is used instead of a static model file, the host catalog is refreshed before it is read, and asynchronous refreshes are single-flighted.

OMP's current `registerProvider` API has replacement/authoritative discovery semantics. The OMP adapter therefore registers a dynamic source without a static model overlay. Before a native snapshot is available, a successful remote response must contain valid visible rows and `gpt-reserve`; otherwise the callback fails and the host's native catalog remains in control. After `session_start`, the callback returns the host's complete native Codex snapshot plus the last valid reserve contribution.

## Model rules

- Only the exact, case-sensitive id `gpt-reserve` is allowed through hidden-model filtering.
- Other hidden rows are discarded.
- The complete-catalog path fails closed when an identified visible or reserve row has invalid required metadata.
- `context_window`, `input_modalities`, and reasoning metadata are never invented.
- `max_output_tokens`/`max_tokens` remains absent when the service omits it. OMP/Pi registration receives `128000` only for the new reserve row because those registration surfaces require a concrete limit.
- On OMP, `api.pi.settings.get("extendedContext") === true` expands only
  `gpt-reserve` to a `1_000_000` context window, matching OMP's premium
  long-context policy. If the setting is false or unavailable, the remote
  catalog context window is retained.
- Native model metadata is copied from the host snapshot whenever one is available. The plugin does not derive native context windows, costs, reasoning settings, transport flags, or request ids from the reserve response.
- Native rows and reserve rows are deduplicated by model id; reserve is appended once.

## Authentication and transport

The host remains the authority for the `openai-codex` credential and request execution.

- OMP's dynamic callback receives the host-resolved API key from the model registry; the plugin does not store or register an API key.
- Pi reads the already-resolved provider key at `session_start` and wraps the native provider without replacing its auth object.
- No OAuth login, refresh, or custom transport is registered.
- No access token, authorization header, cookie, account id, or refresh token is written to logs or persisted state.
- The catalog request uses the current Codex discovery routes and protocol headers; tests can inject a fetch function.

The remote catalog endpoint is:

```text
https://chatgpt.com/backend-api/codex/models?client_version=0.144.1
https://chatgpt.com/backend-api/models?client_version=0.144.1
```

The request includes `OpenAI-Beta: responses=experimental`, `originator: pi`, `version: 0.144.1`, and the host-resolved bearer. A documented ChatGPT account claim is used only to supply `chatgpt-account-id` when present.

## Failure behavior

- Missing credentials, network errors, HTTP errors, invalid JSON, empty catalogs, malformed required metadata, and missing reserve rows never replace an unavailable native catalog with reserve-only data.
- OMP retains the last complete successful contribution when a later refresh fails.
- Once a native snapshot exists, an unavailable reserve refresh falls back to that native snapshot; a previous valid reserve contribution is retained when available.
- Pi leaves the previously registered native wrapper unchanged when a refresh fails or reserve is absent.
- Host logger failures cannot affect model discovery.

## Logging

Diagnostics are sent to the host logger and to the plugin-owned rotating log:

- `refresh.started`
- `refresh.succeeded`
- `refresh.failed`
- `refresh.skipped`
- `refresh.fallback`
- `provider.registered`
- `provider.registration-failed`
- `refresh.context-policy`

The plugin log is `omp-codex-reserve.log` in the same default log directory
selection used by `smart-approve` (`~/.omp/logs`, then `~/.pi/logs`, then
`~/.omp/agent`). It rotates synchronously at 5 MB, keeps three rotated files,
and removes rotated files older than 30 days at startup. All file operations
are best effort and never affect discovery. Details are sanitized before either
sink receives them.

## Architecture

```text
src/index.ts / src/omp.ts / src/pi.ts
└── extension.ts
    ├── adapters/omp.ts
    │   ├── load-time dynamic provider registration
    │   ├── host refresh wait
    │   └── complete native snapshot + reserve overlay
    ├── adapters/pi.ts
    │   └── native provider wrapper at session_start
    ├── adapters/reserve-only.ts
    │   └── cloning, native filtering, and one-row merge invariant
    └── core/
        ├── catalog-client.ts
        ├── catalog-parser.ts
        ├── logger.ts
        ├── reserve-refresh.ts
        ├── runtime-log.ts
        └── utils/rotating-log.ts
```

No command or host-source adapter exists outside the model-discovery path.

## Install and use

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

For a package installation, add `omp-codex-reserve` to the host extension list. No model configuration file entry is required.

## Extension surface

The plugin uses only these host-facing operations:

- `registerProvider("openai-codex", { fetchDynamicModels })` on OMP;
- `session_start` on both hosts;
- `ctx.modelRegistry.getAll()` / `ctx.models.list()` for the OMP native snapshot;
- `ctx.modelRegistry.getProvider("openai-codex")` for the Pi native wrapper;
- `ctx.modelRegistry.getApiKeyForProvider("openai-codex")` for the resolved credential;
- the host logger and plugin-owned rotating logger for best-effort diagnostics.

The plugin has no command, custom OAuth provider, model file, process-global
fetch patch, or host-source modification.

## Development and verification

```sh
bun run typecheck
bun test
bun run build
```

The test suite covers exact hidden-row filtering, strict complete-catalog parsing,
OMP load-time dynamic registration, native snapshot preservation, stale-catalog
fallback, OMP `extendedContext` context-window policy, Pi native operation
delegation, credential redaction, rotating-log retention, and catalog request
construction.

## Known boundaries

- On OMP, the reserve context window follows the host `extendedContext` setting
  at each dynamic refresh; the setting defaults to the standard reserve window
  when the host settings surface is unavailable.
- The plugin does not verify JWT signatures; credential validation remains with the host and Codex service.
- A live Pi installation and Pi credential are required for a real Pi smoke test.

## License

MIT
