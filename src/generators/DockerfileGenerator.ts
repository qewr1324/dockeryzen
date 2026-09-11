import { ProjectConfig } from "../types/index.js";

export class DockerfileGenerator {
	constructor(
		private config: ProjectConfig,
		private langConfig?: any,
	) {}

	generate(): string {
		switch (this.config.language) {
			case "java-jar":
				return this.generateJavaJarDockerfile();
			case "java-war":
				return this.generateJavaWarDockerfile();
			case "js-frontend":
				return this.generateJSFrontendDockerfile();
			case "js-backend":
				return this.generateJSBackendDockerfile();
			case "python":
				return this.generatePythonDockerfile();
			case "go":
				return this.generateGoDockerfile();
			case "rust":
				return this.generateRustDockerfile();
			case "dotnet":
				return this.generateDotNetDockerfile();
			case "laravel":
				return this.generateLaravelDockerfile();
			case "rails":
				return this.generateRailsDockerfile();
			case "cpp":
				return this.generateCppDockerfile();
			case "c":
				return this.generateCDockerfile();
			default:
				return this.generateGenericDockerfile();
		}
	}

	private getDebugPort(): string {
		if (this.config.debugPort) return this.config.debugPort.toString();
		const lang = this.config.language;
		if (lang.startsWith("java")) return "5005";
		if (lang.startsWith("js")) return "9229";
		if (lang === "python") return "5678";
		if (lang === "dotnet") return "5000";
		if (lang === "go") return "2345";
		if (lang === "laravel") return "9003";
		if (lang === "rails") return "1234";
		if (lang === "cpp" || lang === "c") return "1234";
		return "";
	}

	private getDebugExpose(): string {
		if (!this.config.enableDebug) return "";
		const lang = this.config.language;
		if (lang === "rust") {
			return "";
		}
		if (lang === "go") {
			return `\n# Debug port (delve)\nEXPOSE 2345`;
		}
		if (lang === "cpp" || lang === "c") {
			return `\n# Debug port (gdbserver)\nEXPOSE 1234`;
		}
		const debugPort = this.getDebugPort();
		if (!debugPort) return "";
		return `\n# Debug port (only exposed, not published)\nEXPOSE ${debugPort}`;
	}

	private getHealthCheck(): string {
		if (!this.config.enableHealthCheck) return "";
		const healthPath = this.config.healthCheckPath || "/health";
		const port = this.config.port;
		const lang = this.config.language;
		const framework = this.config.framework;

		if (lang === "java-jar") {
			const checkPath = this.config.healthCheckPath || "/actuator/health";
			const primaryCheck = `curl -f http://localhost:${port}${checkPath}`;
			const fallbackCheck = `curl -f http://localhost:${port}/ || exit 1`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \\\n  CMD ${primaryCheck} || ${fallbackCheck}`;
		}

		if (lang === "java-war") {
			const checkPath = this.config.healthCheckPath || "/";
			const primaryCheck = `curl -f http://localhost:${port}${checkPath}`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \\\n  CMD ${primaryCheck} || exit 1`;
		}

		if (lang === "dotnet") {
			const primaryCheck = `curl -f http://localhost:${port}${healthPath}`;
			const fallbackCheck = `curl -f http://localhost:${port}/ || exit 1`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \\\n  CMD ${primaryCheck} || ${fallbackCheck}`;
		}

		if (lang === "python") {
			const primaryCheck = `curl -f http://localhost:${port}${healthPath}`;
			const fallbackCheck = `curl -f http://localhost:${port}/`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD ${primaryCheck} || ${fallbackCheck} || exit 1`;
		}

		if (lang === "js-frontend" && framework === "angular") {
			return `\n# Health check (SPA serves index.html at root)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\\n  CMD wget -q --spider http://localhost:${port}/ || exit 1`;
		}

		if (lang === "js-frontend" || lang === "js-backend") {
			const primaryCheck = `wget -q --spider http://localhost:${port}${healthPath}`;
			const fallbackCheck = `wget -q --spider http://localhost:${port}/`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=5 \\\n  CMD ${primaryCheck} || ${fallbackCheck} || exit 1`;
		}

		if (lang === "rails") {
			const primaryCheck = `curl -f http://localhost:${port}${healthPath}`;
			const fallbackCheck = `curl -f http://localhost:${port}/up`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=90s --retries=5 \\\n  CMD ${primaryCheck} || ${fallbackCheck} || curl -f http://localhost:${port}/ || exit 1`;
		}

		if (lang === "laravel") {
			return `\n# Health check (FPM listens on internal port 9000)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \\\n  CMD php -r "exit(@fsockopen('127.0.0.1', 9000) ? 0 : 1);" || exit 1`;
		}

		if (lang === "go") {
			const primaryCheck = `curl -f http://localhost:${port}${healthPath}`;
			const fallbackCheck = `curl -f http://localhost:${port}/`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\\n  CMD ${primaryCheck} || ${fallbackCheck} || exit 1`;
		}

		if (lang === "rust") {
			if (this.config.useAlpine) {
				return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD wget -q --spider http://localhost:${port}${healthPath} || exit 1`;
			}
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD curl -f http://localhost:${port}${healthPath} || exit 1`;
		}

		if (lang === "cpp" || lang === "c") {
			return `\n# Health check (TCP port check for non-HTTP services)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\\n  CMD nc -z localhost ${port} || exit 1`;
		}

		if (this.config.useAlpine) {
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD wget -q --spider http://localhost:${port}${healthPath} || exit 1`;
		}

		return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD curl -f http://localhost:${port}${healthPath} || exit 1`;
	}

	private getInstallCommand(): string {
		if (this.config.useAlpine) {
			return "RUN apk add --no-cache curl ca-certificates";
		}
		return "RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*";
	}

	private getHealthCheckInstall(): string {
		if (!this.config.enableHealthCheck) return "";
		const lang = this.config.language;
		const useAlpine = this.config.useAlpine;

		if (lang === "cpp" || lang === "c") {
			if (useAlpine) {
				return `\n# Install health check tools\nRUN apk add --no-cache curl ca-certificates netcat-openbsd\n`;
			}
			return `\n# Install health check tools\nRUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates netcat-openbsd && rm -rf /var/lib/apt/lists/*\n`;
		}

		if (lang === "go") {
			if (useAlpine) {
				return `\n# Install health check tools\nRUN apk add --no-cache ca-certificates tzdata curl wget\n`;
			}
			return `\n# Install health check tools\nRUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata curl wget && rm -rf /var/lib/apt/lists/*\n`;
		}

		return `\n# Install health check tools\n${this.getInstallCommand()}\n`;
	}

	private getOciLabels(): string {
		const labels = [`org.opencontainers.image.title="${this.config.projectName}"`, `org.opencontainers.image.description="Generated by Dockeryzen"`, `org.opencontainers.image.version="1.0.0"`, `org.opencontainers.image.created="${new Date().toISOString()}"`];
		return `# OCI Labels\nLABEL ${labels.join(" \\\n      ")}`;
	}

	private generateJavaJarDockerfile(): string {
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
RUN JAR_FILE=$(find /tmp/jars -name "*.jar" -not -name "*-sources.jar" -not -name "*-javadoc.jar" -not -name "*-plain.jar" | head -n 1) && \\
    if [ -z "$JAR_FILE" ]; then \\
        JAR_FILE=$(find /tmp/jars -name "*.jar" -not -name "*-sources.jar" -not -name "*-javadoc.jar" | head -n 1); \\
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

	private generateJavaWarDockerfile(): string {
		const server = this.config.server || "tomcat";
		const serverImage = this.getServerImage(server);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();

		const isJetty = server === "jetty";
		const webappsPath = isJetty ? "/var/lib/jetty/webapps" : "/usr/local/tomcat/webapps";
		const mkdirCmd = isJetty ? `RUN mkdir -p ${webappsPath}\n` : "";
		const startCommand = isJetty ? 'CMD ["java", "-jar", "/usr/local/jetty/start.jar"]' : 'ENTRYPOINT ["catalina.sh", "run"]';

		const workDirSection = isJetty ? "WORKDIR /var/lib/jetty\n" : "WORKDIR /usr/local/tomcat\n";

		const jvmOpts = ["-Xms512m", "-Xmx1024m", "-XX:+UseG1GC", "-XX:MaxGCPauseMillis=200", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0"];

		let debugEnv = "";
		if (this.config.enableDebug) {
			const debugPort = this.getDebugPort();
			jvmOpts.push(`-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${debugPort}`);
			if (isJetty) {
				debugEnv = `\n# Debug configuration for Jetty\nENV JAVA_OPTS="${jvmOpts.join(" ")}"`;
			} else {
				debugEnv = `\n# Debug configuration for Tomcat\nENV CATALINA_OPTS="${jvmOpts.join(" ")}"`;
			}
		} else {
			if (isJetty) {
				debugEnv = `\n# JVM tuning\nENV JAVA_OPTS="${jvmOpts.join(" ")}"`;
			} else {
				debugEnv = `\n# JVM tuning\nENV CATALINA_OPTS="${jvmOpts.join(" ")}"`;
			}
		}

		const buildStageOutputPath = this.config.buildTool === "gradle" ? "/app/build/libs" : "/app/target";
		const warCopyCmd = `RUN WAR_FILE=$(find /tmp/wars -name "*.war" -not -name "*-sources.war" -not -name "*-javadoc.war" | head -n 1) && \\
    if [ -z "$WAR_FILE" ]; then echo "No WAR file found!" && exit 1; fi && \\
    cp "$WAR_FILE" ${webappsPath}/ROOT.war && \\
    rm -rf /tmp/wars`;

		return `# syntax=docker/dockerfile:1.4

# Build stage
${this.getJavaBuildStage()}

# Runtime stage
FROM ${serverImage}

${workDirSection}${healthCheckInstall}${mkdirCmd}
# Copy WAR file from build stage
COPY --from=build ${buildStageOutputPath} /tmp/wars/
${warCopyCmd}
${debugEnv}

${ociLabels}

# Expose application port
EXPOSE ${this.config.port}${debugExpose}${healthCheck}

# Start server
${startCommand}`;
	}

	private getServerImage(server: string): string {
		const version = this.config.jdkVersion || "17";
		const useAlpine = this.config.useAlpine;
		if (this.langConfig?.types) {
			const warConfig = this.langConfig.types.find((t: any) => t.type === "java-war");
			if (warConfig?.servers) {
				const serverConfig = warConfig.servers.find((s: any) => s.value === server);
				if (serverConfig) {
					if (useAlpine && serverConfig.alpineImages?.[version]) {
						return serverConfig.alpineImages[version];
					}
					if (serverConfig.images?.[version]) {
						return serverConfig.images[version];
					}
				}
			}
		}
		const variant = useAlpine ? "-alpine" : "";
		if (server === "tomcat") {
			const tomcatVersions: Record<string, string> = { "8": "8.5-jre8", "11": "9.0-jre11", "17": "10.1-jre17", "21": "10.1-jre21", "25": "10.1-jre21" };
			return `tomcat:${tomcatVersions[version] || "10.1-jre17"}${variant}`;
		} else {
			const jettyVersions: Record<string, string> = { "8": "9.4-jre8", "11": "11.0-jre11", "17": "11.0-jre17", "21": "12.0-jre21", "25": "12.0-jre21" };
			return `jetty:${jettyVersions[version] || "11.0-jre17"}${variant}`;
		}
	}

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

	private getNodeImage(version: string): string {
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === version);
			if (versionConfig?.images) {
				if (this.config.useAlpine && versionConfig.images.alpine) return versionConfig.images.alpine;
				if (versionConfig.images.standard) return versionConfig.images.standard;
			}
		}
		return `node:${version}${this.config.useAlpine ? "-alpine" : ""}`;
	}

	private getPackageInstallCommand(): string {
		const pm = this.config.packageManager || "npm";
		switch (pm) {
			case "yarn":
				return "yarn install --frozen-lockfile || yarn install";
			case "pnpm":
				return "pnpm install --frozen-lockfile || pnpm install";
			case "bun":
				return "bun install";
			case "deno":
				return "deno cache --reload";
			default:
				return "if [ -f package-lock.json ]; then npm ci; else npm install; fi";
		}
	}

	private generateJSFrontendDockerfile(): string {
		const nodeVersion = this.config.nodeVersion || "18";
		const image = this.getNodeImage(nodeVersion);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const framework = this.config.framework;
		const installCmd = this.getPackageInstallCommand();
		const port = this.config.port;

		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app";

		const lockFilesCopy = `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* bun.lockb* .npmrc* ./`;

		if (framework === "angular") {
			const projectName = this.config.projectName.replace(/[^a-zA-Z0-9-]/g, "-") || "app";
			return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${image} AS build
WORKDIR /app
${lockFilesCopy}
RUN --mount=type=cache,target=/root/.npm ${installCmd}
COPY . .
RUN npm run build -- --configuration production || npm run build

# Runtime stage (Nginx for SPA)
FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /tmp/dist
RUN if [ -d /tmp/dist/${projectName}/browser ]; then \\
        cp -r /tmp/dist/${projectName}/browser/* /usr/share/nginx/html/; \\
    elif [ -d /tmp/dist/${projectName} ]; then \\
        cp -r /tmp/dist/${projectName}/* /usr/share/nginx/html/; \\
    elif [ -d /tmp/dist/browser ]; then \\
        cp -r /tmp/dist/browser/* /usr/share/nginx/html/; \\
    else \\
        cp -r /tmp/dist/* /usr/share/nginx/html/; \\
    fi && \\
    rm -rf /tmp/dist

RUN printf 'server {\\n\\
    listen ${port};\\n\\
    server_name localhost;\\n\\
    root /usr/share/nginx/html;\\n\\
    index index.html;\\n\\
    location / {\\n\\
        try_files $uri $uri/ /index.html;\\n\\
    }\\n\\
    location ~* \\\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {\\n\\
        expires 1y;\\n\\
        add_header Cache-Control "public, immutable";\\n\\
    }\\n\\
    gzip on;\\n\\
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;\\n\\
}\\n' > /etc/nginx/conf.d/default.conf

${ociLabels}
EXPOSE ${port}

CMD ["nginx", "-g", "daemon off;"]`;
		} else if (framework === "nuxtjs") {
			return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${image} AS build
WORKDIR /app
${lockFilesCopy}
RUN --mount=type=cache,target=/root/.npm ${installCmd}
COPY . .
ENV NUXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runtime stage
FROM ${image}
WORKDIR /app
${healthCheckInstall}
ENV NODE_ENV=production \\
    PORT=${port} \\
    HOST=0.0.0.0 \\
    NUXT_TELEMETRY_DISABLED=1

COPY --from=build /app/.output ./.output
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/public ./public
COPY --from=build /app/nuxt.config.* ./
COPY --from=build /app/server ./server
COPY --from=build /app/static ./static

RUN npm cache clean --force 2>/dev/null || true
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}

CMD ["sh", "-c", "if [ -f .output/server/index.mjs ]; then exec node .output/server/index.mjs; elif [ -f .output/server/index.js ]; then exec node .output/server/index.js; else exec npm run start; fi"]`;
		} else {
			return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${image} AS build
WORKDIR /app
${lockFilesCopy}
RUN --mount=type=cache,target=/root/.npm ${installCmd}
COPY . .
RUN npm run build

# Runtime stage
FROM ${image}
WORKDIR /app
${healthCheckInstall}
ENV NODE_ENV=production \\
    PORT=${port} \\
    HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.* ./
RUN npm cache clean --force 2>/dev/null || true
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}
CMD ["node", "server.js"]`;
		}
	}

	private generateJSBackendDockerfile(): string {
		const nodeVersion = this.config.nodeVersion || "18";
		const image = this.getNodeImage(nodeVersion);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const installCmd = this.getPackageInstallCommand();
		const port = this.config.port;
		const usePm2 = this.config.enablePm2;
		const framework = this.config.framework;

		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";

		const lockFilesCopy = `COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* bun.lockb* .npmrc* tsconfig.json* tsconfig.*.json* .swcrc* .babelrc* .env.example* ./`;

		let entryCandidates: string[];
		if (framework === "nestjs") {
			entryCandidates = ["dist/main.js", "dist/main.mjs", "dist/src/main.js", "dist/index.js", "dist/server.js", "build/main.js", "main.js", "server.js"];
		} else if (framework === "fastify") {
			entryCandidates = ["dist/server.js", "dist/app.js", "dist/index.js", "dist/main.js", "build/server.js", "build/app.js", "build/index.js", "server.js", "app.js", "index.js", "main.js"];
		} else {
			entryCandidates = ["dist/index.js", "dist/main.js", "dist/server.js", "dist/app.js", "build/index.js", "build/main.js", "build/server.js", "index.js", "server.js", "main.js", "app.js"];
		}

		const firstEntry = entryCandidates[0];
		const firstCmd = usePm2 ? `if [ -f ${firstEntry} ]; then exec pm2-runtime start ${firstEntry} --name app;` : `if [ -f ${firstEntry} ]; then exec node ${firstEntry};`;

		const restEntries = entryCandidates
			.slice(1)
			.map((p) => `elif [ -f ${p} ]; then exec ${usePm2 ? `pm2-runtime start ${p} --name app` : `node ${p}`};`)
			.join(" \\\n            ");

		const entryPointCmd = `CMD ["sh", "-c", "${firstCmd} \\\n            ${restEntries} \\\n            else exec npm start; fi"]`;

		const pm2Install = usePm2 ? `\nRUN npm install -g pm2 && npm cache clean --force\nENV PM2_HOME=/home/appuser/.pm2\n` : "";

		const buildStep = `RUN if [ -f tsconfig.json ] || [ -f .swcrc ] || [ -f .babelrc ]; then \\
        if node -e "const p=require('./package.json'); process.exit(p.scripts && p.scripts.build ? 0 : 1)" 2>/dev/null; then \\
            npm run build; \\
        fi; \\
    fi`;

		return `# syntax=docker/dockerfile:1.4

FROM ${image}
WORKDIR /app

${healthCheckInstall}
${lockFilesCopy}
RUN --mount=type=cache,target=/root/.npm ${installCmd}
${pm2Install}
COPY . .
${buildStep}
RUN npm cache clean --force 2>/dev/null || true
${isAlpineUser}
USER appuser

ENV NODE_ENV=production \\
    PORT=${port}

${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}
${entryPointCmd}`;
	}

	private getPythonImage(version: string): string {
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === version);
			if (versionConfig?.images) {
				if (this.config.useAlpine && versionConfig.images.alpine) return versionConfig.images.alpine;
				if (versionConfig.images.slim) return versionConfig.images.slim;
				if (versionConfig.images.standard) return versionConfig.images.standard;
			}
		}
		return `python:${version}${this.config.useAlpine ? "-alpine" : "-slim"}`;
	}

	private generatePythonDockerfile(): string {
		const pythonVersion = this.config.pythonVersion || "3.11";
		const image = this.getPythonImage(pythonVersion);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const framework = this.config.framework;
		const useVirtualEnv = this.config.useVirtualEnv;
		const useGunicorn = this.config.enableGunicorn;
		const port = this.config.port;

		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app";

		const buildDeps = this.config.useAlpine ? "RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev zlib-dev jpeg-dev freetype-dev lcms2-dev" : "RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev default-libmysqlclient-dev libjpeg-dev && rm -rf /var/lib/apt/lists/*";

		const runtimeDeps = this.config.useAlpine ? "RUN apk add --no-cache libffi openssl zlib jpeg freetype lcms2" : "RUN apt-get update && apt-get install -y --no-install-recommends libpq5 default-libmysqlclient-dev libjpeg62-turbo && rm -rf /var/lib/apt/lists/*";

		let extraPackages = "";
		if (useGunicorn || framework === "django" || framework === "flask") {
			extraPackages = "gunicorn";
		}
		if (framework === "fastapi") {
			extraPackages = extraPackages ? `${extraPackages} "uvicorn[standard]"` : '"uvicorn[standard]" gunicorn';
		}

		const projectModule = this.config.projectName.replace(/[^a-zA-Z0-9_]/g, "_") || "app";

		let startCmd = 'CMD ["python", "app.py"]';
		if (framework === "django") {
			const wsgiModule = projectModule || "config";
			if (useGunicorn) {
				startCmd = `CMD ["sh", "-c", "if [ -f wsgi.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 wsgi:application; elif [ -f ${wsgiModule}/wsgi.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 ${wsgiModule}.wsgi:application; else echo 'No wsgi.py found!' && exit 1; fi"]`;
			} else {
				startCmd = `CMD ["sh", "-c", "echo 'No wsgi.py found!' && exit 1"]`;
			}
		} else if (framework === "flask") {
			if (useGunicorn) {
				startCmd = `CMD ["sh", "-c", "if [ -f wsgi.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 wsgi:app; elif [ -f app.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 app:app; elif [ -f main.py ]; then exec gunicorn --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --timeout 120 main:app; else exec flask run --host=0.0.0.0 --port=${port}; fi"]`;
			} else {
				startCmd = `CMD ["flask", "run", "--host=0.0.0.0", "--port=${port}"]`;
			}
		} else if (framework === "fastapi") {
			if (useGunicorn) {
				startCmd = `CMD ["sh", "-c", "if [ -f main.py ]; then exec gunicorn main:app --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --worker-class uvicorn.workers.UvicornWorker --timeout 120; elif [ -f app.py ]; then exec gunicorn app:app --bind 0.0.0.0:${port} --workers ${"$"}{WORKERS} --worker-class uvicorn.workers.UvicornWorker --timeout 120; else exec uvicorn main:app --host 0.0.0.0 --port ${port} --workers ${"$"}{WORKERS}; fi"]`;
			} else {
				startCmd = `CMD ["sh", "-c", "if [ -f main.py ]; then exec uvicorn main:app --host 0.0.0.0 --port ${port} --workers ${"$"}{WORKERS} --loop uvloop --http httptools; elif [ -f app.py ]; then exec uvicorn app:app --host 0.0.0.0 --port ${port} --workers ${"$"}{WORKERS} --loop uvloop --http httptools; else exec uvicorn main:app --host 0.0.0.0 --port ${port} --workers ${"$"}{WORKERS}; fi"]`;
			}
		}

		return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${image} AS build
WORKDIR /app
${buildDeps}
COPY requirements.txt* pyproject.toml* setup.py* ./
RUN --mount=type=cache,target=/root/.cache/pip \\
    if [ -f requirements.txt ]; then \\
        pip install --no-cache-dir --prefix=/install -r requirements.txt; \\
    elif [ -f pyproject.toml ]; then \\
        pip install --no-cache-dir --prefix=/install .; \\
    elif [ -f setup.py ]; then \\
        pip install --no-cache-dir --prefix=/install .; \\
    fi
${extraPackages ? `RUN pip install --no-cache-dir --prefix=/install ${extraPackages}` : ""}

# Runtime stage
FROM ${image}
WORKDIR /app
${healthCheckInstall}
${runtimeDeps}
COPY --from=build /install /usr/local
COPY . .
RUN find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
${isAlpineUser}
USER appuser
ENV PYTHONUNBUFFERED=1 \\
    PYTHONDONTWRITEBYTECODE=1 \\
    PORT=${port} \\
    WORKERS=4
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}
${startCmd}`;
	}

	private generateGoDockerfile(): string {
		const goVersion = this.config.goVersion || "1.21";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const cgoEnabled = this.config.cgoEnabled !== false;

		let buildImage = `golang:${goVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === goVersion);
			if (versionConfig) {
				buildImage = this.config.useAlpine ? versionConfig.alpineImage || versionConfig.image : versionConfig.image;
			}
		}

		const runtimeBase = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";
		const cgoFlag = cgoEnabled ? "1" : "0";
		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";

		const cgoPackages = this.config.useAlpine && cgoEnabled ? "RUN apk add --no-cache gcc musl-dev" : "";
		const cgoPackagesDebian = !this.config.useAlpine && cgoEnabled ? "RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev && rm -rf /var/lib/apt/lists/*" : "";
		const buildPackages = cgoPackages || cgoPackagesDebian;

		let runtimePackages = "";
		if (this.config.useAlpine) {
			const pkgs = ["ca-certificates", "tzdata", "curl", "wget"];
			if (cgoEnabled) pkgs.push("libc6-compat");
			runtimePackages = `RUN apk --no-cache add ${pkgs.join(" ")}`;
		} else {
			runtimePackages = "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata curl wget && rm -rf /var/lib/apt/lists/*";
		}

		const ldflags = "-s -w -X main.version=1.0.0";

		const modDownload = `RUN --mount=type=cache,target=/go/pkg/mod \\
    if [ -f go.sum ]; then \\
        go mod download; \\
    else \\
        go mod download 2>/dev/null || go mod tidy; \\
    fi`;

		return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${buildImage} AS build
WORKDIR /app
${buildPackages}
COPY go.mod go.sum* ./
${modDownload}
COPY . .
RUN CGO_ENABLED=${cgoFlag} GOOS=linux GOARCH=$(go env GOARCH) \\
    go build -a -ldflags="${ldflags}" -o main . 2>/dev/null || \\
    CGO_ENABLED=${cgoFlag} GOOS=linux go build -a -o main .

# Runtime stage
FROM ${runtimeBase}
WORKDIR /app
${runtimePackages}
${healthCheckInstall}
COPY --from=build /app/main .
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${this.config.port}${debugExpose}${healthCheck}
CMD ["./main"]`;
	}

	private generateRustDockerfile(): string {
		const rustVersion = this.config.rustVersion || "latest";
		let buildImage = `rust:${rustVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === rustVersion);
			if (versionConfig) {
				if (this.config.useAlpine) {
					buildImage = versionConfig.buildAlpineImage || versionConfig.buildImage;
				} else {
					buildImage = versionConfig.buildSlimImage || versionConfig.buildImage;
				}
			}
		}

		const runtimeImage = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";
		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";

		const ociLabels = this.getOciLabels();
		const healthCheckInstall = this.getHealthCheckInstall();

		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		const safeBinaryName = this.config.projectName.replace(/[^a-zA-Z0-9_-]/g, "_") || "app";

		const buildPackages = this.config.useAlpine ? "RUN apk add --no-cache musl-dev pkgconf openssl-dev openssl-libs-static" : "RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*";

		let runtimePackages = "";
		if (this.config.useAlpine) {
			runtimePackages = "RUN apk --no-cache add ca-certificates libgcc openssl";
		} else {
			runtimePackages = "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 libgcc-s1 && rm -rf /var/lib/apt/lists/*";
		}

		return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${buildImage} AS build
WORKDIR /app
${buildPackages}

COPY Cargo.toml Cargo.lock* ./
RUN mkdir -p src && \\
    if [ ! -f src/main.rs ] && [ ! -f src/lib.rs ]; then echo "fn main() {}" > src/main.rs; fi

RUN --mount=type=cache,target=/usr/local/cargo/registry \\
    --mount=type=cache,target=/app/target \\
    cargo build --release 2>/dev/null || true

COPY . .
RUN --mount=type=cache,target=/usr/local/cargo/registry \\
    --mount=type=cache,target=/app/target \\
    cargo build --release --locked 2>/dev/null || cargo build --release; \\
    BIN=$(find /app/target/release -maxdepth 1 -type f -executable -not -name "*.d" -not -name "*.rlib" -not -name "*.so" | head -n 1) && \\
    if [ -z "$BIN" ]; then echo "No binary found!" && exit 1; fi && \\
    cp "$BIN" /app/app-binary && \\
    chmod +x /app/app-binary

# Runtime stage
FROM ${runtimeImage}
WORKDIR /app
${runtimePackages}
${healthCheckInstall}
COPY --from=build /app/app-binary ./app
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${this.config.port}${debugExpose}${healthCheck}
CMD ["./app"]`;
	}

	private generateDotNetDockerfile(): string {
		const dotnetVersion = this.config.dotnetVersion || "8.0";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();

		let sdkImage = `mcr.microsoft.com/dotnet/sdk:${dotnetVersion}`;
		let aspnetImage = `mcr.microsoft.com/dotnet/aspnet:${dotnetVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === dotnetVersion);
			if (versionConfig) {
				sdkImage = versionConfig.sdkImage || sdkImage;
				aspnetImage = this.config.useAlpine ? versionConfig.aspnetAlpineImage || versionConfig.aspnetImage : versionConfig.aspnetImage;
			}
		}

		const safeProjectName = this.config.projectName.replace(/[^a-zA-Z0-9_]/g, "_");
		const userSetup = this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app";

		const port = this.config.port;

		return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${sdkImage} AS build
WORKDIR /app

COPY *.csproj ./
COPY *.sln* ./
COPY NuGet.config* nuget.config* ./

RUN --mount=type=cache,target=/root/.nuget/packages \\
    dotnet restore || true

COPY . .

RUN --mount=type=cache,target=/root/.nuget/packages \\
    dotnet publish -c Release -o out --no-restore || \\
    dotnet publish -c Release -o out

# Runtime stage
FROM ${aspnetImage}
WORKDIR /app
${healthCheckInstall}
COPY --from=build /app/out .

RUN mkdir -p /app/logs /app/tmp && \\
    chown -R 1001:0 /app/logs /app/tmp 2>/dev/null || true

${userSetup}
USER appuser

ENV ASPNETCORE_URLS=http://+:${port} \\
    ASPNETCORE_ENVIRONMENT=Production \\
    DOTNET_RUNNING_IN_CONTAINER=true \\
    DOTNET_NOLOGO=true \\
    DOTNET_CLI_TELEMETRY_OPTOUT=true

${ociLabels}

EXPOSE ${port}${debugExpose}${healthCheck}

ENTRYPOINT ["sh", "-c", "APP_DLL=$(find . -maxdepth 1 -name '*.dll' -not -name '*.resources.dll' | head -n 1) && exec dotnet \\"$APP_DLL\\""]`;
	}

	private generateLaravelDockerfile(): string {
		const phpVersion = this.config.phpVersion || "8.3";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const port = this.config.port;
		const internalPort = 9000;

		let phpImage = `php:${phpVersion}-fpm`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === phpVersion);
			if (versionConfig?.images) {
				phpImage = this.config.useAlpine ? versionConfig.images.fpmAlpine || versionConfig.images.fpm : versionConfig.images.fpm;
			}
		}

		const dbTypes = this.config.databases.map((d) => d.type);
		const needsPdoMysql = dbTypes.some((t) => ["mysql", "mariadb"].includes(t));
		const needsPdoPgsql = dbTypes.some((t) => ["postgresql", "timescaledb"].includes(t));
		const needsPdoSqlite = dbTypes.includes("sqlite");

		const phpExts: string[] = ["bcmath", "pcntl", "exif"];
		if (needsPdoMysql) phpExts.push("pdo_mysql");
		if (needsPdoPgsql) phpExts.push("pdo_pgsql");
		if (needsPdoSqlite) phpExts.push("pdo_sqlite");
		phpExts.push("gd", "mbstring", "zip", "opcache");

		const uniqueExts = [...new Set(phpExts)];

		const installCmd = this.config.useAlpine
			? `RUN apk add --no-cache git curl libpng-dev oniguruma-dev libxml2-dev zip unzip libzip-dev supervisor postgresql-dev icu-dev freetype-dev libjpeg-turbo-dev`
			: `RUN apt-get update && apt-get install -y --no-install-recommends git curl libpng-dev libonig-dev libxml2-dev zip unzip libzip-dev supervisor libpq-dev libicu-dev libfreetype6-dev libjpeg62-turbo-dev && rm -rf /var/lib/apt/lists/*`;

		const extInstall = `RUN docker-php-ext-configure gd --with-freetype --with-jpeg 2>/dev/null || true && \\
    docker-php-ext-install -j$(nproc) ${uniqueExts.join(" ")}`;

		const hasQueueWorker = this.config.enableQueueWorker;
		const supervisorConfig = hasQueueWorker
			? `
# Create supervisor config for queue worker
RUN mkdir -p /etc/supervisor/conf.d /var/log/supervisor && \\
    printf '[supervisord]\\n\\
nodaemon=true\\n\\
user=root\\n\\
logfile=/var/log/supervisor/supervisord.log\\n\\
pidfile=/var/run/supervisord.pid\\n\\
\\n\\
[program:php-fpm]\\n\\
command=php-fpm -F\\n\\
autostart=true\\n\\
autorestart=true\\n\\
priority=5\\n\\
stdout_logfile=/dev/stdout\\n\\
stdout_logfile_maxbytes=0\\n\\
stderr_logfile=/dev/stderr\\n\\
stderr_logfile_maxbytes=0\\n\\
\\n\\
[program:queue-worker]\\n\\
command=php /var/www/html/artisan queue:work --sleep=3 --tries=3 --max-time=3600\\n\\
directory=/var/www/html\\n\\
user=www-data\\n\\
autostart=true\\n\\
autorestart=true\\n\\
stopasgroup=true\\n\\
killasgroup=true\\n\\
numprocs=1\\n\\
redirect_stderr=true\\n\\
stdout_logfile=/dev/stdout\\n\\
stdout_logfile_maxbytes=0\\n\\
stderr_logfile=/dev/stderr\\n\\
stderr_logfile_maxbytes=0\\n' > /etc/supervisor/conf.d/supervisord.conf
`
			: "";

		const finalCmd = hasQueueWorker ? `CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]` : `USER www-data\nCMD ["php-fpm"]`;

		return `# syntax=docker/dockerfile:1.4

FROM ${phpImage}
WORKDIR /var/www/html

${installCmd}
${extInstall}

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY composer.json composer.lock* ./

RUN --mount=type=cache,target=/root/.composer/cache \\
    if [ -f composer.json ]; then \\
        composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction; \\
    fi

COPY . .

RUN if [ -f composer.json ]; then \\
        composer dump-autoload --optimize --no-dev --classmap-authoritative --no-interaction; \\
    fi && \\
    if [ -f artisan ]; then \\
        php artisan package:discover --ansi 2>/dev/null || true; \\
    fi

RUN mkdir -p /var/www/html/storage/framework/views \\
    /var/www/html/storage/framework/cache \\
    /var/www/html/storage/framework/sessions \\
    /var/www/html/storage/logs \\
    /var/www/html/bootstrap/cache && \\
    chown -R www-data:www-data /var/www/html && \\
    chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache
${supervisorConfig}
${ociLabels}
EXPOSE ${internalPort}${debugExpose}${healthCheck}
${finalCmd}`;
	}

	private generateRailsDockerfile(): string {
		const rubyVersion = this.config.rubyVersion || "3.3";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const port = this.config.port;

		let rubyImage = `ruby:${rubyVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === rubyVersion);
			if (versionConfig?.images) {
				if (this.config.useAlpine && versionConfig.images.alpine) rubyImage = versionConfig.images.alpine;
				else if (versionConfig.images.slim) rubyImage = versionConfig.images.slim;
				else rubyImage = versionConfig.images.standard;
			}
		}

		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";

		const sidekiqInstall = this.config.enableSidekiq ? `\nRUN gem install sidekiq --no-document\n` : "";

		const buildDeps = this.config.useAlpine
			? "RUN apk add --no-cache build-base postgresql-dev mysql-dev nodejs npm tzdata git yaml-dev"
			: "RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev default-libmysqlclient-dev nodejs npm tzdata git && rm -rf /var/lib/apt/lists/*";

		const runtimeDeps = this.config.useAlpine ? "RUN apk add --no-cache libpq mysql-client tzdata" : "RUN apt-get update && apt-get install -y --no-install-recommends libpq5 default-libmysqlclient-dev tzdata && rm -rf /var/lib/apt/lists/*";

		const bundleConfig = `RUN bundle config set --local path 'vendor/bundle' && \\
    bundle config set --local without 'development test' && \\
    bundle config set --local deployment 'true'`;

		const bundleInstall = `RUN --mount=type=cache,target=/usr/local/bundle/cache \\
    bundle install --jobs 4 --retry 3`;

		return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${rubyImage} AS build
WORKDIR /app
${buildDeps}
COPY Gemfile Gemfile.lock* ./
${bundleConfig}
${bundleInstall}
COPY . .
RUN if [ -f Rakefile ] || [ -f config/application.rb ]; then \\
        RAILS_ENV=production bundle exec rake assets:precompile 2>&1 || \\
        (echo "Asset precompile skipped" && true); \\
    fi
RUN rm -rf tmp/cache tmp/pids log/*.log 2>/dev/null || true

# Runtime stage
FROM ${rubyImage}
WORKDIR /app
${healthCheckInstall}
${runtimeDeps}
COPY --from=build /app /app
RUN gem install bundler --no-document && \\
    bundle config set --local path 'vendor/bundle' && \\
    bundle config set --local without 'development test' && \\
    bundle config set --local deployment 'true'
${sidekiqInstall}
RUN mkdir -p /app/tmp /app/log /app/storage && \\
    chown -R 1001:0 /app/tmp /app/log /app/storage 2>/dev/null || true
${isAlpineUser}
USER appuser
ENV RAILS_ENV=production \\
    RAILS_SERVE_STATIC_FILES=true \\
    RAILS_LOG_TO_STDOUT=true \\
    PORT=${port} \\
    BUNDLE_PATH=/app/vendor/bundle
${ociLabels}
EXPOSE ${port}${debugExpose}${healthCheck}
CMD ["sh", "-c", "if [ -f bin/rails ]; then bundle exec rails db:prepare 2>/dev/null || bundle exec rails db:migrate 2>/dev/null || true; fi; exec bundle exec puma -b tcp://0.0.0.0:${port} -e production"]`;
	}

	private generateCppDockerfile(): string {
		const gccVersion = this.config.gccVersion || "13";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();

		let gccImage = `gcc:${gccVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === gccVersion);
			if (versionConfig) {
				if (this.config.useAlpine && versionConfig.alpineImage) gccImage = versionConfig.alpineImage;
				else gccImage = versionConfig.image;
			}
		}

		const runtimeImage = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";
		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";

		const buildPackages = this.config.useAlpine ? "RUN apk add --no-cache cmake make g++ musl-dev" : "RUN apt-get update && apt-get install -y --no-install-recommends cmake make g++ && rm -rf /var/lib/apt/lists/*";

		const runtimePackages = this.config.useAlpine ? "RUN apk --no-cache add libstdc++ libgcc" : "RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*";

		const buildStep = `RUN set -eux; \\
    if [ -f CMakeLists.txt ]; then \\
        cmake -B build -DCMAKE_BUILD_TYPE=Release; \\
        cmake --build build -j"$(nproc)"; \\
    elif [ -f Makefile ] || [ -f makefile ]; then \\
        make -j"$(nproc)"; \\
    elif [ -f main.cpp ]; then \\
        g++ -O2 -std=c++17 -o app main.cpp; \\
    elif [ -f src/main.cpp ]; then \\
        g++ -O2 -std=c++17 -o app src/main.cpp; \\
    else \\
        echo "No CMakeLists.txt, Makefile, or main.cpp found!" && exit 1; \\
    fi; \\
    BIN=$(find /app /app/build /app/bin /app/src -maxdepth 3 -type f -executable \\
        -not -name "*.so" -not -name "*.o" -not -name "*.a" \\
        -not -name "*.cmake" -not -name "Makefile" \\
        -not -path "*/CMakeFiles/*" -not -path "*/.git/*" 2>/dev/null | head -n 1); \\
    if [ -z "$BIN" ]; then echo "No executable produced!" && exit 1; fi; \\
    cp "$BIN" /app/app-binary; \\
    chmod +x /app/app-binary`;

		return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${gccImage} AS build
WORKDIR /app
${buildPackages}
COPY . .
${buildStep}

# Runtime stage
FROM ${runtimeImage}
WORKDIR /app
${runtimePackages}
${healthCheckInstall}
COPY --from=build /app/app-binary ./app
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${this.config.port}${debugExpose}${healthCheck}
CMD ["./app"]`;
	}

	private generateCDockerfile(): string {
		const gccVersion = this.config.gccVersion || "13";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();

		let gccImage = `gcc:${gccVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === gccVersion);
			if (versionConfig) {
				if (this.config.useAlpine && versionConfig.alpineImage) gccImage = versionConfig.alpineImage;
				else gccImage = versionConfig.image;
			}
		}

		const runtimeImage = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";
		const isAlpineUser = this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root -m -d /home/appuser appuser && chown -R appuser:root /app";

		const buildPackages = this.config.useAlpine ? "RUN apk add --no-cache cmake make gcc musl-dev" : "RUN apt-get update && apt-get install -y --no-install-recommends cmake make gcc libc6-dev && rm -rf /var/lib/apt/lists/*";

		const runtimePackages = this.config.useAlpine ? "RUN apk --no-cache add libgcc" : "RUN apt-get update && apt-get install -y --no-install-recommends libc6 && rm -rf /var/lib/apt/lists/*";

		const buildStep = `RUN set -eux; \\
    if [ -f CMakeLists.txt ]; then \\
        cmake -B build -DCMAKE_BUILD_TYPE=Release; \\
        cmake --build build -j"$(nproc)"; \\
    elif [ -f Makefile ] || [ -f makefile ]; then \\
        make -j"$(nproc)"; \\
    elif [ -f main.c ]; then \\
        gcc -O2 -std=c11 -o app main.c; \\
    elif [ -f src/main.c ]; then \\
        gcc -O2 -std=c11 -o app src/main.c; \\
    else \\
        echo "No CMakeLists.txt, Makefile, or main.c found!" && exit 1; \\
    fi; \\
    BIN=$(find /app /app/build /app/bin /app/src -maxdepth 3 -type f -executable \\
        -not -name "*.so" -not -name "*.o" -not -name "*.a" \\
        -not -name "*.cmake" -not -name "Makefile" \\
        -not -path "*/CMakeFiles/*" -not -path "*/.git/*" 2>/dev/null | head -n 1); \\
    if [ -z "$BIN" ]; then echo "No executable produced!" && exit 1; fi; \\
    cp "$BIN" /app/app-binary; \\
    chmod +x /app/app-binary`;

		return `# syntax=docker/dockerfile:1.4

# Build stage
FROM ${gccImage} AS build
WORKDIR /app
${buildPackages}
COPY . .
${buildStep}

# Runtime stage
FROM ${runtimeImage}
WORKDIR /app
${runtimePackages}
${healthCheckInstall}
COPY --from=build /app/app-binary ./app
${isAlpineUser}
USER appuser
${ociLabels}
EXPOSE ${this.config.port}${debugExpose}${healthCheck}
CMD ["./app"]`;
	}

	private generateGenericDockerfile(): string {
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const port = this.config.port;

		const packages = this.config.useAlpine ? "RUN apk add --no-cache build-base git curl wget" : "RUN apt-get update && apt-get install -y --no-install-recommends build-essential git curl wget && rm -rf /var/lib/apt/lists/*";

		return `# syntax=docker/dockerfile:1.4

FROM ${this.config.useAlpine ? "alpine:latest" : "ubuntu:22.04"}
WORKDIR /app
${healthCheckInstall}
${packages}
COPY . .
RUN set -eux; \\
    if [ -f Makefile ] || [ -f makefile ]; then make; \\
    elif [ -f CMakeLists.txt ]; then cmake -B build && cmake --build build; \\
    elif [ -f package.json ]; then npm install && (npm run build 2>/dev/null || true); \\
    elif [ -f requirements.txt ]; then pip install -r requirements.txt 2>/dev/null || true; \\
    else echo "No build system detected, skipping build step"; \\
    fi
${ociLabels}
EXPOSE ${port}${healthCheck}
CMD ["sh", "-c", "echo 'Please configure your application startup command'"]`;
	}
}
