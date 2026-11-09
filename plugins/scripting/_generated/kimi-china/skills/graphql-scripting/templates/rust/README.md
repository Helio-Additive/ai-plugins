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
