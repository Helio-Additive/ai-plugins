---
name: helio-slicing-tools
description: Explain Helio Slicing MCP capabilities, find compatible printer and material profiles, or inspect and validate BambuStudio, OrcaSlicer, or Snapmaker Orca settings.
---

Use the `helioadditive-slicing` MCP server. Check the connected tool schemas for current fields and constraints.

Authentication is handled by the host when the plugin is installed; there is no separate setup step. Never request or store passwords, access tokens, or client secrets. If a tool reports an authorization failure, report the error and ask the user to reconnect the plugin; do not retry or substitute credentials.

## Tools

* `list_uploaded_files`: Browse the user's retained uploads with names, file IDs and input types; filter by name or input type instead of asking for another upload.
* `get_uploaded_file`: Retrieve an uploaded file and its probe details by exact file ID.
* `list_slices`: Browse the user's slices; filter by name, `fileId`, or status (`IN_PROGRESS`, `SUCCEEDED`, `FAILED`). Use `get_slice` for detailed outcomes.
* `rename_uploaded_file` and `rename_slice`: Change a display name only when requested. Supply the exact ID and a name of 1..255 characters. These operations do not move stored files or create slicing work; renaming a file does not rename existing slices.
* `slicer_version`: Get the supported slicer runner version; accepts an empty object.
* `slicer_machines`: Find printer presets, nozzle sizes, and default process/filament IDs. Accepts an optional `filter`.
* `slicer_filaments`: Find material presets compatible with a selected machine. Accepts an optional `filter`.
* `slicer_processes`: Find print process presets, such as layer-height profiles. Accepts an optional `filter`.
* `get_slicer_settings`: Get the decoded settings JSON Schema, using `type: "BAMBU"`, `"ORCA"`, or `"SNAPMAKER"`. Describes supported settings, not a job's current values. Snapmaker has its own schema.
* `validate_slicer_settings`: Check settings against that schema. Takes `engine: "BAMBU"`, `"ORCA"`, or `"SNAPMAKER"` and `settings` as a JSON-encoded string; returns `{valid, issues:[{code, field, message, action}]}`. Use structured diagnostics to explain what failed and how to correct it in the user's language. Schema validation does not guarantee printer-dependent feasibility.
* `create_input_probe`: Optionally inspect a file before slicing. Supply `fileId`, or `inputType` and `inputKey` with an optional upload version. No engine or machine preset is needed. Repeated requests reuse the same probe.
* `get_input_probe`: Poll by probe `id`; successful results contain typed integer `plates`, reusable `fileId`, `infoKey`, and a short-lived `infoDownloadUrl`. Fetch that URL for native metadata JSON; it is not embedded in the response. Poll again for a fresh URL if it expires. A failed probe may also provide a native error document.
* `create_slice`: Requires `fileId` OR `inputType`/`inputKey` and optional version. `input.slicingEngine` is optional: embedded 3MF inputs use the probe recommendation and fitting engines; model files use the selected printer's release catalog. Snapmaker's own printers use `SNAPMAKER`; other shared printers prefer Bambu. A 3MF without a recommendation can use explicit compatible presets for catalog selection. Explicit printer overrides replace the file's original printer and must use a compatible catalog. Preserve an explicit user engine override, but resolve a returned compatibility issue rather than forcing a non-fitting engine. Automatically probes first if needed. Plate `0` or omission selects all plates; a positive value selects one one-based plate. Shape-only files need printer and filament presets before plate jobs can be created.
* `get_slice`: Retrieve a slice by `id`, including `fileId`, selected `slicingEngine`, structured configuration `issues`, every plate's `status`, native `returnCode` and `errorString`, and artifacts with download URLs. A FAILED slice is terminal; ask for missing configuration or explain the engine refusal rather than polling forever.

## Choose profiles and settings

For detailed print configuration, use `configure-helio-slice-settings`.

* All profile filters support `engine` (`BAMBU`, `ORCA`, or `SNAPMAKER`), `search`, `vendor`, and `forSlicerVersion`. Omitting `engine` searches all three catalogs. Every result includes its engine and an engine-qualified ID; preserve that ID unchanged.
* Machine filters also support `nozzleDiameterMm`. Filament and process filters support `compatibleMachine`; pass the selected machine's returned ID and engine to avoid mixing catalogs.
* Populate `create_slice.input.presetOverrides` with returned IDs: machine `id` → `machineId`, process `id` → `processId`, filament IDs → `filamentIds`.
* The slice engine and every selected profile must agree. Snapmaker U1 uses the `SNAPMAKER` catalog and `slicer_cli-snapmaker`, not ordinary Orca profiles. Never substitute a Bambu or ordinary Orca profile just because a path or name resembles a Snapmaker profile.
* Probe metadata names native binaries: `slicer_cli` maps to `BAMBU`, `slicer_cli-orcaslicer` to `ORCA`, and `slicer_cli-snapmaker` to `SNAPMAKER`. `recommended` is the preferred binary and `fits` lists fitting binaries for the file's original printer. A plain STL without printer information can have no recommendation; use the actual selected printer catalog rather than inventing hardware.
* To use machine defaults, take `defaultProcessId` and `defaultFilamentIds` from the machine result, preserving filament order. Defaults may be null or empty; look up missing profiles rather than inventing IDs.
* For custom settings, inspect `get_slicer_settings`, then call `validate_slicer_settings` with the same engine before submission. Pass `settings` as a JSON string, for example `"{\"layer_height\":0.2}"`.
* Generic settings cannot change printer hardware, nozzle diameter, bed geometry, machine G-code, paths, or host access. Use only advertised process/filament settings; do not offer a software nozzle-diameter change.

## Create and retrieve

List tools use one-based `page` and `pageSize` (defaults 1 and 20; bounded to 50 pages and 100 rows per page). Follow `pageInfo.hasNextPage`, and use filters to narrow large histories rather than requesting pages beyond the cap. Both support `filter.name` with `equalTo`, `notEqualTo`, `contains`, `startsWith` or `endsWith`, plus `sortBy` (`NAME` or `INSERTED_AT`) and `sortDirection` (`ASCENDING` or `DESCENDING`). Default order is newest first. Names are not unique: show matching IDs and ask the user to disambiguate instead of guessing.

Use `create-helio-slice` for explicitly requested job creation and `check-helio-slice` for status. Geometry-only `THREE_MF` inputs require explicit profiles. The slicing toolset has no file-upload tool; use an existing file ID or obtain an upload key when needed. Reuse the same file ID across plates, engines, presets, and settings; never request another upload just to slice another plate. Optional `input.name` labels a new slice or a newly registered file without changing its stored key.

For requested downloads, use `get-helio-slice-output` with a ready artifact's service-provided `downloadUrl`. Stream output to a local file; never open G-Code download URLs in a browser.
