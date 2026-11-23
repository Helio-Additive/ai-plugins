# Provider OAuth rollout

The [support matrix](../README.md#support-matrix) distinguishes installable
packages from connections that still need a Helio sign-in check. Assume a fresh
host profile for those checks so a cached grant cannot hide a discovery or
registration problem.

## Shared endpoint contract

Use the existing Streamable HTTP routes `/slicing` and `/dragon`. In production
the protected resource and JWT audience are the full URLs
`https://mcp.helioadditive.com/slicing` and
`https://mcp.helioadditive.com/dragon`. The issuer is
`https://auth.helioadditive.com`, with JWKS at `/.well-known/jwks.json` on the
issuer. The route and Auth resource names are `slicing-mcp` and `dragon-mcp`
with the matching `slicing` and `dragon` scopes. The OAuth client does not change
those audience, issuer or scope requirements.

The public discovery check returned a `401` with route-specific protected
resource metadata on both routes. Auth advertises S256, public-client token
authentication (`none`) and issuer identification in the redirect (RFC 9207).
The registered `generic-agent` callback on
`http://127.0.0.1:6276/oauth/callback` reached the sign-in page. The Gemini CLI
and Qwen Code default callback probes returned `400`. These checks used no
account and completed no token exchange.

## Auth policy and gateway changes

OAuth policy is generated from
[`devops/apps/auth/scripts/generate.ts`](https://github.com/Helio-Additive/devops/blob/main/apps/auth/scripts/generate.ts).
It is enforced by [`ms-auth/crates/oauth`](https://github.com/Helio-Additive/ms-auth/tree/main/crates/oauth).
The shared endpoints and route policies are generated from
[`devops/infra/k8s/agentgateway`](https://github.com/Helio-Additive/devops/tree/main/infra/k8s/agentgateway).
Apply and verify the policy in nightly before enabling it in production.

| Host | Auth policy or implementation follow-up | Agent Gateway follow-up |
| --- | --- | --- |
| Gemini CLI | Add `http://localhost/oauth/callback` to `generic-agent.loopbackRedirectUris`. The CLI selects a free port. Verify the redirect carries the exact discovered issuer and the token request uses the correct resource. | Reuse `/slicing` and `/dragon` with the existing JWT and scope policy. |
| Gemini Enterprise | Register a dedicated confidential client for `https://vertexaisearch.cloud.google.com/oauth-redirect`, limited to `slicing-mcp` and `dragon-mcp` and their respective scopes. Enable PKCE in the data store. Use `client_secret_basic` with Google's default HTTP Basic setting and store the secret in the host and Auth secret configurations. Supply the service URL as the OAuth `resource` parameter and confirm it is used during token exchange. | Reuse the two shared routes and validate Google's server-side requests with Helio-issued tokens. |
| Qwen Code | Add the exact `http://localhost:7777/oauth/callback` to `generic-agent.redirectUris`. For remote Qwen Code, register the exact HTTPS callback of the approved deployment if needed. | Reuse the same two routes. Probe each from a fresh CLI profile with no stored credentials. |
| Grok Bot desktop | Capture the exact `redirect_uri`, PKCE support and token endpoint auth method from a controlled connector setup. Register a dedicated client for only `slicing-mcp` and `dragon-mcp` with the corresponding scopes. For public clients use `none`; for a required confidential client use the observed `client_secret_basic` or `client_secret_post` method and provision the secret through the service's secret configuration. Verify discovery advertises the chosen method. | Reuse the shared routes if the connector requests the advertised resource and scope. Verify that the connector sees the `401` challenge and preserve the existing JWT/tool policy. |
| Grok web | Confirm the custom connector's exact HTTPS callback, whether it accepts a provided public client, and which token auth method it actually uses. Register a dedicated client with the observed callback, method and PKCE contract, limited to the two resources and scopes. If the host requires dynamic registration, apply the registration requirements below. | Use the public shared routes and test route-specific resource discovery from the hosted connector. |
| Grok API | The calling app obtains and renews a Helio user access token for the selected resource. Register the app's exact callback if its host does not use an existing approved one. The xAI API key authenticates only to xAI. | No route change. Verify that the forwarded access token has the selected route as its audience. |
| Grok Build | The public MCP guide describes browser OAuth. Verify whether the installed version takes a provided client ID and capture its exact loopback callback. Register that callback for the approved client, or apply the dynamic registration requirements if needed. | Reuse the shared routes. |
| DeepSeek Harness | With the native OAuth manager, use `generic-agent`. The callback is the Harness WebServer origin plus `/mcp/oauth/callback/` and the SHA-256 hex digest of the entry's credential key. Capture the exact callback from the target build. Register each callback path in `loopbackRedirectUris` for the observed local host, or register the exact approved HTTPS URI for a hosted instance. | Reuse the shared routes. Verify public-client OAuth and a separate grant for each resource. |
| DeepSeek Chat / API, Qwen outside Qwen Code, Generic | The application or MCP host owns OAuth. Register its exact callback on an approved client when needed. Use the registered Helio resource and scope for the target service. | Reuse the shared routes. Provider API keys and model identity tokens do not grant Helio access. |

Callback contracts are taken from the
[Gemini CLI MCP guide](https://geminicli.com/docs/tools/mcp-server/),
[Gemini Enterprise data store guide](https://docs.cloud.google.com/gemini/enterprise/docs/connectors/custom-mcp-server/set-up-custom-mcp-server),
[Qwen Code MCP guide](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/mcp-server/),
[Grok Bot connector guide](https://docs.x.ai/grok-bot/computer-and-apps),
[Grok web connector guide](https://docs.x.ai/grok/connectors), and
[DeepSeek Harness OAuth source](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/src/oauth.ts).
The Grok and Grok Bot public guides do not specify callback values. Keep their
registrations pending until each value is observed for that specific host.

### Kimi global and mainland China

Both Kimi manifests remain URL-only. The gateway uses the `/kimi/slicing` and
`/kimi/dragon` paths on each regional host, with path-specific audiences and the
regional Auth issuer. The DevOps Auth policy defines `kimi-plugin` as a static
public client and allows `http://127.0.0.1/callback` on variable ports.

A fresh Kimi Code CLI install needs to obtain a client ID using its MCP OAuth
flow. A static client in the Helio policy alone does not configure a URL-only
Kimi client. Global protected-resource metadata responded, and global Auth
metadata did not advertise a `registration_endpoint`. Mainland China discovery
could not be reached from the test runner, so verify it from the intended region.

If the installed Kimi CLI requires dynamic registration, add the registration
endpoint in `ms-auth` and expose it in the regional authorization-server
metadata. Scope registered public clients to the intended Kimi resources and
service scopes, require PKCE S256, and restrict callbacks to the observed literal
loopback host and path. Confirm which callback the target Kimi version sends
before enabling the policy. Keep the current gateway paths, resource metadata,
JWT audiences, issuers, scope checks and tool policies. Run a fresh-profile
sign-in check against both regional deployments before advertising support.

### Dynamic registration and rollout checks

If another host also requires dynamic registration, confirm its advertised
client metadata, exact callback and authentication method before enabling
registration for that host. Keep registered clients restricted to approved
callbacks, resources and scopes. Continue to validate the resource and scope
at Auth and at the gateway. If a new provider-specific gateway route is needed
later, add the exact route URL as its own Auth resource and JWT audience,
advertise the same URL in protected-resource metadata, and use the existing
service scope and tool policy.

In the DevOps auth and gateway contract tests, cover the valid callback and
reject a mismatched host, callback path, resource and scope. Then check fresh
interactive authorization, token exchange and refresh, `tools/list`, and the
read-only slicing call in the README. Verify that an access token for one route
is rejected by the other. Publication requires a separate authorization.
