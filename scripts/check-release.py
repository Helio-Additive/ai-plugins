"""Check the actual release ZIPs against the generated production bundles."""

import json
import re
import struct
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "package.json").read_text())["version"]


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
        if plugin.name in ("slicing", "dragon"):
            config = json.loads(archive.read("mcp.json" if portable else ".mcp.json"))
            assert set(config["mcpServers"]) == {manifest["name"]}
            server = config["mcpServers"][manifest["name"]]
            assert server["url"] == f"https://mcp.helioadditive.com/openai/{plugin.name}"
            if portable:
                assert ".codex-plugin/plugin.json" not in paths and ".mcp.json" not in paths
                assert server["type"] == "streamable-http"
                assert server["extensions"]["com.openai"]["auth"] == {
                    "type": "oauth", "baseScopes": [plugin.name],
                    "client": {"mode": "provided", "clientId": "openai-plugin", "tokenEndpointAuthMethod": "none"},
                }
                ext = manifest["extensions"]["com.openai"]
                assert not manifest.get("apps") and not ext.get("apps")
                cases = ext["review"]["test_cases"]
                assert len(cases["positive"]) == 5 and len(cases["negative"]) == 3
                assert len(interface["shortDescription"]) <= 30
                for field in ("websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"):
                    assert interface[field].startswith("https://")
            else:
                assert "plugin.json" not in paths and "mcp.json" not in paths
                assert server["oauth"]["clientId"] == "openai-plugin"
                assert server["scopes"] == [plugin.name]
        print(f"Verified {filename} ({len(paths)} files)")


if __name__ == "__main__":
    for spec in sorted((ROOT / "plugins").glob("*/spec.yaml")):
        if spec.parent.name in ("dragon", "slicing"):
            check(spec.parent, "openai", "openai-submission")
        check(spec.parent, "codex", "codex-desktop")
