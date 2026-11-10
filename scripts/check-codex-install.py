"""Opt-in installed-CLI regression in temporary homes; no MCP, OAuth or live config.

Copies the real installer into inert fixture repositories. Their `just make`
only writes a marker; the repository build is checked separately by `just make`.
Requires Python 3.11+, Bun, Just and a plugin-capable Codex (verified on 0.167.0).
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tomllib

REPO = Path(__file__).resolve().parents[1]
MARKET = "helioadditive-plugins"
NAMES = ["helioadditive-dragon", "helioadditive-slicing"]
for executable in ["codex", "bun", "just"]:
    if not shutil.which(executable):
        print(f"UNAVAILABLE: {executable} absent; installer compatibility NOT verified")
        raise SystemExit(77)


def fixture(path, market=MARKET, names=NAMES):
    catalog = path / ".agents/plugins/marketplace.json"
    catalog.parent.mkdir(parents=True)
    catalog.write_text(json.dumps({"name": market, "plugins": [
        {"name": name, "source": {"source": "local", "path": "./" + name}}
        for name in names
    ]}))
    test_catalog = path / ".cache/codex-local-marketplace/.agents/plugins/marketplace.json"
    test_catalog.parent.mkdir(parents=True)
    test_catalog.write_text(json.dumps({"name": market, "plugins": [
        {"name": name, "source": {"source": "local", "path": "./plugins/" + name}}
        for name in names
    ]}))
    for name in names:
        plugin = path / name
        (plugin / ".codex-plugin").mkdir(parents=True)
        (plugin / ".codex-plugin/plugin.json").write_text(json.dumps({
            "name": name, "version": "1.0.0", "description": "Inert installer fixture"
        }))
        (plugin / "skills/fixture").mkdir(parents=True)
        (plugin / "skills/fixture/SKILL.md").write_text(
            "---\nname: fixture\ndescription: Inert installer fixture\n---\nOriginal content.\n")
    for name in names:
        shutil.copytree(path / name, path / ".cache/codex-local-marketplace/plugins" / name)
    (path / "scripts").mkdir()
    shutil.copyfile(REPO / "scripts/install.ts", path / "scripts/install.ts")
    (path / "justfile").write_text(
        "make:\n    @touch built\n\ninstall host:\n    bun run scripts/install.ts {{quote(host)}}\n")
    return path


def files(path):
    return {str(p.relative_to(path)): p.read_bytes() for p in path.rglob("*") if p.is_file()}


with tempfile.TemporaryDirectory(prefix="helio-codex-install-") as temporary:
    base = Path(temporary)
    target = fixture(base / "target")
    old = fixture(base / "old")
    unrelated = fixture(base / "unrelated", "unrelated", ["unrelated-plugin"])
    stale = fixture(base / "stale", "helio-devops", [])

    for scenario in ["normal", "stale-marketplace", "different-source"]:
        home = base / scenario
        codex_home = home / "codex"
        codex_home.mkdir(parents=True)
        # Deliberately do not inherit credentials or host configuration variables.
        env = {"PATH": os.environ["PATH"], "HOME": str(home),
               "CODEX_HOME": str(codex_home), "XDG_CONFIG_HOME": str(home / ".config")}

        def run(args, expected=0):
            result = subprocess.run(args, cwd=target, env=env, text=True,
                                    capture_output=True, timeout=30)
            assert result.returncode == expected, (
                args, result.returncode, result.stdout, result.stderr)
            return result

        def cli(*args, expected=0):
            return run(["codex", "plugin", *args], expected)

        def inventory(market=MARKET):
            return json.loads(cli("list", "--marketplace", market, "--json").stdout)["installed"]

        def config():
            return tomllib.loads((codex_home / "config.toml").read_text())

        def unrelated_config():
            value = config()
            value.get("marketplaces", {}).pop(MARKET, None)
            for name in NAMES:
                value.get("plugins", {}).pop(f"{name}@{MARKET}", None)
            # An initially absent table and an empty table have the same meaning.
            return {k: v for k, v in value.items() if v != {}}

        cli("marketplace", "add", str(unrelated))
        cli("add", "unrelated-plugin@unrelated")
        config_file = codex_home / "config.toml"
        config_file.write_text(config_file.read_text().replace("enabled = true", "enabled = false")
                               + '\n[notice]\nhide_full_access_warning = true\n')
        if scenario != "normal":
            # Register a valid catalog, then remove its manifest to match the report.
            stale_manifest = stale / ".agents/plugins/marketplace.json"
            stale_manifest.write_text('{"name":"helio-devops","plugins":[]}')
            cli("marketplace", "add", str(stale))
            stale_manifest.unlink()
            failure = cli("list", "--json", expected=1)
            assert "helio-devops" in failure.stderr
            assert "marketplace root does not contain a supported manifest" in failure.stderr
            cli("marketplace", "list", "--json", expected=1)
        if scenario == "different-source":
            cli("marketplace", "add", str(old))
            for name in NAMES:
                cli("add", f"{name}@{MARKET}")

        before = unrelated_config()
        unrelated_cache = codex_home / "plugins/cache/unrelated"
        cache_before = files(unrelated_cache)
        assert cache_before

        def preserved():
            assert unrelated_config() == before
            assert files(unrelated_cache) == cache_before
            entries = inventory("unrelated")
            assert len(entries) == 1 and entries[0]["enabled"] is False

        for repeat in range(2):
            skill = target / ".cache/codex-local-marketplace/plugins" / NAMES[0] / "skills/fixture/SKILL.md"
            skill.write_text(skill.read_text() + f"Refreshed {scenario}, pass {repeat}.\n")
            run(["just", "install", "codex"])
            assert (target / "built").exists()
            assert {p["pluginId"] for p in inventory()} == {f"{n}@{MARKET}" for n in NAMES}
            assert config()["marketplaces"][MARKET]["source"] == str((target / ".cache/codex-local-marketplace").resolve())
            cached_skill = codex_home / "plugins/cache" / MARKET / NAMES[0] / "1.0.0/skills/fixture/SKILL.md"
            assert cached_skill.read_text() == skill.read_text()
            preserved()
        if scenario != "normal":
            assert "helio-devops" in config()["marketplaces"]
            cli("list", "--json", expected=1)  # We have not repaired or disabled it.
        print(f"PASS {scenario}: install, repeat, refreshed cache, unrelated config/plugin preserved")

        # Selected-marketplace errors and extra installed plugins must fail before removal.
        manifest = target / ".cache/codex-local-marketplace/.agents/plugins/marketplace.json"
        original = manifest.read_text()
        snapshot = (config_file.read_bytes(), files(codex_home / "plugins/cache"))
        manifest.write_text("invalid JSON")
        failure = run(["just", "install", "codex"], expected=1)
        assert "invalid marketplace file" in failure.stderr
        assert snapshot == (config_file.read_bytes(), files(codex_home / "plugins/cache"))
        manifest.write_text(original)

        extra = fixture(base / (scenario + "-extra"), MARKET, ["extra-plugin"])
        shutil.copytree(extra / "extra-plugin", target / ".cache/codex-local-marketplace/plugins/extra-plugin")
        expanded = json.loads(original)
        expanded["plugins"].append({"name": "extra-plugin", "source": {"source": "local", "path": "./plugins/extra-plugin"}})
        manifest.write_text(json.dumps(expanded))
        cli("add", f"extra-plugin@{MARKET}")
        snapshot = (config_file.read_bytes(), files(codex_home / "plugins/cache"))
        failure = run(["just", "install", "codex"], expected=1)
        assert "Additional plugins use the Helio marketplace" in failure.stderr
        assert snapshot == (config_file.read_bytes(), files(codex_home / "plugins/cache"))
        cli("remove", f"extra-plugin@{MARKET}")
        manifest.write_text(original)
        shutil.rmtree(target / ".cache/codex-local-marketplace/plugins/extra-plugin")
        preserved()

        (target / "built").unlink()
        failure = run(["just", "install", "code"], expected=1)
        assert "Host must be codex or claude" in failure.stderr
        assert not (target / "built").exists()
        print(f"PASS {scenario}: malformed selected catalog, extra plugin, unsupported client")
