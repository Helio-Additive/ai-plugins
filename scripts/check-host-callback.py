"""Offline plugin OAuth regression; no tokens/grants. Missing host exits 77."""
import json,os,tempfile,subprocess,select,time,threading,shutil
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlsplit,parse_qs
repo=Path(__file__).resolve().parents[1]
binary=Path(os.environ.get("HELIO_HOST_BINARY","/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex"))
if not binary.is_file():
 print("UNAVAILABLE: installed host absent; callback compatibility not verified");raise SystemExit(77)
dcr_count=0
seen=[]
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*a):pass
 def do_GET(self):
  base='http://127.0.0.1:'+str(self.server.server_port)
  if self.path.startswith('/authorize?'):
   q=parse_qs(urlsplit(self.path).query);seen.append((q.get('client_id'),q.get('redirect_uri')));self.send_response(400);self.end_headers();return
  if 'oauth-authorization-server' in self.path or 'openid-configuration' in self.path:
   obj=json.loads((repo/'scripts/fixtures/nightly-oauth-discovery.json').read_text())
   for key in ['issuer','authorization_endpoint','token_endpoint','jwks_uri','revocation_endpoint']:
    obj[key]=base+('' if key=='issuer' else '/'+key)
   obj['authorization_endpoint']=base+'/authorize'
   obj.pop('authorization_response_iss_parameter_supported',None)
   if issuer_flag is not None:obj['authorization_response_iss_parameter_supported']=issuer_flag
  elif 'oauth-protected-resource' in self.path: obj={'resource':base+'/mcp','authorization_servers':[base]}
  else:
   self.send_response(401);self.send_header('WWW-Authenticate','Bearer resource_metadata="'+base+'/.well-known/oauth-protected-resource"');self.end_headers();return
  data=json.dumps(obj).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if self.path=='/register':
   global dcr_count;dcr_count+=1;registration=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
   self.send_response(201);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(json.dumps({'client_id':'mock-public-client','redirect_uris':registration['redirect_uris']}).encode())
  else:self.send_response(403);self.end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start()
base='http://127.0.0.1:'+str(server.server_port)
with tempfile.TemporaryDirectory(prefix='helio-callback-') as tmp:
 for issuer_flag,explicit in [(flag,cb) for flag in [True,None,False] for cb in [False,True]]:
  home=Path(tmp)/(str(issuer_flag)+'-'+str(explicit));home.mkdir();ch=home/'codex';ch.mkdir()
  # Install copied fixture through plugin protocol, never server config.
  fixture=home/'fixture';shutil.copytree(repo/'plugins/slicing/_generated/test',fixture)
  f=fixture/'.mcp.json';j=json.loads(f.read_text());s=j['mcpServers']['helioadditive-slicing'];s['url']=base+'/mcp'
  assert s['oauth']['callbackUrl']=='http://127.0.0.1/callback', 'regenerate fixed test bundle first'
  if not explicit:s['oauth'].pop('callbackUrl')
  f.write_text(json.dumps(j))
  market=fixture/'.agents/plugins';market.mkdir(parents=True)
  (market/'marketplace.json').write_text(json.dumps({'name':'fixture-market','plugins':[{'name':'helioadditive-slicing','source':{'source':'local','path':'./'},'policy':{'installation':'AVAILABLE','authentication':'ON_USE'}}]}))
  env={'PATH':os.environ['PATH'],'HOME':str(home),'CODEX_HOME':str(ch)}
  p=subprocess.Popen([str(binary),'app-server','--stdio'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,env=env)
  def req(i,m,params):
   p.stdin.write(json.dumps({'id':i,'method':m,'params':params})+'\n');p.stdin.flush();end=time.time()+12
   while time.time()<end:
    if select.select([p.stdout],[],[],.5)[0]:
     line=p.stdout.readline()
     if not line:break
     o=json.loads(line)
     if o.get('id')==i:return o
   return {'error':{'message':'timeout'}}
  try:
   req(1,'initialize',{'clientInfo':{'name':'fixture','version':'1'},'capabilities':{'experimentalApi':True}})
   listing=req(2,'plugin/list',{'cwds':[str(fixture)],'marketplaceKinds':['local'],'forceRefetch':False})
   installed=req(3,'plugin/install',{'marketplacePath':str(market/'marketplace.json'),'pluginName':'helioadditive-slicing'})
   print('issuer_flag',issuer_flag,'explicit',explicit,'install',installed)
   cached=list((ch/'plugins/cache').rglob('.mcp.json'))
   assert len(cached)==1, 'expected isolated installed cache copy'
   assert json.loads(cached[0].read_text())==j
   # Editing the marketplace source does not update the already installed copy.
   original=f.read_text();f.write_text('{}')
   assert json.loads(cached[0].read_text())==j
   f.write_text(original)
   status=req(4,'mcpServerStatus/list',{})
   assert status['result']['data'][0]['pluginId']=='helioadditive-slicing@fixture-market'
   result=req(5,'mcpServer/oauth/login',{'name':'helioadditive-slicing','timeoutSecs':5})
   if 'error' in result:raise RuntimeError('host OAuth RPC failed: '+result['error'].get('message','unknown'))
   else:
    r=result.get('result',{});url=r.get('authorizationUrl') or r.get('authorization_url')
    q=parse_qs(urlsplit(url).query) if url else {}
    assert q.get('client_id')==['openai-plugin']
    assert dcr_count==0
    redirect=urlsplit(q['redirect_uri'][0])
    assert redirect.scheme=='http' and redirect.hostname=='127.0.0.1' and redirect.port
    if issuer_flag is True and explicit:assert redirect.path=='/callback'
    else:assert redirect.path.startswith('/callback/') and len(redirect.path.split('/'))==3
    assert urlsplit(url).netloc==urlsplit(base).netloc
    import urllib.request,urllib.error
    try:urllib.request.urlopen(url,timeout=3)
    except urllib.error.HTTPError:pass
    assert seen[-1]==(q['client_id'],q['redirect_uri'])
    print('ASSERTED fixed client, zero DCR, local mock received request')
    print('issuer_flag',issuer_flag,'explicit',explicit,'client_id',q.get('client_id'),'redirect_uri',q.get('redirect_uri'))
  finally:p.terminate();p.wait(timeout=5)
server.shutdown()
