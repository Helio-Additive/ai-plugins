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

Keep the resolved `Gemfile.lock`. Acquire `schema.graphqls` through the [shared schema workflow](../../references/schema-workflow.md). Create `queries/Probe.graphql` containing `query Probe { __typename }` and `client.rb`:

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
