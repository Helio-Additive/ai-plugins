"""Opt-in desktop parser check. No installation, authentication or tool calls."""
import json, os, select, shutil, subprocess, tempfile, time
from pathlib import Path
binary = Path(os.environ.get('HELIO_HOST_BINARY', '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex'))
if not binary.is_file():
    print('UNAVAILABLE: desktop host binary absent; compatibility NOT verified'); raise SystemExit(77)
repo = Path(__file__).resolve().parents[1]
modes = {'portable': 'openai', 'compatible': 'test', 'codex': 'codex'}
with tempfile.TemporaryDirectory(prefix='helio-host-') as tmp:
    root = Path(tmp); home = root/'home'; home.mkdir(); (home/'codex').mkdir()
    for mode, bundle in modes.items():
        d = root/mode
        shutil.copytree(repo/'plugins/slicing/_generated'/bundle, d)
        market = d/'.agents/plugins'; market.mkdir(parents=True)
        (market/'marketplace.json').write_text(json.dumps({'name': 'fixture-'+mode, 'plugins': [{'name':'helioadditive-slicing','source':{'source':'local','path':'./'}}]}))
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
            for i, mode in enumerate(modes,3):
                plugin=request(i,'plugin/read',{'marketplacePath':str(root/mode/'.agents/plugins/marketplace.json'),'pluginName':'helioadditive-slicing'})['plugin']
                servers=plugin.get('mcpServers',{})
                print(mode, 'MCP servers:', sorted(servers), 'skills:', len(plugin.get('skills',[])))
                if mode in ('compatible', 'codex'): assert 'helioadditive-slicing' in servers, 'MCP discovery failed'
        finally:
            p.terminate(); p.wait(timeout=5)
