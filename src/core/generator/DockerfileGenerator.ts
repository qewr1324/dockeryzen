import * as vscode from "vscode";
import type { ProjectAnalysis, DockerConfig, Framework } from "../../types/interfaces.js";
import { JdkVendor, OutputType } from "../../types/interfaces.js";
import { DockerfileTemplates } from "./templates/DockerfileTemplates.js";

export class DockerfileGenerator {
	public generate(analysis: ProjectAnalysis, config: DockerConfig): string {
		if (config.baseImage && config.baseImage !== analysis.jdkVendor) {
			analysis.jdkVendor = config.baseImage as any;
		}

		switch (analysis.outputType) {
			case OutputType.WAR:
				return this.generateWarDockerfile(analysis, config);
			case OutputType.NATIVE:
				return this.generateNativeDockerfile(analysis, config);
			case OutputType.JAR:
			default:
				return this.generateJarDockerfile(analysis, config);
		}
	}

	private getBaseImage(jdkVendor: string, version: string, optimization: string): string {
		const baseImages: Record<string, string> = {
			"eclipse-temurin": "eclipse-temurin",
			"amazon-corretto": "amazoncorretto",
			openjdk: "openjdk",
			"oracle-jdk": "oraclelinux",
			graalvm: "ghcr.io/graalvm/graalvm-community",
			liberica: "bellsoft/liberica-openjdk",
			"redhat-openjdk": "registry.access.redhat.com/ubi9/openjdk",
		};

		const baseImage = baseImages[jdkVendor] || baseImages["eclipse-temurin"];

		if (jdkVendor === "oracle-jdk") {
			const supportedVersions = ["8", "11", "17", "21"];
			if (!supportedVersions.includes(version)) {
				version = "21";
			}
		}

		if (jdkVendor === "redhat-openjdk") {
			const supportedVersions = ["8", "11", "17", "21"];
			if (!supportedVersions.includes(version)) {
				version = "21";
			}
		}

		if (jdkVendor === "graalvm") {
			return `${baseImage}:${version}`;
		}

		const supportsAlpine = jdkVendor !== "oracle-jdk" && jdkVendor !== "redhat-openjdk";
		const supportsSlim = jdkVendor !== "oracle-jdk" && jdkVendor !== "redhat-openjdk" && jdkVendor !== "graalvm";

		if (optimization === "alpine" && supportsAlpine) {
			return `${baseImage}:${version}-alpine`;
		} else if (optimization === "slim" && supportsSlim) {
			return `${baseImage}:${version}-slim`;
		}

		return `${baseImage}:${version}`;
	}

	public generateJarDockerfile(analysis: ProjectAnalysis, config: DockerConfig): string {
		const useAlpine = config.useAlpine || config.jvmOptions?.includes("alpine") || false;

		const cleanJvmOptions = (config.jvmOptions || "-Xmx512m -Xms256m").replace(/\s*alpine\s*/g, " ").trim();

		const buildImage = this.getBaseImage(config.baseImage || analysis.jdkVendor, analysis.jdkVersion, "full");
		const runtimeImage = this.getBaseImage(config.baseImage || analysis.jdkVendor, analysis.jdkVersion, useAlpine ? "alpine" : "slim");

		const port = config.port || analysis.port || 8080;
		const jvmOptions = cleanJvmOptions;

		const debugPort = config.debugPort || 5005;
		const debugJvmOptions = config.enableDebug ? `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${debugPort}` : "";

		const fullJvmOptions = [jvmOptions, debugJvmOptions].filter(Boolean).join(" ");

		const entrypointArgs = ["java"];
		if (fullJvmOptions) {
			entrypointArgs.push(...fullJvmOptions.split(" ").filter((arg) => arg.length > 0));
		}
		entrypointArgs.push("-jar", "app.jar");

		const entrypointString = entrypointArgs.map((arg) => `"${arg}"`).join(", ");

		let dockerfile = `# Build stage
FROM ${buildImage} AS build

WORKDIR /app

# Copy build files
COPY pom.xml .
COPY mvnw .
COPY mvnw.cmd .

# Download dependencies
RUN ./mvnw dependency:go-offline -B

# Copy source code
COPY src ./src

# Build the application
RUN ./mvnw package -DskipTests -B

# Runtime stage
FROM ${runtimeImage}

WORKDIR /app

# Create non-root user
RUN useradd -m -u 1000 appuser || useradd -m appuser

# Copy JAR file
COPY --from=build --chown=appuser:appuser /app/target/*.jar app.jar

# Expose port
EXPOSE ${port}

${
	config.enableDebug
		? `# Expose debug port
EXPOSE ${debugPort}

`
		: ""
}${
			config.enableHealthCheck !== false
				? `# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}${config.healthCheckEndpoint || "/actuator/health"} || exit 1

`
				: ""
		}# Set environment variables
ENV JAVA_OPTS="${fullJvmOptions}"

# Run as non-root user
USER appuser

# Start the application
ENTRYPOINT [${entrypointString}]

# Add metadata
LABEL org.opencontainers.image.title="${analysis.mainClass || "Java Application"}"
LABEL org.opencontainers.image.description="Dockerized Java application"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.created="${new Date().toISOString()}"
`;

		return dockerfile;
	}

	public generateWarDockerfile(analysis: ProjectAnalysis, config: DockerConfig): string {
		const vendor = config.baseImage || analysis.jdkVendor;
		const useAlpine = config.useAlpine || config.jvmOptions?.includes("alpine") || false;

		const canUseAlpine = useAlpine && vendor !== "oracle-jdk" && vendor !== "redhat-openjdk" && vendor !== "graalvm";

		const cleanJvmOptions = (config.jvmOptions || "-Xmx512m -Xms256m").replace(/\s*alpine\s*/g, " ").trim();

		const buildImage = this.getBaseImage(vendor, analysis.jdkVersion, canUseAlpine ? "alpine" : "full");
		const port = config.port || analysis.port || 8080;
		const jvmOptions = cleanJvmOptions;

		const debugPort = config.debugPort || 5005;
		const debugJvmOptions = config.enableDebug ? `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${debugPort}` : "";

		const fullJvmOptions = [jvmOptions, debugJvmOptions].filter(Boolean).join(" ");

		const tomcatImage = this.getTomcatImage(analysis, config, canUseAlpine);

		let dockerfile = `# Build stage
FROM ${buildImage} AS build

WORKDIR /app

# Copy build files
COPY pom.xml .
COPY mvnw .
COPY mvnw.cmd .

# Download dependencies
RUN ./mvnw dependency:go-offline -B

# Copy source code
COPY src ./src

# Build the application
RUN ./mvnw package -DskipTests -B

# Runtime stage - Using Tomcat
FROM ${tomcatImage}

WORKDIR /usr/local/tomcat/webapps

# Remove default applications
RUN rm -rf /usr/local/tomcat/webapps/*

# Copy WAR file
COPY --from=build /app/target/*.war ROOT.war

# Expose port
EXPOSE ${port}

${
	config.enableDebug
		? `# Expose debug port
EXPOSE ${debugPort}

`
		: ""
}${
			config.enableHealthCheck !== false
				? `# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/ || exit 1

`
				: ""
		}# Set environment variables
ENV CATALINA_OPTS="${fullJvmOptions}"
ENV JAVA_OPTS="${fullJvmOptions}"

# Add metadata
LABEL org.opencontainers.image.title="${analysis.mainClass || "Java Web Application"}"
LABEL org.opencontainers.image.description="Dockerized Java web application"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.created="${new Date().toISOString()}"
`;

		return dockerfile;
	}

	private getTomcatImage(analysis: ProjectAnalysis, config: DockerConfig, useAlpine: boolean): string {
		let jdkVersion = analysis.jdkVersion;
		const vendor = config.baseImage || analysis.jdkVendor;

		const tomcatVariants: Record<string, string> = {
			"eclipse-temurin": "temurin",
			"amazon-corretto": "corretto",
			openjdk: "openjdk",
			liberica: "liberica",
			graalvm: "temurin",
			"oracle-jdk": "oracle",
			"redhat-openjdk": "ubi9",
		};

		const variant = tomcatVariants[vendor] || "temurin";

		if (vendor === "oracle-jdk" || vendor === "redhat-openjdk") {
			const supportedVersions = ["8", "11", "17", "21"];
			if (!supportedVersions.includes(jdkVersion)) {
				jdkVersion = "21";
			}
		}

		const canUseAlpine = useAlpine && vendor !== "oracle-jdk" && vendor !== "redhat-openjdk" && vendor !== "graalvm";

		if (canUseAlpine) {
			return `tomcat:10.1-jdk${jdkVersion}-${variant}-alpine`;
		}

		return `tomcat:10.1-jdk${jdkVersion}-${variant}`;
	}

	public generateNativeDockerfile(analysis: ProjectAnalysis, config: DockerConfig): string {
		const port = config.port || analysis.port || 8080;

		let dockerfile = `# Build stage - GraalVM Native Image
FROM ghcr.io/graalvm/native-image:${analysis.jdkVersion} AS build

WORKDIR /app

# Copy build files
COPY pom.xml .
COPY mvnw .
COPY mvnw.cmd .

# Download dependencies
RUN ./mvnw dependency:go-offline -B

# Copy source code
COPY src ./src

# Build native image
RUN ./mvnw package -Pnative -DskipTests -B

# Runtime stage - Minimal image
FROM alpine:latest

WORKDIR /app

# Install required libraries
RUN apk add --no-cache libstdc++

# Create non-root user
RUN adduser -D -u 1000 appuser

# Copy native binary
COPY --from=build --chown=appuser:appuser /app/target/*-runner app

# Expose port
EXPOSE ${port}

${
	config.enableHealthCheck !== false
		? `# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/ || exit 1

`
		: ""
}# Run as non-root user
USER appuser

# Start the application
ENTRYPOINT ["./app"]

# Add metadata
LABEL org.opencontainers.image.title="${analysis.mainClass || "Java Native Application"}"
LABEL org.opencontainers.image.description="Dockerized Java native application"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.created="${new Date().toISOString()}"
`;

		return dockerfile;
	}
}
