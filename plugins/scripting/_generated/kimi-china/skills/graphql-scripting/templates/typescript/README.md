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
