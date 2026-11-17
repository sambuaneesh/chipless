import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
}

android {
    namespace = "app.chipless"
    compileSdk = 36

    defaultConfig {
        applicationId = "io.github.sambuaneesh.chipless"
        minSdk = 26
        targetSdk = 36
        versionCode = providers.gradleProperty("chiplessVersionCode").get().toInt()
        versionName = providers.gradleProperty("chiplessVersion").get()
    }

    // Release key lives outside the repo (~/.gradle/gradle.properties). Without it, release
    // builds fall back to the debug key so anyone can build and sideload from source.
    val storeFile = providers.gradleProperty("CHIPLESS_STORE_FILE").orNull
    signingConfigs {
        if (storeFile != null) create("release") {
            this.storeFile = file(storeFile)
            storePassword = providers.gradleProperty("CHIPLESS_STORE_PASSWORD").get()
            keyAlias = providers.gradleProperty("CHIPLESS_KEY_ALIAS").get()
            keyPassword = providers.gradleProperty("CHIPLESS_KEY_PASSWORD").get()
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf("META-INF/**", "kotlin/**", "**/*.kotlin_builtins", "DebugProbesKt.bin")
    }

    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(project(":server"))
}

// ---------------------------------------------------------------- web client -> assets/web

val webDir = rootProject.layout.projectDirectory.dir("web")

val buildWeb by tasks.registering(Exec::class) {
    description = "Bundles the web client (web/dist)."
    workingDir = webDir.asFile
    commandLine("sh", "-c", "[ -d node_modules ] || npm ci --no-audit --no-fund; node build.mjs")
    inputs.dir(webDir.dir("src"))
    inputs.dir(webDir.dir("public"))
    inputs.files(webDir.file("index.html"), webDir.file("build.mjs"), webDir.file("package-lock.json"))
    outputs.dir(webDir.dir("dist"))
}

abstract class WebAssets : DefaultTask() {
    @get:InputDirectory abstract val dist: DirectoryProperty
    @get:OutputDirectory abstract val out: DirectoryProperty

    @TaskAction
    fun copy() {
        // Ship each text file once, pre-gzipped (".gzip": AGP's merger treats "x.gz" as a twin of "x").
        val target = out.get().asFile.resolve("web")
        target.deleteRecursively()
        target.mkdirs()
        val src = dist.get().asFile
        for (f in src.listFiles().orEmpty()) {
            if (f.name.endsWith(".gz")) continue
            val gz = src.resolve(f.name + ".gz")
            if (gz.exists()) gz.copyTo(target.resolve(f.name + ".gzip")) else f.copyTo(target.resolve(f.name))
        }
    }
}

val webAssets by tasks.registering(WebAssets::class) {
    dependsOn(buildWeb)
    dist.set(webDir.dir("dist"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.assets?.addGeneratedSourceDirectory(webAssets, WebAssets::out)
    }
}

// ---------------------------------------------------------------- size budget

abstract class CheckApkSize : DefaultTask() {
    @get:InputDirectory abstract val apkDir: DirectoryProperty
    @get:Input abstract val budget: Property<Long>

    @TaskAction
    fun check() {
        apkDir.get().asFile.listFiles { f -> f.extension == "apk" }.orEmpty().forEach { apk ->
            val size = apk.length()
            println("APK ${apk.name}: ${size / 1024} KB (budget ${budget.get() / 1000} KB)")
            if (size > budget.get()) throw GradleException("APK over size budget: $size bytes")
        }
    }
}

val checkApkSize by tasks.registering(CheckApkSize::class) {
    apkDir.set(layout.buildDirectory.dir("outputs/apk/release"))
    budget.set(1_000_000L)
}
tasks.matching { it.name == "assembleRelease" }.configureEach { finalizedBy(checkApkSize) }
