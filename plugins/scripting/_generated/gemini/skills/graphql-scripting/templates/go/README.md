# Go template

Use [Khan Academy's genqlient](https://github.com/Khan/genqlient) for operation-specific Go types and functions. It validates operations during generation and uses Go's HTTP client; no server framework is needed.

```sh
go mod init example.com/helio-script
go get -tool github.com/Khan/genqlient@v0.8.1
go get golang.org/x/tools@v0.52.0
mkdir -p queries

```

Use Go 1.26 for this recipe. Keep `go.mod` and `go.sum`, including the tool dependency. The explicit `x/tools` update fixes genqlient 0.8.1's older generator dependency on modern Go compilers; it does not change the runtime API. Acquire `schema.graphqls` through the [schema workflow](../../references/schema-workflow.md). Create `queries/Probe.graphql` containing `query Probe { __typename }`. Create `genqlient.yaml`:

```yaml
schema: schema.graphqls
operations: queries/*.graphql
generated: generated.go
package: main
optional: pointer

```

Generate locally:

```sh
go tool genqlient

```

Create `main.go`:

```go
package main

import (
    "context"
    "fmt"
    "net/http"
    "os"
    "time"

    "github.com/Khan/genqlient/graphql"
)

type authTransport struct{ token string }
func (t authTransport) RoundTrip(req *http.Request) (*http.Response, error) {
    copy := req.Clone(req.Context())
    copy.Header.Set("Authorization", "Bearer " + t.token)
    return http.DefaultTransport.RoundTrip(copy)
}
func main() {
    endpoint, token := os.Getenv("HELIO_GRAPHQL_URL"), os.Getenv("HELIO_PAT_TOKEN")
    if endpoint == "" || token == "" { panic("Supply endpoint and PAT through the host") }
    httpClient := &http.Client{Transport: authTransport{token}, Timeout: 60 * time.Second}
    client := graphql.NewClient(endpoint, httpClient)
    result, err := Probe(context.Background(), client)
    if err != nil { panic("GraphQL request failed") }
    fmt.Printf("%+v\n", result)
}

```

```sh
go mod tidy
go build ./...
go run .

```

Add verified operations and rerun generation. Exported operation names start with uppercase letters. Pointer option preserves nullable inputs/results rather than silently conflating null with zero values. Add genqlient `bindings` only for verified scalar encodings and corresponding JSON marshal/unmarshal implementations. Keep HTTP timeouts and check returned errors; never log tokens or whole authenticated request objects.
