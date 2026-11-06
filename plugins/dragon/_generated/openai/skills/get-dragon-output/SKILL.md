---
name: get-dragon-output
description: Download a completed Helio Dragon artifact safely without opening or overwriting G-code files.
---

Use this skill when the user explicitly asks to download an artifact from a completed Dragon run.

1. Call `get_dragon_run` first unless a fresh completed result is already in the conversation. Select only a ready service-provided artifact URL: thermal-index G-code for Assess or optimized G-code with thermal indexes for Enhance.
2. If no ready URL exists, report that the artifact is unavailable. Do not construct a URL or expose privileged artifacts.
3. Stream the URL directly to a new local file. Never open, preview, or fetch G-code through a browser or load its contents into memory or chat.
4. Pass the complete HTTPS time-limited URL over standard input, never as a process argument. Do not add credentials, expose it, or persist it. Never overwrite an existing file: reserve a collision-free name with exclusive creation, then write through that same open file descriptor for the entire transfer. Do not reserve a path, close it, and then use `curl --output` (or another downloader) to reopen that path.

Use this reusable helper after setting `download_url`, `destination`, and a safe metadata-derived `filename`. It preserves the extension and uses macOS-style duplicate names (`output.gcode`, `output 1.gcode`, and so on); substitute the destination OS convention where it is known. It reports HTTP failures, streams rather than buffering the artifact, and removes only its own partial file on failure.

```sh
printf '%s' "$download_url" | python3 -c '
import shutil
import sys
import urllib.request
import urllib.parse
from pathlib import Path

destination, filename = sys.argv[1:]
download_url = sys.stdin.read().strip()
if urllib.parse.urlsplit(download_url).scheme != "https":
    raise RuntimeError("artifact URL must use HTTPS")
directory = Path(destination)
source_name = Path(filename)
suffix = source_name.suffix
stem = source_name.name[:-len(suffix)] if suffix else source_name.name

for number in range(0, 1_000_000):
    name = source_name.name if number == 0 else f"{stem} {number}{suffix}"
    output_path = directory / name
    try:
        output = output_path.open("xb")
        break
    except FileExistsError:
        continue
else:
    raise RuntimeError("could not reserve an output filename")

try:
    with output, urllib.request.urlopen(download_url) as response:
        shutil.copyfileobj(response, output, length=1024 * 1024)
    if output_path.stat().st_size == 0:
        raise RuntimeError("downloaded artifact was empty")
except Exception:
    output_path.unlink(missing_ok=True)
    raise RuntimeError("artifact download failed") from None

print(output_path)
' "$destination" "$filename"

```

1. Confirm successful helper exit and a nonempty output file. On failure, remove only the partial file created by this attempt. If the URL expired, refresh run metadata and retry once only with a newly supplied URL.

Return the local path and file size. Keep the original source G-code separate, and recommend reviewing optimized speeds before printing; do not automatically print or replace source files.
