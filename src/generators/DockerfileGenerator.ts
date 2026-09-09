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
		if (this.config.debugPort) {
			return this.config.debugPort.toString();
		}

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
		const debugPort = this.getDebugPort();
		if (!debugPort) return "";
		return `
# Debug port
EXPOSE ${debugPort}`;
	}

	private getHealthCheck(): string {
		if (!this.config.enableHealthCheck) return "";

		const healthPath = this.config.healthCheckPath || "/health";
		const port = this.config.port;
		const lang = this.config.language;

		if (lang === "python" && this.config.useAlpine) {
			return `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:${port}${healthPath}')" || exit 1`;
		}

		if (lang === "laravel") {
			return `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD php -r "echo @file_get_contents('http://localhost:9000${healthPath}') ? 'ok' : exit(1);" || exit 1`;
		}

		if (this.config.useAlpine) {
			return `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD wget -q --spider http://localhost:${port}${healthPath} || exit 1`;
		}

		return `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD curl -f http://localhost:${port}${healthPath} || exit 1`;
	}

	private getInstallCommand(): string {
		if (this.config.useAlpine) {
			return "RUN apk add --no-cache curl wget ca-certificates";
		}
		return "RUN apt-get update && apt-get install -y --no-install-recommends curl wget ca-certificates && rm -rf /var/lib/apt/lists/*";
	}

	private generateJavaJarDockerfile(): string {
		const baseImage = this.getJavaBaseImage();
		const buildStage = this.getJavaBuildStage();
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		const jarPath = this.config.buildTool === "gradle" ? "/app/build/libs/*.jar" : "/app/target/*.jar";

		return `# Build stage
${buildStage}

# Runtime stage
FROM ${baseImage}

WORKDIR /app

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

# Copy JAR from build stage
COPY --from=build ${jarPath} app.jar

# Create non-root user
${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app && chmod -R 755 /app"}

USER appuser

# Expose application port
EXPOSE ${this.config.port}${debugExpose}${healthCheck}

# Run application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]`;
	}

	private generateJavaWarDockerfile(): string {
		const server = this.config.server || "tomcat";
		const serverImage = this.getServerImage(server);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		const isJetty = server === "jetty";
		const webappsPath = isJetty ? "/var/lib/jetty/webapps" : "/usr/local/tomcat/webapps";
		const startCommand = isJetty ? '["jetty.sh", "run"]' : '["catalina.sh", "run"]';

		const warPath = this.config.buildTool === "gradle" ? "/app/build/libs/*.war" : "/app/target/*.war";

		return `# Build stage
${this.getJavaBuildStage()}

# Runtime stage
FROM ${serverImage}

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

# Remove default applications
RUN rm -rf ${webappsPath}/*

# Copy WAR file
COPY --from=build ${warPath} ${webappsPath}/ROOT.war

# Expose application port
EXPOSE ${this.config.port}${debugExpose}${healthCheck}

# Start server
CMD ${startCommand}`;
	}

	private getJavaBaseImage(): string {
		const vendor = this.config.jdkVendor || "eclipse-temurin";
		const version = this.config.jdkVersion || "17";

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

	private getJavaBuildStage(): string {
		let version = this.config.jdkVersion || "17";

		if (this.config.language === "java-war" && version === "25") {
			version = "21";
		}

		const useAlpine = this.config.useAlpine;

		if (this.config.buildTool === "gradle") {
			const gradleImages = useAlpine ? this.langConfig?.gradleAlpineImages : this.langConfig?.gradleImages;
			const image = gradleImages?.[version] || `gradle:8-jdk${version}${useAlpine ? "-alpine" : ""}`;

			// Support both build.gradle and build.gradle.kts
			return `FROM ${image} AS build
WORKDIR /app

COPY build.gradle* settings.gradle* gradlew* ./
COPY gradle ./gradle
COPY src ./src

RUN if [ -f gradlew ]; then ./gradlew build -x test --no-daemon; else gradle build -x test --no-daemon; fi && \\
    rm -rf /root/.gradle/caches`;
		} else {
			const mavenImages = useAlpine ? this.langConfig?.mavenAlpineImages : this.langConfig?.mavenImages;
			const image = mavenImages?.[version] || `maven:3.9-jdk-${version}${useAlpine ? "-alpine" : ""}`;

			// Support Maven wrapper
			return `FROM ${image} AS build
WORKDIR /app

COPY pom.xml ./
COPY .mvn .mvn
COPY mvnw* ./

RUN if [ -f mvnw ]; then ./mvnw dependency:go-offline; else mvn dependency:go-offline; fi

COPY src ./src
RUN if [ -f mvnw ]; then ./mvnw package -DskipTests; else mvn package -DskipTests; fi && \\
    rm -rf /root/.m2/repository`;
		}
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
			const tomcatVersions: Record<string, string> = {
				"8": "8.5-jre8",
				"11": "9.0-jre11",
				"17": "10.1-jre17",
				"21": "11.0-jre21",
				"25": "11.0-jre21",
			};
			return `tomcat:${tomcatVersions[version] || "10.1-jre17"}${variant}`;
		} else {
			const jettyVersions: Record<string, string> = {
				"8": "9.4-jre8",
				"11": "11.0-jre11",
				"17": "11.0-jre17",
				"21": "12.0-jre21",
				"25": "12.0-jre21",
			};
			return `jetty:${jettyVersions[version] || "11.0-jre17"}${variant}`;
		}
	}

	private getNodeImage(version: string): string {
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === version);
			if (versionConfig?.images) {
				if (this.config.useAlpine && versionConfig.images.alpine) {
					return versionConfig.images.alpine;
				}
				if (versionConfig.images.standard) {
					return versionConfig.images.standard;
				}
			}
		}

		return `node:${version}${this.config.useAlpine ? "-alpine" : ""}`;
	}

	private getPackageInstallCommand(): string {
		const pm = this.config.packageManager || "npm";
		switch (pm) {
			case "yarn":
				return "yarn install --frozen-lockfile";
			case "pnpm":
				return "pnpm install --frozen-lockfile";
			case "bun":
				return "bun install";
			default:
				return "npm ci || npm install";
		}
	}

	private getRunCommand(): string {
		const pm = this.config.packageManager || "npm";
		switch (pm) {
			case "yarn":
				return "yarn start";
			case "pnpm":
				return "pnpm start";
			case "bun":
				return "bun start";
			default:
				return "npm start";
		}
	}

	private generateJSFrontendDockerfile(): string {
		const nodeVersion = this.config.nodeVersion || "18";
		const image = this.getNodeImage(nodeVersion);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const framework = this.config.framework;
		const installCmd = this.getPackageInstallCommand();

		if (framework === "angular") {
			return `# Build stage
FROM ${image} AS build

WORKDIR /app

COPY package*.json ./
COPY yarn.lock* ./
COPY pnpm-lock.yaml* ./
COPY bun.lockb* ./

RUN ${installCmd}

COPY . .

RUN npm run build

# Runtime stage
FROM ${image}

WORKDIR /app

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./

# Copy Angular SSR files if they exist
COPY --from=build /app/server.js* ./
COPY --from=build /app/angular.json* ./

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

CMD ["node", "server.js"]`;
		} else if (framework === "nuxtjs") {
			return `# Build stage
FROM ${image} AS build

WORKDIR /app

COPY package*.json ./
COPY yarn.lock* ./
COPY pnpm-lock.yaml* ./
COPY bun.lockb* ./

RUN ${installCmd}

COPY . .

RUN npm run build

# Runtime stage
FROM ${image}

WORKDIR /app

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

ENV NODE_ENV=production
ENV PORT=${this.config.port}

COPY --from=build /app/.nuxt ./.nuxt
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/public ./public
COPY --from=build /app/nuxt.config.js ./nuxt.config.js

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

CMD ["${this.getRunCommand().split(" ")[0]}", "${this.getRunCommand().split(" ").slice(1).join(" ")}"]`;
		} else {
			// Next.js (default)
			return `# Build stage
FROM ${image} AS build

WORKDIR /app

COPY package*.json ./
COPY yarn.lock* ./
COPY pnpm-lock.yaml* ./
COPY bun.lockb* ./

RUN ${installCmd}

COPY . .

RUN npm run build

# Runtime stage
FROM ${image}

WORKDIR /app

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

ENV NODE_ENV=production
ENV PORT=${this.config.port}

COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.js ./next.config.js

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

CMD ["npm", "start"]`;
		}
	}

	private generateJSBackendDockerfile(): string {
		const nodeVersion = this.config.nodeVersion || "18";
		const image = this.getNodeImage(nodeVersion);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const installCmd = this.getPackageInstallCommand();

		return `FROM ${image}

WORKDIR /app

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

COPY package*.json ./
COPY yarn.lock* ./
COPY pnpm-lock.yaml* ./
COPY bun.lockb* ./
COPY tsconfig.json* ./

RUN ${installCmd}

COPY . .

# Build TypeScript if needed
RUN if [ -f tsconfig.json ]; then npm run build || true; fi

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

ENV NODE_ENV=production
ENV PORT=${this.config.port}

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

CMD ["node", "dist/index.js"]`;
	}

	private getPythonImage(version: string): string {
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === version);
			if (versionConfig?.images) {
				if (this.config.useAlpine && versionConfig.images.alpine) {
					return versionConfig.images.alpine;
				}
				if (versionConfig.images.slim) {
					return versionConfig.images.slim;
				}
				if (versionConfig.images.standard) {
					return versionConfig.images.standard;
				}
			}
		}

		return `python:${version}${this.config.useAlpine ? "-alpine" : "-slim"}`;
	}

	private generatePythonDockerfile(): string {
		const pythonVersion = this.config.pythonVersion || "3.11";
		const image = this.getPythonImage(pythonVersion);
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const framework = this.config.framework;

		const installCmd = this.config.useAlpine ? "RUN apk add --no-cache gcc musl-dev libffi-dev openssl-dev zlib-dev jpeg-dev" : "RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev default-libmysqlclient-dev libjpeg-dev && rm -rf /var/lib/apt/lists/*";

		let startCmd = 'CMD ["python", "app.py"]';
		if (framework === "django") {
			startCmd = `CMD ["python", "manage.py", "runserver", "0.0.0.0:${this.config.port}"]`;
		} else if (framework === "flask") {
			startCmd = `CMD ["flask", "run", "--host=0.0.0.0", "--port=${this.config.port}"]`;
		} else if (framework === "fastapi") {
			startCmd = `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${this.config.port}"]`;
		}

		return `FROM ${image}

WORKDIR /app

# Install system dependencies
${installCmd}

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

# Copy requirements files
COPY requirements.txt* ./
COPY pyproject.toml* ./
COPY setup.py* ./

# Install Python dependencies
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; \\
    elif [ -f pyproject.toml ]; then pip install --no-cache-dir .; \\
    elif [ -f setup.py ]; then pip install --no-cache-dir .; fi

COPY . .

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

ENV PYTHONUNBUFFERED=1 \\
    PYTHONDONTWRITEBYTECODE=1

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

${startCmd}`;
	}

	private generateGoDockerfile(): string {
		const goVersion = this.config.goVersion || "1.21";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		let buildImage = `golang:${goVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === goVersion);
			if (versionConfig) {
				buildImage = this.config.useAlpine ? versionConfig.alpineImage || versionConfig.image : versionConfig.image;
			}
		}

		const runtimeBase = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";

		return `# Build stage
FROM ${buildImage} AS build

WORKDIR /app

# Set Go proxy for private repos
ARG GOPROXY=https://proxy.golang.org,direct
ARG GOPRIVATE=

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

# Build with CGO support
RUN CGO_ENABLED=1 GOOS=linux go build -a -installsuffix cgo -o main .

# Runtime stage
FROM ${runtimeBase}

WORKDIR /app

# Install CA certificates and timezone data
${this.config.useAlpine ? "RUN apk --no-cache add ca-certificates tzdata" : "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tzdata && rm -rf /var/lib/apt/lists/*"}

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

COPY --from=build /app/main .

# Copy static files if they exist
COPY --from=build /app/static* ./static/ 2>/dev/null || true
COPY --from=build /app/templates* ./templates/ 2>/dev/null || true
COPY --from=build /app/config* ./config/ 2>/dev/null || true

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

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

		return `# Build stage
FROM ${buildImage} AS build

WORKDIR /app

# Copy manifests for caching
COPY Cargo.toml Cargo.lock* ./

# Create dummy source for dependency caching
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy actual source
COPY . .

# Build with cache
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM ${runtimeImage}

WORKDIR /app

# Install CA certificates
${this.config.useAlpine ? "RUN apk --no-cache add ca-certificates" : "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*"}

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

COPY --from=build /app/target/release/${this.config.projectName} .

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

EXPOSE ${this.config.port}${this.getHealthCheck()}

CMD ["./${this.config.projectName}"]`;
	}

	private generateDotNetDockerfile(): string {
		const dotnetVersion = this.config.dotnetVersion || "8.0";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		let sdkImage = `mcr.microsoft.com/dotnet/sdk:${dotnetVersion}`;
		let aspnetImage = `mcr.microsoft.com/dotnet/aspnet:${dotnetVersion}`;

		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === dotnetVersion);
			if (versionConfig) {
				sdkImage = versionConfig.sdkImage || sdkImage;
				aspnetImage = this.config.useAlpine ? versionConfig.aspnetAlpineImage || versionConfig.aspnetImage : versionConfig.aspnetImage;
			}
		}

		const safeProjectName = this.config.projectName.replace(/[^a-zA-Z0-9]/g, "");

		return `# Build stage
FROM ${sdkImage} AS build

WORKDIR /app

# Copy project files
COPY *.csproj ./
COPY *.sln ./
COPY NuGet.config* ./

RUN dotnet restore

COPY . .

RUN dotnet publish -c Release -o out

# Runtime stage
FROM ${aspnetImage}

WORKDIR /app

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

COPY --from=build /app/out .

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

ENTRYPOINT ["dotnet", "${safeProjectName}.dll"]`;
	}

	private generateLaravelDockerfile(): string {
		const phpVersion = this.config.phpVersion || "8.3";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		let phpImage = `php:${phpVersion}-fpm`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === phpVersion);
			if (versionConfig?.images) {
				phpImage = this.config.useAlpine ? versionConfig.images.fpmAlpine || versionConfig.images.fpm : versionConfig.images.fpm;
			}
		}

		const installCmd = this.config.useAlpine
			? `RUN apk add --no-cache \\
    git \\
    curl \\
    libpng-dev \\
    oniguruma-dev \\
    libxml2-dev \\
    zip \\
    unzip \\
    supervisor`
			: `RUN apt-get update && apt-get install -y --no-install-recommends \\
    git \\
    curl \\
    libpng-dev \\
    libonig-dev \\
    libxml2-dev \\
    zip \\
    unzip \\
    supervisor \\
    nginx \\
    && rm -rf /var/lib/apt/lists/*`;

		return `FROM ${phpImage}

WORKDIR /var/www/html

${installCmd}

RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

COPY . .

RUN composer install --no-dev --optimize-autoloader --no-interaction --prefer-dist

# Create storage directories if they don't exist
RUN mkdir -p /var/www/html/storage/framework/views \\
    /var/www/html/storage/framework/cache \\
    /var/www/html/storage/framework/sessions \\
    /var/www/html/bootstrap/cache

RUN chown -R www-data:www-data /var/www/html \\
    && chmod -R 755 /var/www/html/storage \\
    && chmod -R 755 /var/www/html/bootstrap/cache

EXPOSE 9000${debugExpose}${healthCheck}

CMD ["php-fpm"]`;
	}

	private generateRailsDockerfile(): string {
		const rubyVersion = this.config.rubyVersion || "3.3";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		let rubyImage = `ruby:${rubyVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === rubyVersion);
			if (versionConfig?.images) {
				if (this.config.useAlpine && versionConfig.images.alpine) {
					rubyImage = versionConfig.images.alpine;
				} else if (versionConfig.images.slim) {
					rubyImage = versionConfig.images.slim;
				} else {
					rubyImage = versionConfig.images.standard;
				}
			}
		}

		return `FROM ${rubyImage}

WORKDIR /app

# Install dependencies including Node.js for assets
${this.config.useAlpine ? "RUN apk add --no-cache build-base postgresql-dev nodejs yarn tzdata git" : "RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev nodejs yarn tzdata git && rm -rf /var/lib/apt/lists/*"}

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

COPY Gemfile Gemfile.lock* ./

RUN gem install bundler && bundle install --without development test

COPY . .

RUN RAILS_ENV=production bundle exec rake assets:precompile

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

ENV RAILS_ENV=production \\
    RAILS_SERVE_STATIC_FILES=true

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

CMD ["sh", "-c", "bundle exec rails db:migrate && bundle exec rails server -b 0.0.0.0 -p ${this.config.port}"]`;
	}

	private generateCppDockerfile(): string {
		const gccVersion = this.config.gccVersion || "13";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		let gccImage = `gcc:${gccVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === gccVersion);
			if (versionConfig) {
				if (this.config.useAlpine && versionConfig.alpineImage) {
					gccImage = versionConfig.alpineImage;
				} else {
					gccImage = versionConfig.image;
				}
			}
		}

		const runtimeImage = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";

		return `# Build stage
FROM ${gccImage} AS build

WORKDIR /app

COPY . .

# Support CMake, Makefile, or direct compile
RUN if [ -f CMakeLists.txt ]; then \\
        cmake -B build && cmake --build build -j$(nproc); \\
    elif [ -f Makefile ]; then \\
        make -j$(nproc); \\
    else \\
        g++ -o app main.cpp; \\
    fi

# Runtime stage
FROM ${runtimeImage}

WORKDIR /app

# Install runtime dependencies
${this.config.useAlpine ? "RUN apk --no-cache add libstdc++" : "RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*"}

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

COPY --from=build /app/app* ./

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

CMD ["./app"]`;
	}

	private generateCDockerfile(): string {
		const gccVersion = this.config.gccVersion || "13";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();

		let gccImage = `gcc:${gccVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === gccVersion);
			if (versionConfig) {
				if (this.config.useAlpine && versionConfig.alpineImage) {
					gccImage = versionConfig.alpineImage;
				} else {
					gccImage = versionConfig.image;
				}
			}
		}

		const runtimeImage = this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim";

		return `# Build stage
FROM ${gccImage} AS build

WORKDIR /app

COPY . .

RUN if [ -f CMakeLists.txt ]; then \\
        cmake -B build && cmake --build build -j$(nproc); \\
    elif [ -f Makefile ]; then \\
        make -j$(nproc); \\
    else \\
        gcc -o app main.c; \\
    fi

# Runtime stage
FROM ${runtimeImage}

WORKDIR /app

${this.config.useAlpine ? "RUN apk --no-cache add musl" : "RUN apt-get update && apt-get install -y --no-install-recommends libc6 && rm -rf /var/lib/apt/lists/*"}

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

COPY --from=build /app/app* ./

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app"}

USER appuser

EXPOSE ${this.config.port}${debugExpose}${healthCheck}

CMD ["./app"]`;
	}

	private generateGenericDockerfile(): string {
		const healthCheck = this.getHealthCheck();

		return `FROM ${this.config.useAlpine ? "alpine:latest" : "ubuntu:22.04"}

WORKDIR /app

# Install health check tools if needed
${this.config.enableHealthCheck ? this.getInstallCommand() : ""}

COPY . .

EXPOSE ${this.config.port}${healthCheck}

CMD ["sh", "-c", "echo 'Please configure your application startup command'"]`;
	}
}
