#!/usr/bin/env python3
"""Production OAuth PKCE smoke test. Tokens remain in memory; no dependencies.

Run: python3 scripts/check-mcp-oauth.py
Complete the browser sign-in. Tests discovery, code exchange, tools/list,
a read-only slicer_version call, and optional GET stream support.
"""
import argparse
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--no-browser', action='store_true', help='Print the authorization URL instead of opening a browser')
args = parser.parse_args()
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
for authenticated in (False,True):
 h={'Accept':'text/event-stream','MCP-Protocol-Version':init['protocolVersion']}
 if authenticated:h['Authorization']=headers['Authorization']
 try:
  response=urllib.request.urlopen(urllib.request.Request(resource,headers=h),timeout=5)
  print('GET SSE authenticated=',authenticated,'HTTP',response.status,flush=True);response.close()
 except urllib.error.HTTPError as e:print('GET SSE authenticated=',authenticated,'HTTP',e.code,flush=True)
 except TimeoutError:print('GET SSE authenticated=',authenticated,'timeout waiting for headers',flush=True)
print('PASS: OAuth PKCE, authenticated tools/list, and read-only tools/call. Tokens kept in memory only.',flush=True)
