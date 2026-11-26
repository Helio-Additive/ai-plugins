---
name: graphql-scripting
description: Build Helio Additive GraphQL scripts using schema discovery and the bundled language templates. Use when integrating the Helio API or generating typed clients.
---

# Helio GraphQL scripting

1. Establish the user's intended operation and environment. This plugin supplies instructions only; it has no MCP server or credential store.
2. Read the [complete generated API reference](../api-schema/SKILL.md) to understand available operations. Follow [schema discovery](references/schema-workflow.md) before choosing fields, arguments, enums or scalar mappings. Never infer API fields from template names.
3. Choose a language from the generated template tree below and follow its included files. These are setup recipes to materialize in the user’s project, not scripts to execute in the installed plugin.
4. Write named `.graphql` operations from the verified schema, validate them through codegen, and use generated types. Inspect generated names and import paths before writing callers. Preserve list/null wrappers and distinguish transport errors, GraphQL errors, missing data and nullable fields.
5. Obtain credentials only through the host's secure secret mechanism. The documented API uses a user PAT in an Authorization Bearer header. Read it at runtime; never embed tokens in source, shell history, logs, generated artifacts or plugin files. Do not assume schema downloads require the same authentication.
6. Generate and compile locally first. Execute API reads only within the user's requested scope. Obtain explicit consent before mutations that upload data, create jobs, consume credits or otherwise create work; code generation itself grants no such consent. Never invent IDs or results. Do not overwrite G-code artifacts.

Templates intentionally contain no tests or test scaffolding. Adapt package versions to the target project, lock resolved dependencies, and smoke-check generation and compilation. Report whether actual authenticated API execution was performed.

Sources: [Helio code generation](https://docs.helioadditive.com/en/developers/code-generation/) and [docs examples](https://github.com/Helio-Additive/docs/tree/main/examples/codegen).

See [language selection rationale and upstream evidence](references/language-selection.md) for maintenance, generation-style and platform tradeoffs.

## Template tree

```text
templates/
├── cpp/
│   └── README.mdx
├── csharp/
│   └── README.mdx
├── go/
│   └── README.mdx
├── java/
│   └── README.mdx
├── kotlin/
│   └── README.mdx
├── python/
│   └── README.mdx
├── ruby/
│   └── README.mdx
├── rust/
│   └── README.mdx
├── swift/
│   └── README.mdx
└── typescript/
    └── README.mdx
```

## Template files

### templates/cpp/README.mdx

# C++ template

Use C++20, CMake, vcpkg and cppgraphqlgen `clientgen`, following the [docs example](https://github.com/Helio-Additive/docs/tree/main/examples/codegen/cpp). Use an existing authorized vcpkg installation; lock a verified baseline for the target platform rather than copying machine paths.

Create `vcpkg.json`:

```json
{
  "name": "helio-script",
  "version-string": "0.1.0",
  "dependencies": [
    { "name": "cppgraphqlgen", "features": ["clientgen", "rapidjson"] },
    "cpr", "boost-json", "pegtl"
  ]
}

```

```sh
vcpkg install
mkdir -p queries generated/src generated/include

```

Save validated SDL at `schema.graphqls`; write named operations at `queries/operation.graphql`. Locate the installed `clientgen` for the actual vcpkg host triplet and invoke it (put its tools directory on PATH):

```sh
clientgen --schema ./schema.graphqls --request ./queries/operation.graphql --namespace HelioAdditive --prefix Operation --source-dir ./generated/src --header-dir ./generated/include

```

Create `CMakeLists.txt`:

```cmake
cmake_minimum_required(VERSION 3.20)
project(HelioScript LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
find_package(cppgraphqlgen CONFIG REQUIRED)
find_package(cpr CONFIG REQUIRED)
find_package(Boost REQUIRED COMPONENTS json)
file(GLOB GENERATED CONFIGURE_DEPENDS generated/src/*.cpp)
add_executable(helio-script src/main.cpp ${GENERATED})
target_include_directories(helio-script PRIVATE generated/include)
target_link_libraries(helio-script PRIVATE cppgraphqlgen::graphqlclient cppgraphqlgen::graphqlresponse cppgraphqlgen::graphqljson cpr::cpr Boost::json)

```

Set `VCPKG_ROOT` to your existing installation. After creating `src/main.cpp`:

```sh
cmake -S . -B build -DCMAKE_TOOLCHAIN_FILE="$VCPKG_ROOT/scripts/buildsystems/vcpkg.cmake"
cmake --build build
./build/helio-script

```

Inspect the generated header for the exact namespace and operation API. In `main.cpp`, use the generated request text, variable serialization and response parser. POST JSON with CPR to the selected API endpoint using a runtime PAT header; check HTTP status and GraphQL errors before parsing `data`. The docs demonstrate Boost JSON for the envelope. Verify installed cppgraphqlgen targets and scalar support; adapt the target list to its resolved version. Do not copy the docs' hard-coded arm64-osx or Homebrew paths.

### templates/csharp/README.mdx

# C# template

Use [Strawberry Shake](https://chillicream.com/docs/strawberryshake/get-started/console), which generates operation-specific clients during `dotnet build` and integrates with .NET dependency injection. Prefer its HTTP client package for a console script; no GraphQL server or web host is needed.

Use the .NET 10 SDK for this recipe: the published StrawberryShake.Server 16.7.3 package targets net10.0\. This recipe uses matching 16.7.3 packages; keep all Strawberry Shake packages on the same version and lock restored dependencies.

```sh
dotnet new console --name HelioScript
cd HelioScript
dotnet add package StrawberryShake.Server --version 16.7.3
dotnet add package Microsoft.Extensions.DependencyInjection
dotnet restore --use-lock-file
mkdir -p queries

```

Acquire `schema.graphqls` through the [schema workflow](references/schema-workflow.md). Create `queries/Probe.graphql` containing `query Probe { __typename }` and `.graphqlrc.json`:

```json
{
  "schema": "schema.graphqls",
  "documents": "queries/**/*.graphql",
  "extensions": {
    "strawberryShake": {
      "name": "HelioClient",
      "namespace": "HelioScript.GraphQL"
    }
  }
}

```

Unlike the CLI's `init` command, this setup consumes the already validated local snapshot and does not download a second schema. Generate before writing callers:

```sh
dotnet build

```

Create `Program.cs`:

```csharp
using System.Net.Http.Headers;
using Microsoft.Extensions.DependencyInjection;
using StrawberryShake;
using HelioScript.GraphQL;

var endpoint = Environment.GetEnvironmentVariable("HELIO_GRAPHQL_URL")
    ?? throw new InvalidOperationException("Supply the GraphQL endpoint");
var token = Environment.GetEnvironmentVariable("HELIO_PAT_TOKEN")
    ?? throw new InvalidOperationException("Supply the PAT through the host");
var collection = new ServiceCollection();
collection.AddHelioClient().ConfigureHttpClient(http => {
    http.BaseAddress = new Uri(endpoint);
    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
});
using var services = collection.BuildServiceProvider();
var client = services.GetRequiredService<IHelioClient>();
var result = await client.Probe.ExecuteAsync();
result.EnsureNoErrors();
if (result.Data is null) throw new InvalidOperationException("Missing GraphQL data");
Console.WriteLine(result.Data);

```

```sh
dotnet build
dotnet run

```

Inspect generated models for renamed fields and nullable results. Use documented scalar serializers for nonstandard types rather than assuming string encodings. The minimal probe checks transport only. Keep API execution and any future mutations within the shared skill's authorization rules.

### templates/go/README.mdx

# Go template

Use [Khan Academy's genqlient](https://github.com/Khan/genqlient) for operation-specific Go types and functions. It validates operations during generation and uses Go's HTTP client; no server framework is needed.

```sh
go mod init example.com/helio-script
go get -tool github.com/Khan/genqlient@v0.8.1
go get golang.org/x/tools@v0.52.0
mkdir -p queries

```

Use Go 1.26 for this recipe. Keep `go.mod` and `go.sum`, including the tool dependency. The explicit `x/tools` update fixes genqlient 0.8.1's older generator dependency on modern Go compilers; it does not change the runtime API. Acquire `schema.graphqls` through the [schema workflow](references/schema-workflow.md). Create `queries/Probe.graphql` containing `query Probe { __typename }`. Create `genqlient.yaml`:

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

### templates/java/README.mdx

# Java template

Use [Netflix DGS codegen](https://netflix.github.io/dgs/generating-code-from-schema/) and its [Java client](https://netflix.github.io/dgs/advanced/java-client/). DGS provides schema-generated POJOs and typed query/projection builders, rather than generating one response model per `.graphql` operation. Reuse it in existing Java projects; the blocking adapter below uses JDK HTTP without Spring Boot or a reactive stack.

Use JDK 21 and a compatible Gradle 8 wrapper. In an empty directory, create `settings.gradle` with `rootProject.name = 'helio-script'`, then `build.gradle`:

```groovy
plugins {
    id 'application'
    id 'com.netflix.dgs.codegen' version '8.8.0'
}
repositories { mavenCentral() }
java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }
dependencies {
    implementation platform('com.netflix.graphql.dgs:graphql-dgs-platform-dependencies:12.1.0')
    implementation 'com.netflix.graphql.dgs:graphql-dgs-client'
    implementation 'com.netflix.graphql.dgs.codegen:graphql-dgs-codegen-shared-core:8.8.0'
    implementation 'tools.jackson.core:jackson-databind'
    implementation 'tools.jackson.module:jackson-module-kotlin'
}
generateJava {
    schemaPaths = ["${projectDir}/schema"]
    packageName = 'helio.generated'
    generateClient = true
}
application { mainClass = 'helio.Main' }
dependencyLocking { lockAllConfigurations() }

```

```sh
gradle wrapper --gradle-version 8.14.3
mkdir -p schema queries src/main/java/helio

```

Acquire `schema/schema.graphqls` through the [schema workflow](references/schema-workflow.md). Generate and lock dependencies:

```sh
./gradlew generateJava --write-locks

```

DGS generates a builder and projection for each selected root field. After inspecting a real field's generated API, construct its request using `GraphQLQueryRequest(generatedQuery, generatedProjection).serialize()` from `com.netflix.graphql.dgs.client.codegen`; deserialize the relevant response path with `extractValueAsObject` and its generated POJO type. Restrict `includeQueries`/`includeMutations` to the actual fields used when a full schema produces too much code. Do not fabricate class names from this recipe.

For a minimal transport probe, save `queries/Probe.graphql` containing `query Probe { __typename }`, then `src/main/java/helio/Main.java`:

```java
package helio;

import com.netflix.graphql.dgs.client.DgsCustomGraphQLClient;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Map;
import java.util.Objects;

public class Main {
    public static void main(String[] args) throws Exception {
        var endpoint = Objects.requireNonNull(System.getenv("HELIO_GRAPHQL_URL"));
        var token = Objects.requireNonNull(System.getenv("HELIO_PAT_TOKEN"));
        try (var http = HttpClient.newHttpClient()) {
            var client = new DgsCustomGraphQLClient(endpoint, (url, headers, body) -> {
                var builder = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(60))
                    .header("Authorization", "Bearer " + token);
                headers.forEach((name, values) -> values.forEach(value -> builder.header(name, value)));
                try {
                    var response = http.send(builder.POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                        HttpResponse.BodyHandlers.ofString());
                    return new com.netflix.graphql.dgs.client.HttpResponse(response.statusCode(), response.body());
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("Request interrupted");
                } catch (java.io.IOException e) {
                    throw new IllegalStateException("HTTP request failed");
                }
            });
            var result = client.executeQuery(Files.readString(Path.of("queries/Probe.graphql")), Map.of(), "Probe");
            if (result.hasErrors() || result.getData().isEmpty()) throw new IllegalStateException("GraphQL request failed");
            System.out.println(result.getData());
        }
    }
}

```

```sh
./gradlew classes
./gradlew run

```

The probe's meta-field does not exercise a generated business-field builder. Replace it with the serialized generated request for useful work. Inspect generated scalar mappings: DGS has conventional mappings for some names, which must still match Helio's actual contracts. Configure `typeMapping` and client coercions explicitly where required. A generated schema POJO is not proof that an unselected field exists in a response.

### templates/kotlin/README.mdx

# Kotlin template

Use [Apollo Kotlin](https://github.com/apollographql/apollo-kotlin), whose operation codegen and suspending client API keep scripts concise. Use a plain JVM application rather than introducing Android or a server framework. This recipe pairs Apollo 5.2.0 with Kotlin 2.3.10, the Kotlin version used by that release's build.

Use JDK 21 and a compatible Gradle 8 wrapper. Create `settings.gradle.kts` with `rootProject.name = "helio-script"` and `build.gradle.kts`:

```kotlin
plugins {
    kotlin("jvm") version "2.3.10"
    id("com.apollographql.apollo") version "5.2.0"
    application
}
repositories { mavenCentral() }
kotlin { jvmToolchain(21) }
dependencies {
    implementation("com.apollographql.apollo:apollo-runtime:5.2.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
}
apollo {
    service("helio") {
        packageName.set("helio.generated")
    }
}
application { mainClass.set("helio.MainKt") }
dependencyLocking { lockAllConfigurations() }

```

```sh
gradle wrapper --gradle-version 8.14.3
mkdir -p src/main/graphql src/main/kotlin/helio

```

Acquire `src/main/graphql/schema.graphqls` through the [schema workflow](references/schema-workflow.md). Create `src/main/graphql/Probe.graphql` containing `query Probe { __typename }`. Generate:

```sh
./gradlew generateApolloSources --write-locks

```

Create `src/main/kotlin/helio/Main.kt`:

```kotlin
package helio

import com.apollographql.apollo.ApolloClient
import helio.generated.ProbeQuery
import kotlinx.coroutines.runBlocking

fun main() = runBlocking {
    val endpoint = requireNotNull(System.getenv("HELIO_GRAPHQL_URL"))
    val token = requireNotNull(System.getenv("HELIO_PAT_TOKEN"))
    val client = ApolloClient.Builder()
        .serverUrl(endpoint)
        .addHttpHeader("Authorization", "Bearer $token")
        .build()
    try {
        val result = client.query(ProbeQuery()).execute()
        check(result.exception == null && result.errors.isNullOrEmpty()) { "GraphQL request failed" }
        println(requireNotNull(result.data))
    } finally {
        client.close()
    }
}

```

```sh
./gradlew classes
./gradlew run

```

Inspect operation-specific generated types when adding real fields, fragments and variables. Configure Apollo scalar mappings and runtime adapters only for verified wire contracts. Never let an unchecked default scalar representation stand in for understanding the schema. Avoid adding normalized caching or subscriptions to a one-shot script unless the task needs them. Keep plugin and runtime versions aligned and preserve Gradle dependency locks and wrapper files.

### templates/python/README.mdx

# Python template

Use uv, Ariadne Codegen and httpx, following the [docs example](https://github.com/Helio-Additive/docs/tree/main/examples/codegen/python).

```sh
uv init
uv add ariadne-codegen httpx
mkdir -p queries

```

Place validated SDL at `schema.graphqls`, named operations in `queries/`, and append to `pyproject.toml`:

```toml
[tool.ariadne-codegen]
schema_path = "schema.graphqls"
queries_path = "queries"
target_package_path = "."
target_package_name = "graphql_client"
async_client = true
convert_to_snake_case = true

```

```sh
uv run ariadne-codegen --config pyproject.toml
uv run python -m compileall -q graphql_client
uv run main.py

```

Create `main.py` importing `Client` from `graphql_client.client`. Instantiate it with the selected endpoint and a runtime PAT Bearer header, invoke the generated async method for the named operation within `asyncio.run`, and close the client using its generated context-manager API. Inspect the generated method signature, return model and client lifecycle before writing the caller. Avoid the docs example's inconsistent `client.client` import when the configured package is `graphql_client`. Configure custom scalar serializers/parsers only from verified contracts; inspect generated models for unchecked scalar fallbacks.

For a first transport check, save `queries/Probe.graphql` containing `query Probe { __typename }`, generate, and use this `main.py`:

```python
import asyncio
import os
from graphql_client.client import Client

async def main():
    async with Client(
        url=os.environ['HELIO_GRAPHQL_URL'],
        headers={'Authorization': 'Bearer ' + os.environ['HELIO_PAT_TOKEN']},
    ) as client:
        result = await client.probe()
        print(result)

asyncio.run(main())

```

`__typename` is a standard GraphQL meta-field. This probes transport, not business API correctness. Inspect generated method names when changing the operation.

### templates/ruby/README.mdx

# Ruby template

Use [graphql-client](https://github.com/github-community-projects/graphql-client), the community-maintained successor to GitHub's client. It validates static operations against a schema and builds Ruby response accessors at load time. There is no separate Ruby source-code generator, and no compile-time type guarantee. This keeps a script small without adding Rails or another wrapper library.

Use a supported Ruby and Bundler. Create `Gemfile`:

```ruby
source 'https://rubygems.org'
gem 'graphql-client'
gem 'graphql'

```

```sh
bundle install
mkdir -p queries

```

Keep the resolved `Gemfile.lock`. Acquire `schema.graphqls` through the [shared schema workflow](references/schema-workflow.md). Create `queries/Probe.graphql` containing `query Probe { __typename }` and `client.rb`:

```ruby
require 'graphql/client'
require 'graphql/client/http'

module Helio
  Schema = GraphQL::Schema.from_definition(File.read('schema.graphqls'))
  HTTP = GraphQL::Client::HTTP.new(ENV.fetch('HELIO_GRAPHQL_URL')) do
    def headers(_context)
      { 'Authorization' => "Bearer #{ENV.fetch('HELIO_PAT_TOKEN')}" }
    end
  end
  Client = GraphQL::Client.new(schema: Schema, execute: HTTP)
  Operations = Client.parse(File.read('queries/Probe.graphql'))
end

```

`Client.parse` validates and creates operation definitions locally. Validate without making an API request:

```sh
bundle exec ruby -r ./client -e 'puts "Operations validated"'

```

Create `main.rb`:

```ruby
require_relative 'client'
result = Helio::Client.query(Helio::Operations::Probe)
raise 'GraphQL request failed' unless result.errors.empty? && result.data
puts result.data.to_h

```

```sh
bundle exec ruby main.rb

```

Supply the endpoint through the environment and PAT through the host's secure mechanism. The token is read only when executing a request. Replace Probe with verified operations, regenerate definitions by reloading `client.rb`, and inspect nested response errors for partial data. Custom scalar coercion must follow the real wire contract. Do not equate generated Ruby accessors with static types. Recheck the community repository's maintenance and gem compatibility when adopting; do not use the old GitHub repository URL as the maintenance source.

### templates/rust/README.mdx

# Rust template

Use Cargo and graphql\_client's derive generation, following the [docs example](https://github.com/Helio-Additive/docs/tree/main/examples/codegen/rust).

```sh
cargo init --bin
cargo add graphql_client@0.14 reqwest@0.12 --features reqwest/json
cargo add serde --features derive
cargo add serde_json
cargo add tokio --features macros,rt-multi-thread
mkdir -p queries

```

Save validated SDL as `schema.graphqls`. Write a named operation in `queries/operation.graphql`; replace `OperationName` below with its exact GraphQL name:

```rust
use graphql_client::GraphQLQuery;
#[derive(GraphQLQuery)]
#[graphql(schema_path = "schema.graphqls", query_path = "queries/operation.graphql")]
struct OperationName;

```

The derive generates a snake\_case module with `Variables` and `ResponseData`; generation occurs during compilation:

```sh
cargo build
cargo run

```

Complete `src/main.rs` with an async Tokio entrypoint. Construct the generated variables and use `OperationName::build_query`, reqwest JSON POST and the runtime PAT Bearer header. Deserialize to `graphql_client::Response<operation_name::ResponseData>`, checking HTTP errors, GraphQL errors and absent data before using fields. Inspect the actual generated module naming. Define Rust aliases or serialization implementations for custom scalars only after establishing their wire contracts; do not invent mappings to make compilation pass.

### templates/swift/README.mdx

# Swift template

Use [Apollo iOS](https://github.com/apollographql/apollo-ios) with Swift Package Manager and its matching codegen CLI. It supplies typed operation models and an async client on Apple platforms. This recipe targets macOS with Swift 6.1 or newer and Apollo 2.5.0; it is not a Linux Swift recipe.

Create `Package.swift`:

```swift
// swift-tools-version: 6.1
import PackageDescription
let package = Package(
    name: "HelioScript",
    platforms: [.macOS(.v12)],
    dependencies: [
        .package(url: "https://github.com/apollographql/apollo-ios.git", exact: "2.5.0")
    ],
    targets: [
        .executableTarget(name: "HelioScript", dependencies: [
            .product(name: "Apollo", package: "apollo-ios")
        ])
    ]
)

```

```sh
mkdir -p Sources/HelioScript queries
swift package resolve
swift package --allow-writing-to-package-directory --allow-network-connections all apollo-cli-install

```

The install plugin creates a local `apollo-ios-cli` link. Keep `Package.resolved`; codegen and runtime must use matching versions. Acquire `schema.graphqls` through the [schema workflow](references/schema-workflow.md). Write `queries/Probe.graphql` containing `query Probe { __typename }`. Create `apollo-codegen-configuration.json`:

```json
{
  "schemaNamespace": "HelioAPI",
  "input": {
    "schemaSearchPaths": ["./schema.graphqls"],
    "operationSearchPaths": ["./queries/*.graphql"]
  },
  "output": {
    "testMocks": { "none": {} },
    "schemaTypes": {
      "path": "./Sources/HelioScript/Generated",
      "moduleType": { "embeddedInTarget": { "name": "HelioScript" } }
    },
    "operations": { "inSchemaModule": {} }
  }
}

```

No mock output or test target is configured. Generate from the local snapshot:

```sh
./apollo-ios-cli generate --path apollo-codegen-configuration.json

```

Create `Sources/HelioScript/App.swift`:

```swift
import Apollo
import Foundation

@main
struct App {
    static func main() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let endpoint = env["HELIO_GRAPHQL_URL"].flatMap(URL.init(string:)),
              let token = env["HELIO_PAT_TOKEN"] else {
            throw NSError(domain: "Supply endpoint and PAT through the host", code: 1)
        }
        let store = ApolloStore(cache: InMemoryNormalizedCache())
        let transport = RequestChainNetworkTransport(
            urlSession: URLSession(configuration: .ephemeral),
            interceptorProvider: DefaultInterceptorProvider.shared,
            store: store,
            endpointURL: endpoint,
            additionalHeaders: ["Authorization": "Bearer " + token]
        )
        let client = ApolloClient(networkTransport: transport, store: store)
        let result = try await client.fetch(query: HelioAPI.ProbeQuery(), cachePolicy: .networkOnly)
        guard result.errors?.isEmpty != false, let data = result.data else {
            throw NSError(domain: "GraphQL request failed", code: 2)
        }
        print(data)
    }
}

```

```sh
swift build
swift run HelioScript

```

Apollo 2 uses async APIs; do not copy older callback or `URLSessionClient` initializers. Inspect generated nesting and optional fields when adding real operations. Implement custom scalar `JSONDecodable`/`JSONEncodable` behavior only from verified contracts. Keep credentials runtime-only; no schema download is performed implicitly during generation.

### templates/typescript/README.mdx

# TypeScript template

Use Bun and GraphQL Code Generator, as in the [docs example](https://github.com/Helio-Additive/docs/tree/main/examples/codegen/typescript). In a new project:

```sh
bun init -y
bun add graphql @graphql-typed-document-node/core
bun add -d @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-operations @graphql-codegen/typed-document-node typescript
mkdir -p queries

```

Place the validated snapshot at `schema.graphqls` and named operations at `queries/*.graphql`. Create `codegen.ts`:

```ts
import type { CodegenConfig } from '@graphql-codegen/cli';
export default {
  schema: './schema.graphqls',
  documents: './queries/*.graphql',
  generates: {
    './generated.ts': {
      plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
      config: { strictScalars: true },
    },
  },
} satisfies CodegenConfig;

```

`strictScalars` intentionally requires verified mappings for custom scalars encountered in the schema. Add those only after reading their contracts.

```sh
bunx graphql-codegen --config codegen.ts
bunx tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2022 generated.ts
bun run main.ts

```

Create `main.ts` using the generated document and variable types for your operation. The docs use Apollo (`bun add @apollo/client`) and its `query` API. A minimal script can instead use Bun's fetch with GraphQL `print(document)`, `{ query, variables }` JSON and the securely supplied PAT header. Check HTTP status and GraphQL `errors` before accessing `data`; generated types do not validate arbitrary network JSON. Set the request endpoint from the selected environment. Never log credentials.

For an initial transport smoke check, a standard GraphQL meta-field avoids assuming any Helio business fields. Save `queries/Probe.graphql` as `query Probe { __typename }`, generate, then create `main.ts`:

```ts
import { print } from 'graphql';
import { ProbeDocument } from './generated';
const endpoint = process.env.HELIO_GRAPHQL_URL;
const token = process.env.HELIO_PAT_TOKEN;
if (!endpoint || !token) throw new Error('Supply endpoint and PAT through the host');
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ query: print(ProbeDocument), variables: {} }),
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const body = await response.json();
if (body.errors || !body.data) throw new Error('GraphQL request failed');
console.log(body.data.__typename);

```

This probes transport only; replace it with schema-grounded operations for useful work. It does not establish mutation permissions or business API behavior.
