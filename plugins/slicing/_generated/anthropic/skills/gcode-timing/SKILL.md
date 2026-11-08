---
name: gcode-timing
description: Compare native print-time estimates for two existing G-code files without re-slicing them.
---

Use this skill when the user asks to compare the print time of an original G-code file with an optimized or changed G-code file. Use the `helioadditive-slicing` MCP server and inspect its tool schemas before calling it.

1. Compare the two existing, native G-code files. Do not re-slice either file and do not infer time from headers, speed factors, quality claims, or another engine.
2. Select the exact known producer engine: `BAMBU`, `ORCA`, or `SNAPMAKER`. Do not use a fuzzy filename/profile parser or guess. For `ORCA` and `SNAPMAKER`, require the original printer's `printerVendorBbl` context; omit that field for `BAMBU`.
3. For a Dragon result, accept an original only when it is the exact local file retained from preparation: stream-hash it first and require the known preparation SHA-256 and source identity to match. If that evidence is absent, ask for the exact original or report comparison unavailable. Never construct a source URL, substitute a same-name file, or use the enhanced file twice. A completed full-result request authorizes a temporary internal download of the ready enhanced artifact without separate download consent; otherwise download only when the user requests it.
4. Use this HTTPS-only streaming helper for an internal enhanced download, a local SHA-256 check, or an upload. Pass a signed URL on standard input only, never as an argument, in history, or in output. It sends no authorization header, disables proxy-derived credentials, rejects any redirect that is not HTTPS, keeps G-code out of chat and memory, creates a private exclusive temporary file for downloads, writes it through the same open descriptor, and removes only its own partial output. `hash` prints only file metadata; compare the original digest before upload. Every `upload` requires `expected_sha256`: use the preparation-recorded original digest for the original and the verified download digest for enhanced G-code. It holds one source descriptor, compares streamed bytes to that expected digest before accepting success, and rejects mutation/replacement. Use the exact `mimeType` returned by `get_presigned_url`; a successful empty `200` or `204` response body is valid, while the source G-code must be nonempty.

```sh
helio_gcode_transfer() {
python3 -c '
import hashlib
import http.client
import os
import signal
import socket
import stat
import sys
import tempfile
import urllib.parse
import urllib.request

CHUNK = 1024 * 1024
SOCKET_TIMEOUT_SECONDS = 15
WALL_TIMEOUT_SECONDS = 60

def digest(path):
    descriptor, before = open_regular_readonly(path)
    total, hasher = 0, hashlib.sha256()
    try:
        with os.fdopen(descriptor, "rb", closefd=False) as source:
            for block in iter(lambda: source.read(CHUNK), b""):
                total += len(block)
                hasher.update(block)
        after = os.fstat(descriptor)
        if (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns):
            raise RuntimeError("G-code changed while hashing")
        if total == 0:
            raise RuntimeError("G-code file is empty")
        return total, hasher.hexdigest()
    finally:
        os.close(descriptor)

def open_regular_readonly(path):
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    try:
        info = os.fstat(descriptor)
        if not stat.S_ISREG(info.st_mode) or info.st_size == 0:
            raise RuntimeError("G-code file is empty or not a regular file")
        os.set_blocking(descriptor, True)
        return descriptor, info
    except Exception:
        os.close(descriptor)
        raise

def is_lowercase_sha256(value):
    return len(value) == 64 and all(character in "0123456789abcdef" for character in value)

def url_from_stdin():
    value = sys.stdin.read().strip()
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname:
        raise RuntimeError("signed URL must use HTTPS")
    return value, parsed

class HTTPSOnlyRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        if parsed.scheme != "https" or not parsed.hostname:
            raise RuntimeError("redirect target must use HTTPS")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def with_deadline(operation):
    """Bound DNS, connect, read, and send on the main thread without buffering."""
    if not hasattr(signal, "setitimer") or not hasattr(signal, "SIGALRM"):
        raise RuntimeError("wall-clock deadline support is unavailable")
    previous_handler = signal.getsignal(signal.SIGALRM)
    previous_socket_timeout = socket.getdefaulttimeout()
    def expired(_signum, _frame):
        raise TimeoutError("network deadline exceeded")
    signal.signal(signal.SIGALRM, expired)
    previous_timer = signal.setitimer(signal.ITIMER_REAL, WALL_TIMEOUT_SECONDS)
    socket.setdefaulttimeout(SOCKET_TIMEOUT_SECONDS)
    try:
        return operation()
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        socket.setdefaulttimeout(previous_socket_timeout)
        signal.signal(signal.SIGALRM, previous_handler)
        if previous_timer[0] > 0:
            signal.setitimer(signal.ITIMER_REAL, *previous_timer)

command = sys.argv[1]
if command == "hash":
    size, sha256 = with_deadline(lambda: digest(sys.argv[2]))
    print(f"sha256={sha256} bytes={size}")
elif command == "download":
    url, _parsed = url_from_stdin()
    directory = tempfile.mkdtemp(prefix="helio-gcode-timing-")
    path = os.path.join(directory, "enhanced.gcode")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        def download():
            total, hasher = 0, hashlib.sha256()
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), HTTPSOnlyRedirect())
            with os.fdopen(descriptor, "wb") as output, opener.open(url, timeout=SOCKET_TIMEOUT_SECONDS) as response:
                if not 200 <= response.status < 300:
                    raise RuntimeError("download returned an unsuccessful HTTP status")
                while block := response.read(CHUNK):
                    total += len(block)
                    hasher.update(block)
                    output.write(block)
            return total, hasher
        total, hasher = with_deadline(download)
        if total == 0:
            raise RuntimeError("downloaded artifact was empty")
    except Exception:
        try: os.close(descriptor)
        except OSError: pass
        try: os.unlink(path)
        except FileNotFoundError: pass
        try: os.rmdir(directory)
        except OSError: pass
        raise RuntimeError("enhanced artifact download failed") from None
    print(f"path={path} sha256={hasher.hexdigest()} bytes={total}")
elif command == "upload":
    source, mime_type, expected_sha256 = sys.argv[2:5]
    if not is_lowercase_sha256(expected_sha256):
        raise RuntimeError("expected SHA-256 must be 64 lowercase hexadecimal characters")
    url, parsed = url_from_stdin()
    try:
        def upload():
            descriptor, before = open_regular_readonly(source)
            size = before.st_size
            try:
                connection = http.client.HTTPSConnection(parsed.hostname, parsed.port or 443, timeout=SOCKET_TIMEOUT_SECONDS)
                target = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
                connection.putrequest("PUT", target)
                connection.putheader("Content-Type", mime_type)
                connection.putheader("Content-Length", str(size))
                connection.endheaders()
                total, hasher = 0, hashlib.sha256()
                with os.fdopen(descriptor, "rb", closefd=False) as input_file:
                    for block in iter(lambda: input_file.read(CHUNK), b""):
                        total += len(block)
                        hasher.update(block)
                        connection.send(block)
                if total != size:
                    raise RuntimeError("G-code changed during upload")
                after = os.fstat(descriptor)
                if (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns) != (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns):
                    raise RuntimeError("G-code changed during upload")
                if hasher.hexdigest() != expected_sha256:
                    raise RuntimeError("G-code SHA-256 did not match the expected source")
                response = connection.getresponse()
                if not 200 <= response.status < 300:
                    raise RuntimeError("upload returned an unsuccessful HTTP status")
                response.close()
                return total, hasher, size
            finally:
                os.close(descriptor)
        total, hasher, size = with_deadline(upload)
    except Exception:
        raise RuntimeError("G-code upload failed") from None
    print(f"sha256={hasher.hexdigest()} bytes={size}")
else:
    raise RuntimeError("expected hash, download, or upload")
' "$@"
}

# Stream-hash a local original before comparing it with preparation evidence.
helio_gcode_transfer hash /path/to/original.gcode
# Download a ready enhanced artifact URL to a private temporary file.
printf '%s' "$download_url" | helio_gcode_transfer download
# Upload the exact bytes whose verified digest is expected_sha256, using exactly
# the MIME type returned by get_presigned_url.
printf '%s' "$upload_url" | helio_gcode_transfer upload /path/to/input.gcode "$mime_type" "$expected_sha256"

```

After an internal comparison, delete only the temporary directory that the download helper created, after its enhanced file is no longer needed. Use each returned normalized `tmp/<opaque-id>.gcode` key, optional version ID, and lowercase SHA-256 with `create_gcode_timing`. 5\. Reuse an already-uploaded original/optimized pair. Generate one canonical UUID `identity` and retain it. If creation is ambiguous, retry only with that same identity and unchanged input keys, versions, checksums, engine, and printer context; never automatically create a replacement comparison. 6\. Poll `get_gcode_timing` only while its status is `PENDING`, with a bounded wait. On `SUCCEEDED`, report `originalSeconds`, `optimizedSeconds`, and `deltaSeconds` where delta is optimized minus original (negative is shorter). On `FAILED`, report available service error details; do not fabricate a saving.

The slicing plugin authenticates separately. If the slicing tools are not connected, explain that the user needs to connect Helio Slicing; do not request, reuse, or fall back to Dragon credentials.
