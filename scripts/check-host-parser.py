"""Opt-in desktop parser check. No installation, authentication or tool calls."""
import json, os, select, shutil, subprocess, tempfile, time
from pathlib import Path
binary = Path(os.environ.get('HELIO_HOST_BINARY', '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'))
if not binary.is_file():
    print('UNAVAILABLE: desktop host binary absent; compatibility NOT verified'); raise SystemExit(77)
repo = Path(__file__).resolve().parents[1]
modes = {'portable': 'openai', 'compatible': 'test', 'codex': 'codex'}
# Read the contract from source so a missing generated file cannot lower the expectations.
plugins = json.loads(subprocess.check_output(['bun', '-e', """
import { loadPluginSpecs } from './lib/build.ts';
const plugins = await loadPluginSpecs();
console.log(JSON.stringify(plugins.map(({ source, spec }) => ({
    source, name: spec.name, hasMcp: Boolean(spec.mcp?.openai),
}))));
"""], cwd=repo, text=True))
with tempfile.TemporaryDirectory(prefix='helio-host-') as tmp:
    root = Path(tmp); home = root/'home'; home.mkdir(); (home/'codex').mkdir()
    expected = {}
    for mode, bundle in modes.items():
        directory = root / mode
        market = directory / '.agents/plugins'
        market.mkdir(parents=True)
        entries = []
        for plugin in plugins:
            product = Path(plugin['source'])
            name = plugin['name']
            target = './plugins/' + product.name
            shutil.copytree(product / '_generated' / bundle, directory / target)
            entries.append({'name': name, 'source': {'source': 'local', 'path': target}})
            expected[mode, name] = (len(list(product.glob('skills/*/SKILL.mdx'))), plugin['hasMcp'])
        (market / 'marketplace.json').write_text(json.dumps({'name': 'fixture-' + mode, 'plugins': entries}))
    env = dict(os.environ, HOME=str(home), CODEX_HOME=str(home/'codex'))
    print('host', subprocess.check_output([str(binary), '--version'], env=env, text=True).strip())
    with (root/'stderr').open('w') as err:
        p = subprocess.Popen([str(binary),'app-server','--stdio'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=err,text=True,env=env)
        def request(i, method, params):
            p.stdin.write(json.dumps({'id':i,'method':method,'params':params})+'\n'); p.stdin.flush()
            deadline = time.monotonic()+20
            while time.monotonic()<deadline:
                if select.select([p.stdout],[],[],1)[0]:
                    line=p.stdout.readline()
                    if not line: break
                    obj=json.loads(line)
                    if obj.get('id')==i:
                        if 'error' in obj: raise RuntimeError('host RPC failed: '+method)
                        return obj['result']
            raise RuntimeError('host RPC timed out: '+method)
        try:
            request(1,'initialize',{'clientInfo':{'name':'helio-fixture','version':'1'},'capabilities':{'experimentalApi':True}})
            p.stdin.write('{"method":"initialized"}\n'); p.stdin.flush()
            request(2,'plugin/list',{'cwds':[str(root/m) for m in modes], 'marketplaceKinds':['local'],'forceRefetch':False})
            for i, ((mode, name), (skill_count, native_mcp)) in enumerate(expected.items(), 3):
                plugin = request(i, 'plugin/read', {'marketplacePath': str(root / mode / '.agents/plugins/marketplace.json'), 'pluginName': name})['plugin']
                servers = plugin.get('mcpServers', {})
                skills = plugin.get('skills', [])
                print(mode, name, 'MCP servers:', sorted(servers), 'skills:', len(skills))
                assert len(skills) == skill_count, (mode, name)
                if mode != 'portable':
                    assert set(servers) == ({name} if native_mcp else set()), (mode, name)
        finally:
            p.terminate(); p.wait(timeout=5)
