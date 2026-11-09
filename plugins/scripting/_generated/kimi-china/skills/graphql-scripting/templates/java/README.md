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

Acquire `schema/schema.graphqls` through the [schema workflow](../../references/schema-workflow.md). Generate and lock dependencies:

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
