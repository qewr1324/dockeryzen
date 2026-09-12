import { BaseDockerfileGenerator } from "../BaseDockerfileGenerator.js";
import type { FrameworkConfig } from "./FrameworkTypes.js";

/**
 * کلاس پایه برای همه‌ی Java JAR generatorها.
 * منطق مشترک (build stage, base image, JVM opts, ...) اینجاست.
 * هر framework فقط getHealthCheck و fwConfig رو override می‌کنه.
 */
export abstract class BaseJarGenerator extends BaseDockerfileGenerator {
	protected abstract readonly fwConfig: FrameworkConfig;

	// ───────────────────────────────────────────────────────────
	// Main generate — از template استفاده می‌کنه
	// ───────────────────────────────────────────────────────────

	protected buildRuntimeStage(): {
		jarCopySource: string;
		jarCopyDestination: string;
		jarFindCommand: string;
		entrypoint: string;
	} {
		const isGradle = this.config.buildTool === "gradle";
		return {
			jarCopySource: this.fwConfig.buildOutputPath(isGradle),
			jarCopyDestination: "/tmp/jars",
			jarFindCommand: this.buildJarFindCommand(),
			entrypoint: "app.jar",
		};
	}

	generate(): string {
		const buildStage = this.buildBuildStage();
		const baseImage = this.buildBaseImage();
		const userSetup = this.buildUserSetup();
		const jvmOpts = this.buildJvmOpts();
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();

		const runtime = this.buildRuntimeStage();
		const fwName = this.constructor.name.replace("JarGenerator", "");

		const runtimePrepare = runtime.jarFindCommand
			? `COPY --from=build ${runtime.jarCopySource} /tmp/jars/

RUN ${runtime.jarFindCommand}`
			: `COPY --from=build ${runtime.jarCopySource} ${runtime.jarCopyDestination}`;

		return `# syntax=docker/dockerfile:1.4

${this.getHeader()}

# Build stage
${buildStage}

# Runtime stage
FROM ${baseImage}

WORKDIR /app
${healthCheckInstall}
${runtimePrepare}

${userSetup}

USER appuser

${ociLabels}

${this.fwConfig.profileEnv}

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

ENV JAVA_OPTS="${jvmOpts.join(" ")}"

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar ${runtime.entrypoint}"]`;
	}
	// ───────────────────────────────────────────────────────────
	// Build Stage (Maven/Gradle)
	// ───────────────────────────────────────────────────────────

	protected buildBuildStage(): string {
		const useAlpine = this.config.useAlpine;
		let version = this.config.jdkVersion || "17";
		if (version === "25") version = "21";

		if (this.config.buildTool === "gradle") {
			let gradleVersion = "8";
			if (version === "8") gradleVersion = "7";
			const image = `gradle:${gradleVersion}-jdk${version}${useAlpine ? "-alpine" : ""}`;
			const extraArgs = this.fwConfig.mavenExtraArgs?.trim() || "";
			// const gradleExtra = extraArgs ? extraArgs.replace(/-D/g, "-D") : "";
			const gradleExtra = extraArgs ? ` ${extraArgs}` : "";
			return `FROM ${image} AS build
WORKDIR /app

COPY build.gradle* settings.gradle* gradle.properties* ./
COPY gradlew* ./
COPY gradle* ./gradle/
COPY . .

RUN --mount=type=cache,target=/root/.gradle/caches \\
    if [ -f gradlew ]; then chmod +x gradlew && ./gradlew build -x test --no-daemon${gradleExtra}; else gradle build -x test --no-daemon${gradleExtra}; fi`;
		}

		// const image = version === "8" ? (useAlpine ? "maven:3.9-eclipse-temurin-8-alpine" : "maven:3.9-eclipse-temurin-8") : `maven:3.9-eclipse-temurin-${version}${useAlpine ? "-alpine" : ""}`;
		const image = useAlpine ? this.langConfig?.mavenAlpineImages?.[version] || `maven:3.9-eclipse-temurin-${version}-alpine` : this.langConfig?.mavenImages?.[version] || `maven:3.9-eclipse-temurin-${version}`;

		const mavenExtra = this.fwConfig.mavenExtraArgs || "";

		return `FROM ${image} AS build
WORKDIR /app

COPY pom.xml ./
COPY .mvn/ ./.mvn/
COPY mvnw mvnw.cmd ./

RUN --mount=type=cache,target=/root/.m2 \\
    if [ -f mvnw ]; then chmod +x mvnw && ./mvnw dependency:go-offline; else mvn dependency:go-offline; fi

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \\
    if [ -f mvnw ]; then ./mvnw package -DskipTests${mavenExtra}; else mvn package -DskipTests${mavenExtra}; fi`;
	}

	// ───────────────────────────────────────────────────────────
	// Base Image
	// ───────────────────────────────────────────────────────────

	protected buildBaseImage(): string {
		const vendor = this.config.jdkVendor || "eclipse-temurin";
		let version = this.config.jdkVersion || "17";
		if (version === "25" && vendor === "eclipse-temurin") version = "21";

		const variant = this.config.useAlpine ? "-alpine" : "";

		// ✅ FIX: openjdk deprecated شده — به eclipse-temurin fallback کن
		if (vendor === "openjdk") {
			console.warn(`[${this.constructor.name}] openjdk is deprecated. Falling back to eclipse-temurin.`);
			return `eclipse-temurin:${version}-jre${variant}`;
		}

		// amazoncorretto:8-alpine وجود نداره
		if (vendor === "amazoncorretto" && version === "8" && this.config.useAlpine) {
			console.warn(`[${this.constructor.name}] amazoncorretto:8-alpine does not exist. Using non-alpine.`);
			return `amazoncorretto:${version}`;
		}

		// اگه langConfig اطلاعات vendor داره، ازش استفاده کن
		if (this.langConfig?.jdkVendors) {
			const vc = this.langConfig.jdkVendors.find((v: any) => v.value === vendor);
			if (vc) {
				if (this.config.useAlpine && vc.jreAlpineImages?.[version]) return vc.jreAlpineImages[version];
				if (vc.jreImages?.[version]) return vc.jreImages[version];
				if (this.config.useAlpine && vc.jdkAlpineImages?.[version]) return vc.jdkAlpineImages[version];
				if (vc.jdkImages?.[version]) return vc.jdkImages[version];
			}
		}

		const map: Record<string, string> = {
			"eclipse-temurin": `eclipse-temurin:${version}-jre${variant}`,
			amazoncorretto: `amazoncorretto:${version}${variant}`,
			"azul-zulu": `azul/zulu-openjdk:${version}${variant ? "-alpine" : ""}`,
		};

		if (!map[vendor]) {
			console.warn(`[${this.constructor.name}] Unknown JDK vendor "${vendor}". Using eclipse-temurin.`);
			return map["eclipse-temurin"];
		}
		return map[vendor];
	}

	// ───────────────────────────────────────────────────────────
	// JAR Find — به صورت پیش‌فرض ساده، Quarkus override می‌کنه
	// ───────────────────────────────────────────────────────────

	protected buildJarFindCommand(): string {
		const excludes = this.fwConfig.excludePatterns.map((p) => `-not -name "${p}"`).join(" \\\n        ");

		return `JAR_FILE=$(find /tmp/jars -name "*.jar" \\
        ${excludes} | head -n 1) && \\
    if [ -z "$JAR_FILE" ]; then echo "ERROR: No JAR found!" && exit 1; fi && \\
    echo "Selected JAR: $JAR_FILE" && \\
    cp "$JAR_FILE" app.jar && \\
    rm -rf /tmp/jars`;
	}

	// ───────────────────────────────────────────────────────────
	// User Setup
	// ───────────────────────────────────────────────────────────

	protected buildUserSetup(): string {
		return this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app";
	}

	// ───────────────────────────────────────────────────────────
	// JVM Opts
	// ───────────────────────────────────────────────────────────

	protected buildJvmOpts(): string[] {
		const major = parseInt(this.config.jdkVersion || "17", 10);
		const isJava8 = major <= 8;
		const supportsMaxRamPercentage = major >= 10;

		const opts: string[] = ["-XX:+UseG1GC", "-XX:MaxGCPauseMillis=200", "-XX:+ExitOnOutOfMemoryError"];

		if (!isJava8 || this.isJava8u191OrNewer()) {
			opts.push("-XX:+UseContainerSupport");
		}

		if (supportsMaxRamPercentage) {
			opts.push("-XX:MaxRAMPercentage=75.0");
		} else {
			opts.push("-XX:MaxRAMFraction=2");
		}

		// JVM opts مخصوص framework
		if (this.fwConfig.extraJvmOpts) {
			opts.push(...this.fwConfig.extraJvmOpts);
		}

		if (this.config.enableDebug) {
			opts.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005");
		}

		return opts;
	}

	protected isJava8u191OrNewer(): boolean {
		const m = (this.config.jdkVersion || "").match(/^8u(\d+)$/);
		return m ? parseInt(m[1], 10) >= 191 : true;
	}

	// ───────────────────────────────────────────────────────────
	// اعتبارسنجی JDK — Quarkus override می‌کنه
	// ───────────────────────────────────────────────────────────

	protected validateJdk(): void {
		const major = parseInt(this.config.jdkVersion || "17", 10);

		// ✅ NEW: حداقل JDK بر اساس نسخه‌ی framework
		let minJdk = this.fwConfig.minJdk;
		if (this.config.frameworkVersion) {
			minJdk = this.getMinJdkForVersion(this.config.frameworkVersion);
		}

		if (major < minJdk) {
			throw new Error(`${this.config.framework} ${this.config.frameworkVersion || ""}.x requires JDK ${minJdk}+ ` + `(selected: JDK ${major}). Please upgrade.`);
		}
	}

	/** پیش‌فرض — sub-classها override می‌کنن */
	protected getMinJdkForVersion(version: number): number {
		return this.fwConfig.minJdk;
	}
}
