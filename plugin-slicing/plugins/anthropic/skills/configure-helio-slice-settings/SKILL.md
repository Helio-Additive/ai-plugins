---
name: configure-helio-slice-settings
description: Configure slice details such as layer height, walls, infill, supports, speed, or temperature using Helio Slicing presets, settings schemas, and validated overrides.
---

Use this skill to turn print requirements into settings for a BambuStudio (`BAMBU`) or OrcaSlicer (`ORCA`) slice. Use the connected `helioadditive-slicing` tool schemas for current inputs.

## Establish the baseline

* Reuse the user's engine, printer/nozzle, material, profiles, and existing overrides. Ask only for missing details that affect the requested change.
* Clarify the relevant goal: finer detail, strength, shorter print time, support removal, or another specific requirement. Explain meaningful tradeoffs when choosing values.
* When selecting presets, call `slicer_version` and use its result as `filter.forSlicerVersion`. Find the machine with `slicer_machines`, then compatible materials and processes with `slicer_filaments` and `slicer_processes` using `filter.compatibleMachine`.
* Map returned IDs into `input.presetOverrides.machineId`, `processId`, and `filamentIds`. Machine `defaultProcessId` and `defaultFilamentIds` can supply a baseline when present; preserve filament order and look up missing defaults. Geometry-only `THREE_MF` inputs require explicit profiles.

## Inspect supported settings

Call `get_slicer_settings` with `{"type":"BAMBU"}` or `{"type":"ORCA"}` matching the chosen engine. It returns a decoded JSON Schema describing supported options; it does not retrieve a job's settings or the fully resolved preset configuration.

Inspect only the relevant properties and referenced definitions. Use their descriptions, units, types, enums, ranges, and dependencies where supplied. Follow the schema's exact representations, including strings or arrays where required; do not assume a numeric-looking setting takes a number.

Translate the user's goal into a small set of changes:

* Detail and surface finish: layer height and extrusion/line width.
* Strength and weight: wall/perimeter count, top/bottom layers, infill density and pattern.
* Overhangs and cleanup: supports, support interface, placement, and spacing.
* Time and material behavior: speeds, acceleration, temperature, cooling, and retraction.

These are search concepts, not guaranteed field names. Discover the actual keys in the engine's schema. Keep unrelated preset/project values unchanged; do not copy every schema default into the overrides or assume schema defaults are active job values.

## Validate and apply

Build an object containing the requested overrides, then serialize it once as the `settings` string. For example, after confirming the current schema permits this key and value, call `validate_slicer_settings` with:

```json
{
  "engine": "BAMBU",
  "settings": "{\"layer_height\":0.2}"
}

```

Use the same engine throughout discovery, validation, and creation. If validation returns false or an error, correct the settings using the schema and any returned diagnostics; revalidate after edits. Do not submit invalid settings or silently discard a requested change. Passing validation establishes schema compatibility; also consider the selected printer, nozzle, material, and print goal.

For requested job creation, follow `create-helio-slice`: set `input.slicingEngine` to the validated engine, pass the exact validated string as `input.settings`, and include the selected `input.presetOverrides` alongside the required model inputs. Settings advice alone does not request a new job.

Summarize the chosen baseline, changed settings with units, expected tradeoffs, and validation result. If the user only requested configuration, return the proposed overrides for use in a later slice.
