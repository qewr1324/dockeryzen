import * as path from "path";
import * as fs from "fs-extra";
import type { ProjectAnalysis, DockerConfig } from "../../../types/interfaces.js";
import { OutputType } from "../../../types/interfaces.js";

/**
 * Dockerfile templates
 */
export class DockerfileTemplates {
	/**
	 * Get appropriate template
	 */
	public static getTemplate(analysis: ProjectAnalysis, config: DockerConfig): string {
		switch (analysis.outputType) {
			case OutputType.WAR:
				return this.getWarTemplate(analysis, config);
			case OutputType.NATIVE:
				return this.getNativeTemplate(analysis, config);
			case OutputType.JAR:
			default:
				return this.getJarTemplate(analysis, config);
		}
	}

	/**
	 * Get JAR template
	 */
	private static getJarTemplate(analysis: ProjectAnalysis, config: DockerConfig): string {
		const port = config.port || analysis.port || 8080;

		// Remove 'alpine' from jvmOptions for JVM
		const cleanJvmOptions = (config.jvmOptions || "-Xmx512m -Xms256m").replace(/\s*alpine\s*/g, " ").trim();
		const jvmOptions = cleanJvmOptions;

		const debugOptions = config.enableDebug ? `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${config.debugPort || 5005} ` : "";
		const profiles = analysis.profiles?.length ? `-Dspring.profiles.active=${analysis.profiles[0]} ` : "";

		// Check if alpine is selected
		const useAlpine = config.jvmOptions?.includes("alpine") || false;

		const baseImage = this.getBaseImage(analysis, config);
		const runtimeImage = useAlpine ? `${baseImage}-alpine` : `${baseImage}-slim`;

		return `# Multi-stage build for optimized image size
# Build stage
FROM ${baseImage} AS build

WORKDIR /app

# Copy build configuration files
COPY pom.xml .
COPY mvnw .
COPY mvnw.cmd .

# Download dependencies (cached layer)
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

# Copy source code
COPY src ./src

# Build the application
RUN ./mvnw package -DskipTests -B

# Runtime stage
FROM ${runtimeImage}

WORKDIR /app

# Create non-root user
RUN useradd -m -u 1000 appuser || useradd -m appuser

# Copy JAR file from build stage
COPY --from=build --chown=appuser:appuser /app/target/*.jar app.jar

# Create data directory
RUN mkdir -p /app/data && chown -R appuser:appuser /app/data

# Expose application port
EXPOSE ${port}

${
	config.enableDebug
		? `# Expose debug port
EXPOSE ${config.debugPort || 5005}

`
		: ""
}${
			config.enableHealthCheck
				? `# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}${config.healthCheckEndpoint || "/actuator/health"} || exit 1

`
				: ""
		}# Set environment variables
ENV JAVA_OPTS="${jvmOptions}"

# Use non-root user
USER appuser

# Mount data volume
VOLUME /app/data

# Start the application
ENTRYPOINT ["sh", "-c", "java \${JAVA_OPTS} ${debugOptions}${profiles}-jar app.jar"]

# Add metadata labels
LABEL org.opencontainers.image.title="${analysis.mainClass || "Java Application"}"
LABEL org.opencontainers.image.description="Dockerized Java application with optimized multi-stage build"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.created="${new Date().toISOString()}"
LABEL org.opencontainers.image.source="https://github.com/example/app"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="Dockeryzen"
`;
	}
	/**
	 * Get WAR template
	 */
	private static getWarTemplate(analysis: ProjectAnalysis, config: DockerConfig): string {
		const port = config.port || analysis.port || 8080;

		// Remove 'alpine' from jvmOptions for JVM
		const cleanJvmOptions = (config.jvmOptions || "-Xmx512m -Xms256m").replace(/\s*alpine\s*/g, " ").trim();
		const jvmOptions = cleanJvmOptions;

		// Check if alpine is selected - but Oracle JDK doesn't support Alpine
		const vendor = config.baseImage || analysis.jdkVendor;
		const useAlpine = (config.jvmOptions?.includes("alpine") || false) && vendor !== "oracle-jdk" && vendor !== "redhat-openjdk";

		const baseImage = this.getBaseImage(analysis, config);
		const tomcatImage = this.getTomcatImage(analysis, config, useAlpine);

		return `# Multi-stage build for WAR files
# Build stage
FROM ${baseImage} AS build

WORKDIR /app

# Copy build configuration files
COPY pom.xml .
COPY mvnw .
COPY mvnw.cmd .

# Download dependencies (cached layer)
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

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
COPY --from=build /app/target/*.war /usr/local/tomcat/webapps/ROOT.war

# Expose port
EXPOSE ${port}

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/ || exit 1

# Set environment variables
ENV CATALINA_OPTS="${jvmOptions}"
ENV JAVA_OPTS="${jvmOptions}"

# Add metadata labels
LABEL org.opencontainers.image.title="${analysis.mainClass || "Java Web Application"}"
LABEL org.opencontainers.image.description="Dockerized Java web application (WAR)"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.created="${new Date().toISOString()}"
LABEL org.opencontainers.image.vendor="Dockeryzen"
`;
	}

	/**
	 * Generate TomcatImage for War image
	 */
	private static getTomcatImage(analysis: ProjectAnalysis, config: DockerConfig, useAlpine: boolean): string {
		const jdkVersion = analysis.jdkVersion;
		const vendor = config.baseImage || analysis.jdkVendor;

		// GraalVM should not be used with Tomcat for WAR files
		const tomcatVariants: Record<string, string> = {
			"eclipse-temurin": "temurin",
			"amazon-corretto": "corretto",
			openjdk: "openjdk",
			liberica: "liberica",
			graalvm: "temurin", // Fallback to temurin for Tomcat
			"oracle-jdk": "temurin", // Fallback to temurin for Tomcat
			"redhat-openjdk": "temurin", // Fallback to temurin for Tomcat
		};

		const variant = tomcatVariants[vendor] || "temurin";

		// Oracle JDK, Red Hat, and GraalVM don't have Alpine variants for Tomcat
		const canUseAlpine = useAlpine && vendor !== "oracle-jdk" && vendor !== "redhat-openjdk" && vendor !== "graalvm";

		if (canUseAlpine) {
			return `tomcat:10.1-jdk${jdkVersion}-${variant}-alpine`;
		}

		return `tomcat:10.1-jdk${jdkVersion}-${variant}`;
	}

	/**
	 * Get native image template
	 */
	private static getNativeTemplate(analysis: ProjectAnalysis, config: DockerConfig): string {
		const port = config.port || analysis.port || 8080;

		return `# Multi-stage build for GraalVM native image
# Build stage
FROM ghcr.io/graalvm/native-image:${analysis.jdkVersion} AS build

WORKDIR /app

# Copy build configuration files
COPY pom.xml .
COPY mvnw .
COPY mvnw.cmd .

# Download dependencies
RUN chmod +x mvnw && ./mvnw dependency:go-offline -B

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

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\
  CMD wget --no-verbose --tries=1 --spider http://localhost:${port}/ || exit 1

# Use non-root user
USER appuser

# Start the application
ENTRYPOINT ["./app"]

# Add metadata labels
LABEL org.opencontainers.image.title="${analysis.mainClass || "Java Native Application"}"
LABEL org.opencontainers.image.description="Dockerized Java native application"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.created="${new Date().toISOString()}"
LABEL org.opencontainers.image.vendor="Dockeryzen"
`;
	}

	/**
	 * Get base image
	 */
	private static getBaseImage(analysis: ProjectAnalysis, config: DockerConfig): string {
		const baseImages: Record<string, string> = {
			"eclipse-temurin": "eclipse-temurin",
			"amazon-corretto": "amazoncorretto",
			openjdk: "openjdk",
			"oracle-jdk": "oraclelinux",
			graalvm: "ghcr.io/graalvm/graalvm-community",
			liberica: "bellsoft/liberica-openjdk",
			"redhat-openjdk": "registry.access.redhat.com/ubi8/openjdk",
		};

		const vendor = config.baseImage || analysis.jdkVendor;
		const baseImage = baseImages[vendor] || baseImages["eclipse-temurin"];

		// GraalVM has different image naming
		if (vendor === "graalvm") {
			return `${baseImage}:${analysis.jdkVersion}`;
		}

		return `${baseImage}:${analysis.jdkVersion}`;
	}

	/**
	 * Get runtime image
	 */
	private static getRuntimeImage(analysis: ProjectAnalysis, config: DockerConfig): string {
		const optimization = config.jvmOptions?.includes("alpine") ? "alpine" : "slim";
		const baseImage = this.getBaseImage(analysis, config);

		if (optimization === "alpine") {
			return `${baseImage}-alpine`;
		} else if (optimization === "slim") {
			return `${baseImage}-slim`;
		}

		return baseImage;
	}
}
