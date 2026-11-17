---
name: check-helio-slice
description: Check the status or result of an existing Helio Additive slicing job.
---

Use this skill when the user asks whether a slicing job has finished, wants its status, or wants details about an existing slice.

1. Use `get_slice` with the slice identifier provided by the user. Inspect the tool schema first if the identifier field is unclear.
2. If no slice identifier is available, use `list_slices` to find the requested slice, filtering by its name or file ID when known. Follow pagination as needed. Show matching names/IDs and ask the user to disambiguate if several match; do not silently select the most recent job.
3. Report aggregate progress and the `plates` list, identifying each plate's `status`, native `returnCode`, and exact `errorString` (for example, a layer height exceeding the fitted nozzle). Also inspect parent `issues` for missing configuration before dispatch. Use structured codes, fields, and actions to explain the problem in the user's language, rather than parsing or requiring an English sentence. A slice is successful only when every requested plate succeeds; a null terminal status may mean probing or unfinished plates. Do not estimate completion time unless the service supplies one, and do not keep polling a FAILED slice.
4. For a completed plate of a project file (a 3MF with settings), read what the project load replaced. The plate's `RESULT_JSON` artifact is a small JSON document: download it to a local file with the `get-helio-slice-output` download rules and read `settings_replaced_by_presets`. Each key named there is a setting the file states that printed with the current preset's value instead, because the file does not list that setting as changed by its maker. If the list is not empty, tell the user in plain language which settings were not kept, and offer to slice again with those values passed in `settings`, or with `projectSettingsAsSaved`. An empty list means nothing was replaced. If the document has no such field, the service does not report it yet: say nothing about replaced settings and do not guess.
5. If the job is complete, offer to download its output files. When the user asks for the files, follow the `get-helio-slice-output` skill using the download URLs in the completed slice's artifact metadata.
6. If the job failed, report the server-provided failure details and offer to help the user correct a stated input problem; do not create a replacement job without an explicit request.
