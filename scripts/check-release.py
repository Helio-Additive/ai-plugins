"""Check the actual release ZIPs against the generated production bundles."""

import json
import re
import struct
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
OPENAI_ENDPOINTS = {
    "dragon": "https://dragon.mcp.helioadditive.com/openai",
    "slicing": "https://slicing.mcp.helioadditive.com/openai",
}


def check(plugin, layout, suffix):
    bundle = plugin / "_generated" / layout
    portable = layout == "openai"
    entrypoint = "plugin.json" if portable else ".codex-plugin/plugin.json"
    manifest = json.loads((bundle / entrypoint).read_bytes())
    filename = f"{manifest['name']}-{suffix}-{VERSION}.zip"
    with ZipFile(ROOT / "dist/releases" / filename) as archive:
        assert archive.testzip() is None, filename
        paths = sorted(name for name in archive.namelist() if not name.endswith("/"))
        expected = sorted(p.relative_to(bundle).as_posix() for p in bundle.rglob("*") if p.is_file())
        assert paths == expected, f"unexpected or missing files in {filename}"
        for path in paths:
            assert archive.read(path) == (bundle / path).read_bytes(), path
        assert manifest["version"] == VERSION
        assert any(re.fullmatch(r"skills/[^/]+/SKILL.md", p) for p in paths)
        assert ".app.json" not in paths
        interface = manifest["extensions"]["com.openai"]["interface"] if portable else manifest["interface"]
        for field in ("logo", "logoDark", "composerIcon", "composerIconDark"):
            data = archive.read(interface[field].removeprefix("./"))
            assert data[:8] == b"\x89PNG\r\n\x1a\n"
            width, height = struct.unpack(">II", data[16:24])
            assert 48 <= width == height <= 4096 and len(data) <= 5 * 1024**2
        mcp_path = "mcp.json" if portable else ".mcp.json"
        if portable:
            assert ".codex-plugin/plugin.json" not in paths and ".mcp.json" not in paths
            ext = manifest["extensions"]["com.openai"]
            assert not manifest.get("apps") and not ext.get("apps")
            assert len(interface["shortDescription"]) <= 30
            assert ext["publication"]["release_notes"].strip()
            if plugin.name in OPENAI_ENDPOINTS:
                for field in ("websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"):
                    assert interface[field].startswith("https://")
                cases = ext["review"]["test_cases"]
                assert len(cases["positive"]) == 5 and len(cases["negative"]) == 3
        else:
            assert "plugin.json" not in paths and "mcp.json" not in paths
        if plugin.name in OPENAI_ENDPOINTS:
            config = json.loads(archive.read(mcp_path))
            assert set(config["mcpServers"]) == {manifest["name"]}
            server = config["mcpServers"][manifest["name"]]
            assert server["url"] == OPENAI_ENDPOINTS[plugin.name]
            if portable:
                assert server["type"] == "streamable-http"
                auth = server["extensions"]["com.openai"]["auth"]
                assert auth == {
                    "type": "oauth", "baseScopes": [plugin.name],
                    "client": {"mode": "provided", "clientId": "openai-plugin", "tokenEndpointAuthMethod": "none"},
                }
            else:
                assert server["type"] == "http"
                assert server["oauth"]["clientId"] == "openai-plugin"
                assert server["scopes"] == [plugin.name]
        elif plugin.name == "scripting":
            assert mcp_path not in paths and "mcpServers" not in manifest
        print(f"Verified {filename} ({len(paths)} files)")
    return filename


if __name__ == "__main__":
    expected = set()
    plugins = sorted(p.parent for p in (ROOT / "plugins").glob("*/spec.yaml"))
    assert OPENAI_ENDPOINTS.keys() <= {p.name for p in plugins}
    for plugin in plugins:
        portable = json.loads((plugin / "_generated/openai/plugin.json").read_bytes())
        if plugin.name in OPENAI_ENDPOINTS or portable["extensions"]["com.openai"].get("publication"):
            expected.add(check(plugin, "openai", "openai-submission"))
        expected.add(check(plugin, "codex", "codex-desktop"))
    actual = {p.name for p in (ROOT / "dist/releases").glob(f"*-{VERSION}.zip")}
    assert actual == expected, f"release asset mismatch: {actual ^ expected}"
