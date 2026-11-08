import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const skillPath = join(import.meta.dir, "skills/gcode-timing/SKILL.mdx");
const skill = await readFile(skillPath, "utf8");
const extractedHelper = skill.match(/python3 -c '\n([\s\S]*?)\n' "\$@"/)?.[1];
if (!extractedHelper) throw new Error("could not extract gcode timing helper");
const helper: string = extractedHelper;
const dragonSkill = await readFile(join(import.meta.dir, "../dragon/skills/get-dragon-output/SKILL.mdx"), "utf8");
const extractedDragonHelper = dragonSkill.match(/python3 -c '\n([\s\S]*?)\n' "\$destination" "\$filename"/)?.[1];
if (!extractedDragonHelper) throw new Error("could not extract Dragon output helper");
const dragonHelper: string = extractedDragonHelper;

const signedUrl = "https://signed.example.invalid/upload?signature=do-not-leak";

const siteCustomize = String.raw`
import http.client, json, os, signal, socket, tempfile, urllib.request

mode = os.environ["HELPER_TEST_MODE"]
log_path = os.environ["HELPER_TEST_LOG"]
source_path = os.environ.get("HELPER_SOURCE")
def log(**value):
    with open(log_path, "a", encoding="utf8") as handle:
        handle.write(json.dumps(value) + "\n")

class DownloadResponse:
    status = 200
    def __init__(self): self.calls = 0
    def __enter__(self): return self
    def __exit__(self, *_args): return False
    def read(self, _size):
        self.calls += 1
        if mode == "download-timeout-read": expire()
        if mode == "download-empty": return b""
        if mode == "download-midstream" and self.calls == 2:
            raise OSError("https://signed.example.invalid/should-not-escape?token=secret")
        return b"part" if self.calls == 1 else b""

class Opener:
    def open(self, url, timeout=None):
        log(open_url=url)
        log(download_timeout=timeout)
        if mode == "download-timeout-connect": expire()
        return DownloadResponse()

def build_opener(*handlers):
    log(opener_handlers=[type(handler).__name__ for handler in handlers])
    if mode == "download-redirect":
        redirect = next(handler for handler in handlers if hasattr(handler, "redirect_request"))
        return redirect.redirect_request(
            urllib.request.Request("https://origin.example.invalid/a"), None, 302, "redirect", {},
            "http://downgrade.example.invalid/?token=secret",
        )
    return Opener()
urllib.request.build_opener = build_opener
tempfile.mkdtemp = lambda prefix: os.environ["HELPER_TMPDIR"]

real_os_open = os.open
replaced = False
def checked_os_open(path, *args, **kwargs):
    global replaced
    if mode == "upload-replace-before" and path == source_path and not replaced:
        replaced = True
        replacement = path + ".replacement"
        with open(replacement, "wb") as handle:
            handle.write(b"R" * os.path.getsize(path))
        os.replace(replacement, path)
    return real_os_open(path, *args, **kwargs)
os.open = checked_os_open

deadline_handler = None
def fake_signal(_signal, handler):
    global deadline_handler
    previous, deadline_handler = deadline_handler, handler
    return previous
def fake_getsignal(_signal): return deadline_handler
def fake_setitimer(_timer, seconds, interval=0):
    log(wall_timeout=seconds)
    return (0, 0)
def expire():
    if deadline_handler is None: raise AssertionError("deadline was not armed")
    deadline_handler(signal.SIGALRM, None)
signal.signal = fake_signal
signal.getsignal = fake_getsignal
signal.setitimer = fake_setitimer
socket.getdefaulttimeout = lambda: None
socket.setdefaulttimeout = lambda value: log(socket_timeout=value)

class UploadResponse:
    status = int(os.environ.get("HELPER_UPLOAD_STATUS", "200"))
    def close(self): log(response_closed=True)
    def read(self, *_args): raise AssertionError("upload response body must not be buffered")

class Connection:
    def __init__(self, host, port, timeout): log(host=host, port=port, timeout=timeout)
    def putrequest(self, method, target): log(method=method, target=target)
    def putheader(self, name, value): log(header=name, value=value)
    def endheaders(self): log(endheaders=True)
    def send(self, block):
        log(chunk=len(block))
        if mode == "upload-timeout-send": expire()
        if mode == "upload-mutate-chunk" and source_path:
            with open(source_path, "r+b") as handle:
                handle.seek(-1, os.SEEK_END)
                handle.write(b"M")
    def getresponse(self): return UploadResponse()
http.client.HTTPSConnection = Connection
`;

async function runHelper(
  mode: string,
  command: string,
  args: string[] = [],
  stdin = "",
  uploadStatus?: number,
) {
  const root = await mkdtemp(join(tmpdir(), "gcode-timing-helper-"));
  const privateTemp = join(root, "private-temp");
  const log = join(root, "mock.jsonl");
  await writeFile(join(root, "sitecustomize.py"), siteCustomize);
  await mkdir(privateTemp);
  const process = Bun.spawn(["python3", "-c", helper, command, ...args], {
    cwd: root,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...Bun.env,
      PYTHONPATH: root,
      HELPER_TEST_MODE: mode,
      HELPER_TEST_LOG: log,
      HELPER_TMPDIR: privateTemp,
      ...(command === "upload" ? { HELPER_SOURCE: args[0] ?? "" } : {}),
      ...(uploadStatus === undefined ? {} : { HELPER_UPLOAD_STATUS: String(uploadStatus) }),
    },
  });
  process.stdin.write(stdin);
  process.stdin.end();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const exitCode = await Promise.race([
    process.exited,
    new Promise<number>((_resolve, reject) => {
      timeout = setTimeout(() => {
        process.kill();
        reject(new Error("helper exceeded the 1 second subprocess deadline"));
      }, 1000);
    }),
  ]).finally(() => {
    if (timeout !== undefined) clearTimeout(timeout);
  });
  const [stdout, stderr] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  const entries = await readFile(log, "utf8")
    .then(
      value => value.trim() ? value.trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>) : [],
      () => [],
    );
  return { root, privateTemp, log, exitCode, stdout, stderr, entries };
}

async function expectedSha256(path: string) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

async function runDragonHelper(mode: string, stdin = signedUrl) {
  const root = await mkdtemp(join(tmpdir(), "dragon-output-helper-"));
  const privateTemp = join(root, "private-temp");
  const log = join(root, "mock.jsonl");
  const destination = join(root, "destination");
  await mkdir(privateTemp);
  await mkdir(destination);
  await writeFile(join(root, "sitecustomize.py"), siteCustomize);
  const process = Bun.spawn(["python3", "-c", dragonHelper, destination, "enhanced.gcode"], {
    cwd: root, stdin: "pipe", stdout: "pipe", stderr: "pipe",
    env: { ...Bun.env, PYTHONPATH: root, HELPER_TEST_MODE: mode, HELPER_TEST_LOG: log, HELPER_TMPDIR: privateTemp },
  });
  process.stdin.write(stdin);
  process.stdin.end();
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited, new Response(process.stdout).text(), new Response(process.stderr).text(),
  ]);
  const entries = await readFile(log, "utf8").then(
    value => value.trim() ? value.trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>) : [],
    () => [],
  );
  return { root, destination, exitCode, stdout, stderr, entries };
}

test("downloads through an HTTPS-only private streaming path without leaking signed URLs", async () => {
  const result = await runHelper("download-success", "download", [], signedUrl);
  try {
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(signedUrl);
    expect(result.stderr).not.toContain(signedUrl);
    const output = /path=(\S+)/.exec(result.stdout)?.[1];
    expect(output).toBeDefined();
    expect(await stat(output!)).toMatchObject({ mode: expect.any(Number) });
    expect((await stat(output!)).mode & 0o777).toBe(0o600);
    expect(await readFile(output!, "utf8")).toBe("part");
    expect(result.entries).toContainEqual({ open_url: signedUrl });
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test.each(["download-empty", "download-midstream", "download-redirect", "download-timeout-connect", "download-timeout-read"])(
  "sanitizes failed %s downloads and removes its partial private directory",
  async (mode) => {
    const result = await runHelper(mode, "download", [], signedUrl);
    try {
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("enhanced artifact download failed");
      expect(result.stderr).not.toContain(signedUrl);
      expect(await stat(result.privateTemp).then(() => true, () => false)).toBe(false);
    } finally {
      await rm(result.root, { recursive: true, force: true });
    }
  },
);

test("applies an idle socket timeout and a wall deadline to downloads", async () => {
  const result = await runHelper("download-success", "download", [], signedUrl);
  try {
    expect(result.exitCode).toBe(0);
    expect(result.entries).toContainEqual({ download_timeout: 15 });
    expect(result.entries).toContainEqual({ socket_timeout: 15 });
    expect(result.entries).toContainEqual({ wall_timeout: 60 });
  } finally {
    await rm(result.root, { recursive: true, force: true });
  }
});

test.each([200, 204])("streams an upload with the exact MIME type and accepts empty %i responses", async (status) => {
  const root = await mkdtemp(join(tmpdir(), "gcode-timing-upload-"));
  const source = join(root, "source.gcode");
  await writeFile(source, Buffer.concat([Buffer.alloc(1024 * 1024, 1), Buffer.from([2, 3, 4])]));
  const result = await runHelper("upload", "upload", [source, "application/x-gcode", await expectedSha256(source)], signedUrl, status);
  try {
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain(signedUrl);
    expect(result.entries).toContainEqual({ header: "Content-Type", value: "application/x-gcode" });
    expect(result.entries.filter(entry => entry.chunk).map(entry => entry.chunk)).toEqual([1024 * 1024, 3]);
    expect(result.entries.some(entry => String(entry.header ?? "").toLowerCase() === "authorization")).toBe(false);
    expect(result.entries).toContainEqual({ response_closed: true });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(result.root, { recursive: true, force: true });
  }
});

test("sanitizes an unsuccessful upload without leaking its signed URL", async () => {
  const root = await mkdtemp(join(tmpdir(), "gcode-timing-upload-"));
  const source = join(root, "source.gcode");
  await writeFile(source, "G1 X1\n");
  const result = await runHelper("upload", "upload", [source, "application/x-gcode", await expectedSha256(source)], signedUrl, 500);
  try {
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("G-code upload failed");
    expect(result.stderr).not.toContain(signedUrl);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(result.root, { recursive: true, force: true });
  }
});

test("sanitizes a wall-deadline interruption during upload send", async () => {
  const root = await mkdtemp(join(tmpdir(), "gcode-timing-upload-"));
  const source = join(root, "source.gcode");
  await writeFile(source, "G1 X1\n");
  const result = await runHelper("upload-timeout-send", "upload", [source, "application/x-gcode", await expectedSha256(source)], signedUrl);
  try {
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("G-code upload failed");
    expect(result.stderr).not.toContain(signedUrl);
    expect(result.entries).toContainEqual({ wall_timeout: 60 });
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(result.root, { recursive: true, force: true });
  }
});

test.each(["upload-replace-before", "upload-mutate-chunk"])(
  "rejects same-size source replacement or mutation during %s without emitting a success digest",
  async (mode) => {
    const root = await mkdtemp(join(tmpdir(), "gcode-timing-upload-"));
    const source = join(root, "source.gcode");
    await writeFile(source, Buffer.concat([Buffer.alloc(1024 * 1024, 1), Buffer.from([2, 3, 4])]));
    const result = await runHelper(mode, "upload", [source, "application/x-gcode", await expectedSha256(source)], signedUrl);
    try {
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("G-code upload failed");
      expect(result.stderr).not.toContain(signedUrl);
      expect(result.stdout).not.toContain("sha256=");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(result.root, { recursive: true, force: true });
    }
  },
);

test("rejects a no-writer FIFO before it can block upload opening", async () => {
  const root = await mkdtemp(join(tmpdir(), "gcode-timing-fifo-"));
  const fifo = join(root, "source.gcode");
  const created = Bun.spawn(["mkfifo", fifo], { stdout: "pipe", stderr: "pipe" });
  expect(await created.exited).toBe(0);
  const result = await runHelper("upload", "upload", [fifo, "application/x-gcode", "a".repeat(64)], signedUrl);
  try {
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("G-code upload failed");
    expect(result.stderr).not.toContain(signedUrl);
    expect(result.stdout).not.toContain("sha256=");
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(result.root, { recursive: true, force: true });
  }
});

test("Dragon output helper disables proxies and rejects HTTPS-to-HTTP redirects", async () => {
  const success = await runDragonHelper("download-success");
  try {
    expect(success.exitCode).toBe(0);
    expect(success.entries).toContainEqual({ opener_handlers: ["ProxyHandler", "HTTPSOnlyRedirect"] });
    expect(success.stdout).not.toContain(signedUrl);
  } finally {
    await rm(success.root, { recursive: true, force: true });
  }

  const redirect = await runDragonHelper("download-redirect");
  try {
    expect(redirect.exitCode).not.toBe(0);
    expect(redirect.stderr).toContain("artifact download failed");
    expect(redirect.stderr).not.toContain(signedUrl);
    expect(await stat(join(redirect.destination, "enhanced.gcode")).then(() => true, () => false)).toBe(false);
  } finally {
    await rm(redirect.root, { recursive: true, force: true });
  }
});
