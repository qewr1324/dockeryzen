import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class JavaJarDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const baseImage = this.getJavaBaseImage();
		const buildStage = this.getJavaBuildStage();
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();

		let profileEnv = "";
		if (this.config.framework === "quarkus") {
			profileEnv = `ENV QUARKUS_PROFILE=prod`;
		} else if (this.config.framework === "micronaut") {
			profileEnv = `ENV MICRONAUT_ENVIRONMENTS=prod`;
		} else {
			profileEnv = `ENV SPRING_PROFILES_ACTIVE=production`;
		}

		const jvmOpts = ["-XX:+UseG1GC", "-XX:MaxGCPauseMillis=200", "-XX:+ExitOnOutOfMemoryError", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0"];
		if (this.config.enableDebug) {
			jvmOpts.push("-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005");
		}

		const userSetup = this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app && chmod -R 755 /app";

		const isGradle = this.config.buildTool === "gradle";
		const jarFindPath = isGradle ? "/app/build/libs" : "/app/target";

		return `# syntax=docker/dockerfile:1.4

# Build stage
${buildStage}

# Runtime stage
FROM ${baseImage}

WORKDIR /app
${healthCheckInstall}
COPY --from=build ${jarFindPath} /tmp/jars/
RUN JAR_FILE=$(find /tmp/jars -name "*.jar" \\
        -not -name "*-sources.jar" \\
        -not -name "*-javadoc.jar" \\
        -not -name "*-plain.jar" \\
        -not -name "original-*.jar" \\
        -not -name "*.jar.original" | head -n 1) && \\
    if [ -z "$JAR_FILE" ]; then \\
        JAR_FILE=$(find /tmp/jars -name "*.jar" \\
            -not -name "*-sources.jar" \\
            -not -name "*-javadoc.jar" \\
            -not -name "original-*.jar" \\
            -not -name "*.jar.original" | head -n 1); \\
    fi && \\
    if [ -z "$JAR_FILE" ]; then echo "No JAR file found!" && exit 1; fi && \\
    cp "$JAR_FILE" app.jar && \\
    rm -rf /tmp/jars

${userSetup}

USER appuser

${ociLabels}

${profileEnv}

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

ENV JAVA_OPTS="${jvmOpts.join(" ")}"

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]`;
	}

	// ⬇️ عیناً کپی از DockerfileGenerator اصلی
	private getJavaBuildStage(): string {
		let version = this.config.jdkVersion || "17";
		if (version === "25" && this.config.buildTool === "gradle") version = "21";
		if (version === "25" && this.config.buildTool === "maven") version = "21";
		const useAlpine = this.config.useAlpine;

		if (this.config.buildTool === "gradle") {
			let gradleVersion = "8";
			if (version === "8") gradleVersion = "7";
			if (version === "11" || version === "17") gradleVersion = "8";
			if (version === "21") gradleVersion = "8";

			const image = `gradle:${gradleVersion}-jdk${version}${useAlpine ? "-alpine" : ""}`;
			return `FROM ${image} AS build
WORKDIR /app

COPY build.gradle* settings.gradle* gradle.properties* ./
COPY gradlew* ./
COPY gradle* ./gradle/
COPY . .

RUN --mount=type=cache,target=/root/.gradle/caches \\
    if [ -f gradlew ]; then chmod +x gradlew && ./gradlew build -x test --no-daemon; else gradle build -x test --no-daemon; fi`;
		} else {
			let image: string;
			if (version === "8") {
				image = "maven:3.9-eclipse-temurin-8";
			} else {
				image = `maven:3.9-eclipse-temurin-${version}${useAlpine ? "-alpine" : ""}`;
			}
			return `FROM ${image} AS build
WORKDIR /app

COPY pom.xml ./
COPY .mvn/ ./.mvn/
COPY mvnw mvnw.cmd ./

RUN --mount=type=cache,target=/root/.m2 \\
    if [ -f mvnw ]; then chmod +x mvnw && ./mvnw dependency:go-offline; else mvn dependency:go-offline; fi

COPY src ./src
RUN --mount=type=cache,target=/root/.m2 \\
    if [ -f mvnw ]; then ./mvnw package -DskipTests; else mvn package -DskipTests; fi`;
		}
	}

	// ⬇️ عیناً کپی از DockerfileGenerator اصلی
	private getJavaBaseImage(): string {
		const vendor = this.config.jdkVendor || "eclipse-temurin";
		let version = this.config.jdkVersion || "17";
		if (version === "25" && vendor === "eclipse-temurin") {
			version = "21";
		}

		if (this.langConfig?.jdkVendors) {
			const vendorConfig = this.langConfig.jdkVendors.find((v: any) => v.value === vendor);
			if (vendorConfig) {
				if (this.config.useAlpine && vendorConfig.jreAlpineImages?.[version]) {
					return vendorConfig.jreAlpineImages[version];
				}
				if (vendorConfig.jreImages?.[version]) {
					return vendorConfig.jreImages[version];
				}
				if (this.config.useAlpine && vendorConfig.jdkAlpineImages?.[version]) {
					return vendorConfig.jdkAlpineImages[version];
				}
				if (vendorConfig.jdkImages?.[version]) {
					return vendorConfig.jdkImages[version];
				}
			}
		}

		const variant = this.config.useAlpine ? "-alpine" : "";
		const imageMap: Record<string, string> = {
			"eclipse-temurin": `eclipse-temurin:${version}-jre${variant}`,
			amazoncorretto: `amazoncorretto:${version}${variant}`,
			openjdk: `openjdk:${version}${variant ? "-alpine" : "-slim"}`,
			"azul-zulu": `azul/zulu-openjdk:${version}${variant ? "-alpine" : ""}`,
		};
		return imageMap[vendor] || imageMap["eclipse-temurin"];
	}
}
