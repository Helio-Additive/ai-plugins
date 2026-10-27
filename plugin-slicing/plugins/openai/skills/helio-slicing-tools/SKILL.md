---
name: helio-slicing-tools
description: Explain Helio Slicing MCP capabilities, find compatible printer and material profiles, or inspect and validate BambuStudio or OrcaSlicer settings.
---

Use the `helioadditive-slicing` MCP server. Check the connected tool schemas for current fields and constraints.

## Tools

* `slicer_version`: Get the supported slicer runner version; accepts an empty object.
* `slicer_machines`: Find printer presets, nozzle sizes, and default process/filament IDs. Accepts an optional `filter`.
* `slicer_filaments`: Find material presets compatible with a selected machine. Accepts an optional `filter`.
* `slicer_processes`: Find print process presets, such as layer-height profiles. Accepts an optional `filter`.
* `get_slicer_settings`: Get the decoded settings JSON Schema, using `type: "BAMBU"` or `"ORCA"`. Describes supported settings, not a job's current values.
* `validate_slicer_settings`: Check settings against that schema. Takes `engine: "BAMBU"` or `"ORCA"` and `settings` as a JSON-encoded string; returns a boolean.
* `create_slice`: Enqueue a job. Requires `input.slicingEngine` (`"BAMBU"` or `"ORCA"`), `input.inputType`, and an existing `input.inputKey`; supports profile overrides and settings.
* `get_slice`: Retrieve a job by `id`, including overall/per-plate progress, status, and artifacts with available download URLs.

## Choose profiles and settings

For detailed print configuration, use `configure-helio-slice-settings`.

* All profile filters support `search`, `vendor`, and `forSlicerVersion`. Get the version from `slicer_version` when compatibility matters.
* Machine filters also support `nozzleDiameterMm`. Filament and process filters support `compatibleMachine`; use the selected machine's compatibility selector from the returned metadata.
* Populate `create_slice.input.presetOverrides` with returned IDs: machine `id` → `machineId`, process `id` → `processId`, filament IDs → `filamentIds`.
* To use machine defaults, take `defaultProcessId` and `defaultFilamentIds` from the machine result, preserving filament order. Defaults may be null or empty; look up missing profiles rather than inventing IDs.
* For custom settings, inspect `get_slicer_settings`, then call `validate_slicer_settings` with the same engine before submission. Pass `settings` as a JSON string, for example `"{\"layer_height\":0.2}"`.

## Create and retrieve

Use `create-helio-slice` for explicitly requested job creation and `check-helio-slice` for status. Geometry-only `THREE_MF` inputs require explicit profiles. The toolset has no file-upload or slice-listing tool; obtain the existing input key or slice ID when needed.

For requested downloads, use `get-helio-slice-output` with a ready artifact's service-provided `downloadUrl`. Stream output to a local file; never open G-Code download URLs in a browser.
