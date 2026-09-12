import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class JavaWarDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
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

	// ⬇️ عیناً کپی از DockerfileGenerator اصلی
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
				// image = "maven:3.9-eclipse-temurin-8";
				image = useAlpine ? this.langConfig?.mavenAlpineImages?.[version] || `maven:3.9-eclipse-temurin-${version}-alpine` : this.langConfig?.mavenImages?.[version] || `maven:3.9-eclipse-temurin-${version}`;
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
}
