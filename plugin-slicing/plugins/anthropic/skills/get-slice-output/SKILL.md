---
name: get-helio-slice-output
description: Download completed Helio Additive slicing output files locally using curl or an equivalent downloader. Never open G-Code output in a browser.
---

Use this skill when the user explicitly asks to download or obtain output files from a completed slicing job.

1. Use `get_slice` first unless the current conversation already contains a fresh completed result for the requested slice.
2. If the slice is not complete, report its current state and do not attempt a download.
3. Use the download URL supplied in the completed slice's artifact metadata. Inspect the returned fields rather than guessing a field name or constructing a URL. If no download URL is available, report that the output is unavailable. The service handles URL generation internally; do not ask the user to generate a URL or present URL generation as a separate step.
4. Download the requested output files locally using `curl` or an equivalent tool that streams each response directly to disk. Follow the download instructions below.

## Download locally

G-Code output can be very large and can crash the built-in browser. Never open, navigate to, preview, or fetch an output download URL with the built-in browser, browser automation, or a web browsing tool. Do not load the full response into memory, tool output, or the conversation.

For example, after selecting and exclusively reserving a new local file as described below, with `download_url` and `output_path` set to the service-provided URL and the reserved path:

```sh
curl --fail --location --silent --show-error --output "$output_path" -- "$download_url"

```

* Use the user's requested destination, or choose a writable local downloads/output directory. Use a safe filename based on the service's output metadata or slice identifier. Never overwrite an existing file; automatically choose a new filename if the requested name is occupied.
* Follow the destination OS's duplicate-filename convention where known, preserving the file extension. On macOS, insert a space and an incrementing integer before the extension: `output.gcode`, `output 1.gcode`, `output 2.gcode`. Start at 1 and continue until an unused name is found. On other systems, use their native convention when available; otherwise use the same numbered fallback.
* Reserve the chosen filename with exclusive file creation before downloading (for example, Python's `open(path, "xb")` or the OS equivalent). If reservation fails because any file, directory, or symlink already occupies the path, select the next numbered name and retry. Write only to the file successfully created by this attempt, so a collision between checking and creation cannot overwrite existing data.
* Preserve the entire download URL, including its query string. Pass it as a quoted argument, without adding authentication headers or altering its parameters.
* An equivalent downloader must save directly to a file and report HTTP failures. If local download tools are unavailable, give the user a download command and explain that the file has not been downloaded. Do not fall back to opening the URL in a browser.
* Confirm successful exit status and a nonempty local file before reporting success. On failure, remove any partial file created by this attempt. If the service indicates the URL has expired, refresh the slice with `get_slice` and retry once using the updated artifact download URL if one is returned; otherwise report the failure.
* Return the local file path or a supported attachment link and file size. Do not print the G-Code contents or open the file in a browser to verify it.

Treat the URL as time-limited access. Do not expose it to anyone other than the user or persist it in a repository, document, or external service.
