"""Check a committed Git snapshot with the installed Codex CLI, without live auth.

Requires Python 3.11+, Git and Codex. Run after committing the generated packages.
All host state is isolated. Git's process-local URL rewrite maps the fixture's
HTTPS URL to a temporary local repository; no GitHub or Helio requests are made.
"""
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import tomllib

REPO = Path(__file__).resolve().parents[1]
MARKET = "helioadditive-plugins"
URL = "https://example.invalid/helio-codex-fixture.git"
for executable in ["git", "codex"]:
    if not shutil.which(executable):
        print(f"UNAVAILABLE: {executable} absent; Git installation NOT verified")
        raise SystemExit(77)


def run(args, cwd, env):
    result = subprocess.run(args, cwd=cwd, env=env, text=True,
                            capture_output=True, timeout=60)
    assert result.returncode == 0, (args, result.returncode, result.stdout, result.stderr)
    return result.stdout


with tempfile.TemporaryDirectory(prefix="helio-codex-git-") as temporary:
    base = Path(temporary)
    remote = base / "remote"
    remote.mkdir()
    archive = subprocess.check_output(["git", "archive", "HEAD"], cwd=REPO)
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
        bundle.extractall(remote, filter="data")
    catalog = json.loads((remote / ".agents/plugins/marketplace.json").read_text())
    assert catalog["name"] == MARKET
    packages = {}
    for entry in catalog["plugins"]:
        source = entry["source"]
        assert source["source"] == "local"
        package = (remote / source["path"]).resolve()
        assert package.is_relative_to(remote.resolve())
        assert package.name == "codex", "Git catalog must use committed packages"
        assert not (package.parent / "test").exists(), "archive must not contain test output"
        manifest = json.loads((package / ".codex-plugin/plugin.json").read_text())
        assert manifest["name"] == entry["name"]
        assert (package / "skills").is_dir()
        assert not (package / "plugin.json").exists(), "portable manifest hides native MCP discovery"
        packages[entry["name"]] = (package, manifest)

    home = base / "home"
    codex_home = home / "codex"
    codex_home.mkdir(parents=True)
    # Purpose-specific temporary host directories; no user credentials or config.
    env = {"PATH": os.environ["PATH"], "HOME": str(home), "CODEX_HOME": str(codex_home),
           "XDG_CONFIG_HOME": str(home / ".config"), "GIT_CONFIG_NOSYSTEM": "1",
           "GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": f"url.{remote.as_uri()}.insteadOf",
           "GIT_CONFIG_VALUE_0": URL, "GIT_TERMINAL_PROMPT": "0"}

    def git(*args):
        return run(["git", *args], remote, env)

    def cli(*args):
        return json.loads(run(["codex", "plugin", *args, "--json"], base, env))

    git("init", "-b", "main")
    git("config", "user.name", "Helio fixture")
    git("config", "user.email", "fixture@example.invalid")
    git("add", ".")
    git("commit", "-m", "Committed plugin snapshot")
    first = git("rev-parse", "HEAD").strip()
    added = cli("marketplace", "add", URL, "--ref", "main")
    snapshot = Path(added["installedRoot"])
    assert run(["git", "rev-parse", "HEAD"], snapshot, env).strip() == first
    config = tomllib.loads((codex_home / "config.toml").read_text())
    assert config["marketplaces"][MARKET]["source"] == URL
    assert config["marketplaces"][MARKET]["source_type"] == "git"

    for name, (package, _) in packages.items():
        installed = cli("add", f"{name}@{MARKET}")
        cache = Path(installed["installedPath"])
        for source in package.rglob("*"):
            if source.is_file():
                assert (cache / source.relative_to(package)).read_bytes() == source.read_bytes()
    inventory = cli("list", "--marketplace", MARKET)["installed"]
    assert {p["name"] for p in inventory} == set(packages)
    assert all(p["enabled"] for p in inventory)
    print("PASS: clean Git archive installs every committed package without a build or OAuth")

    name = "helioadditive-slicing"
    package, _ = packages[name]
    skill = next(package.glob("skills/*/SKILL.md"))
    marker = "\nGit upgrade fixture revision.\n"
    skill.write_text(skill.read_text() + marker)
    git("add", ".")
    git("commit", "-m", "Updated fixture skill")
    second = git("rev-parse", "HEAD").strip()
    assert second != first
    upgraded = cli("marketplace", "upgrade", MARKET)
    assert not upgraded.get("errors"), upgraded
    assert run(["git", "rev-parse", "HEAD"], snapshot, env).strip() == second
    installed = cli("add", f"{name}@{MARKET}")
    assert (Path(installed["installedPath"]) / skill.relative_to(package)).read_text().endswith(marker)
    print("PASS: Git upgrade fetches the new revision; re-add refreshes the installed cache")
