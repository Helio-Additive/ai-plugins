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

Acquire `src/main/graphql/schema.graphqls` through the [schema workflow](../../references/schema-workflow.md). Create `src/main/graphql/Probe.graphql` containing `query Probe { __typename }`. Generate:

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
