#!/usr/bin/env python3
"""Production OAuth PKCE smoke test. Tokens remain in memory unless --print-token is selected; no dependencies.

Run: python3 scripts/check-mcp-oauth.py
Complete the browser sign-in. Tests discovery, code exchange, tools/list,
a read-only slicer_version call, and optional GET stream support.
"""
import argparse
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--no-browser', action='store_true', help='Print the authorization URL instead of opening a browser')
parser.add_argument('--print-token', action='store_true', help='Print the access token to this terminal (sensitive; do not share logs)')
parser.add_argument('--slice', metavar='STL', help='Upload this local STL and create one production slice')
parser.add_argument('--machine-id', help='Machine preset ID returned by slicer_machines')
parser.add_argument('--filament-id', action='append', help='Filament preset ID; repeat for multiple filaments')
parser.add_argument('--process-id', help='Optional process preset ID')
parser.add_argument('--list-machines', action='store_true', help='Print machine presets to select IDs for a later slice run')
args = parser.parse_args()
from pathlib import Path
if args.slice:
 if not args.machine_id or not args.filament_id:
  parser.error('--slice requires --machine-id and --filament-id; use --list-machines to inspect presets first')
 if not Path(args.slice).is_file() or Path(args.slice).suffix.lower() != '.stl':
  parser.error('--slice must name an existing local .stl file')
import base64,hashlib,http.server,json,secrets,threading,urllib.request,urllib.parse,urllib.error,webbrowser
resource='https://mcp.helioadditive.com/openai/slicing'
def request(url,data=None,headers={}):
 try:
  r=urllib.request.urlopen(urllib.request.Request(url,data=data,headers=headers),timeout=30)
  return r.status,dict(r.headers),r.read().decode()
 except urllib.error.HTTPError as e:return e.code,dict(e.headers),e.read().decode()
def discovery(url):
 status,_,body=request(url);assert status==200,(url,status);return json.loads(body)
pr=discovery('https://mcp.helioadditive.com/.well-known/oauth-protected-resource/openai/slicing')
meta=discovery(pr['authorization_servers'][0]+'/.well-known/oauth-authorization-server')
state=secrets.token_urlsafe(32);verifier=secrets.token_urlsafe(48);result={};event=threading.Event()
class Callback(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  params=urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
  if urllib.parse.urlparse(self.path).path!='/callback' or params.get('state')!=[state]:self.send_error(400);return
  result.update(params);self.send_response(200);self.end_headers();self.wfile.write(b'Callback received. You can close this tab.');event.set()
 def log_message(self,*args):pass
server=http.server.HTTPServer(('127.0.0.1',0),Callback)
threading.Thread(target=server.serve_forever,daemon=True).start()
redirect=f'http://127.0.0.1:{server.server_port}/callback'
params=dict(response_type='code',client_id='openai-plugin',redirect_uri=redirect,scope='slicing',resource=resource,state=state,code_challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('='),code_challenge_method='S256')
print('Discovery OK; opening production OAuth sign-in. Waiting up to 10 minutes.',flush=True)
authorization_url = meta['authorization_endpoint']+'?'+urllib.parse.urlencode(params)
if args.no_browser:
 print('Open this URL on this computer:', authorization_url, flush=True)
else:
 webbrowser.open(authorization_url)
assert event.wait(600),'Timed out waiting for browser consent'
server.shutdown()
assert result.get('iss',[meta['issuer']])[0]==meta['issuer'],'Issuer mismatch'
assert 'code' in result,'Authorization denied: '+str(result.get('error'))
status,_,body=request(meta['token_endpoint'],urllib.parse.urlencode(dict(grant_type='authorization_code',client_id='openai-plugin',code=result['code'][0],redirect_uri=redirect,code_verifier=verifier,resource=resource)).encode(),{'Content-Type':'application/x-www-form-urlencoded'})
assert status==200,f'Token exchange HTTP {status}'
token=json.loads(body)
print('Token exchange:',status,{k:token.get(k) for k in ('token_type','expires_in','scope')},'refresh_token_present=',bool(token.get('refresh_token')),flush=True)
if args.print_token:
 print('ACCESS_TOKEN='+token['access_token'], flush=True)
headers={'Authorization':'Bearer '+token['access_token'],'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
def rpc(method,params=None,id=None):
 payload={'jsonrpc':'2.0','method':method}
 if params is not None:payload['params']=params
 if id is not None:payload['id']=id
 status,h,b=request(resource,json.dumps(payload).encode(),headers)
 print(method,'HTTP',status,flush=True)
 if h.get('Mcp-Session-Id'):headers['Mcp-Session-Id']=h['Mcp-Session-Id']
 if not b:return {}
 if b.startswith('event:') or b.startswith('data:'):b=next(line[6:] for line in b.splitlines() if line.startswith('data: '))
 assert status==200,f'{method} failed HTTP {status}'
 value=json.loads(b);assert 'error' not in value,str(value.get('error'));return value.get('result',{})
init=rpc('initialize',{'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'helio-oauth-smoke','version':'1'}},1)
headers['MCP-Protocol-Version']=init['protocolVersion']
rpc('notifications/initialized')
tools=[];cursor=None
while True:
 page=rpc('tools/list',{'cursor':cursor} if cursor else {},2);tools+=page.get('tools',[]);cursor=page.get('nextCursor')
 if not cursor:break
names=[t['name'] for t in tools]
print('Tools:',len(tools),'duplicates:',sorted({n for n in names if names.count(n)>1}),flush=True)
print('Tool names:',', '.join(names),flush=True)
assert tools,'No tools returned'
assert len(names)==len(set(names)), 'Duplicate tool names'
assert 'slicer_version' in names, 'Missing slicer_version tool'
version = rpc('tools/call', {'name':'slicer_version','arguments':{}}, 3)
assert not version.get('isError'), 'slicer_version returned a tool error'
print('slicer_version result:', json.dumps(version), flush=True)
def call_tool(name, arguments, request_id):
 result = rpc('tools/call', {'name':name,'arguments':arguments}, request_id)
 if result.get('isError'):
  raise RuntimeError(name+' returned a tool error: '+json.dumps(result.get('content', [])))
 if result.get('structuredContent') is not None:
  return result['structuredContent']
 for item in result.get('content', []):
  if item.get('type') == 'text':
   return json.loads(item['text'])
 raise RuntimeError(name+' returned no JSON result')
if args.list_machines:
 print(json.dumps(call_tool('slicer_machines', {}, 4), indent=2), flush=True)
if args.slice:
 # Explicit --slice opts into production upload and job creation. Never retry creation.
 upload_result = call_tool('get_presigned_url', {'file_name':Path(args.slice).name}, 5)
 upload = upload_result.get('getPresignedUrl', upload_result)
 url = upload['url']
 if urllib.parse.urlparse(url).scheme != 'https':
  raise RuntimeError('Upload URL must use HTTPS')
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self, *arguments, **keywords):
   return None
 opener = urllib.request.build_opener(NoRedirect)
 try:
  with open(args.slice, 'rb') as model:
   size = Path(args.slice).stat().st_size
   upload_request = urllib.request.Request(url, data=model, method='PUT', headers={
    'Content-Type':upload['mimeType'], 'Content-Length':str(size)})
   with opener.open(upload_request, timeout=120) as response:
    if response.status not in (200, 204):
     raise RuntimeError('Unexpected upload status')
 except Exception:
  raise RuntimeError('STL upload failed; signed URL omitted') from None
 print('STL upload succeeded', flush=True)
 presets = {'machineId':args.machine_id, 'filamentIds':args.filament_id}
 if args.process_id:
  presets['processId'] = args.process_id
 created = call_tool('create_slice', {'input':{
  'inputType':'STL', 'inputKey':upload['key'], 'name':Path(args.slice).name,
  'presetOverrides':presets}}, 6)
 print('create_slice result:', json.dumps(created, indent=2), flush=True)
 print('Slice submitted; inspect its returned status/ID. Completion is not assumed.', flush=True)
for authenticated in (False,True):
 h={'Accept':'text/event-stream','MCP-Protocol-Version':init['protocolVersion']}
 if authenticated:h['Authorization']=headers['Authorization']
 try:
  response=urllib.request.urlopen(urllib.request.Request(resource,headers=h),timeout=5)
  print('GET SSE authenticated=',authenticated,'HTTP',response.status,flush=True);response.close()
 except urllib.error.HTTPError as e:print('GET SSE authenticated=',authenticated,'HTTP',e.code,flush=True)
 except TimeoutError:print('GET SSE authenticated=',authenticated,'timeout waiting for headers',flush=True)
print('PASS: OAuth PKCE, authenticated tools/list, and read-only tools/call. Access token printed only if --print-token was selected.',flush=True)
