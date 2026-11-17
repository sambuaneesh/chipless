import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    kotlin("jvm")
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(project(":engine"))
    testImplementation(kotlin("test"))
    testImplementation(platform("org.junit:junit-bom:5.13.4"))
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
    testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}

tasks.register<JavaExec>("dev") {
    group = "application"
    description = "Run the table server on this computer, serving web/dist."
    classpath = sourceSets["main"].runtimeClasspath
    mainClass.set("app.chipless.server.DevMainKt")
    args(rootProject.file("web/dist").path, layout.buildDirectory.file("dev-session.json").get().asFile.path)
}
