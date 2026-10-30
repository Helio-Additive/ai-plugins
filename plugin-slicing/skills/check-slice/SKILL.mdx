---
name: check-helio-slice
description: Check the status or result of an existing Helio Additive slicing job.
---

Use this skill when the user asks whether a slicing job has finished, wants its status, or wants details about an existing slice.

1. Use `get_slice` with the slice identifier provided by the user. Inspect the tool schema first if the identifier field is unclear.
2. If no slice identifier is available, use `list_slices` to find the requested slice, filtering by its name or file ID when known. Follow pagination as needed. Show matching names/IDs and ask the user to disambiguate if several match; do not silently select the most recent job.
3. Report aggregate progress and the `plates` list, identifying each plate's status and failure details. A slice is successful only when every requested plate succeeds; a null terminal status may mean probing or unfinished plates. Do not estimate completion time unless the service supplies one.
4. If the job is complete, offer to download its output files. When the user asks for the files, follow the `get-helio-slice-output` skill using the download URLs in the completed slice's artifact metadata.
5. If the job failed, report the server-provided failure details and offer to help the user correct a stated input problem; do not create a replacement job without an explicit request.
