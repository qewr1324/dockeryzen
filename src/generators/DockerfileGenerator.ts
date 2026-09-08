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

	private generateJavaJarDockerfile(): string {
		const baseImage = this.getJavaBaseImage();
		const buildStage = this.getJavaBuildStage();
		const debugExpose = this.config.enableDebug ? "\n# Debug port\nEXPOSE 5005" : "";
		const healthCheck = this.config.enableHealthCheck ? this.getHealthCheck() : "";

		return `# Build stage
${buildStage}

# Runtime stage
FROM ${baseImage}

WORKDIR /app

# Copy JAR from build stage
COPY --from=build /app/target/*.jar app.jar

# Create non-root user
RUN useradd -r -u 1001 -g root appuser && \\
    chown -R appuser:root /app && \\
    chmod -R 755 /app

USER appuser

# Expose application port
EXPOSE ${this.config.port}${debugExpose}${healthCheck}
# Run application
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]`;
	}

	private generateJavaWarDockerfile(): string {
		const server = this.config.server || "tomcat";
		const serverImage = this.getServerImage(server);
		const debugExpose = this.config.enableDebug ? "\n# Debug port\nEXPOSE 5005" : "";
		const healthCheck = this.config.enableHealthCheck ? this.getHealthCheck() : "";

		const isJetty = server === "jetty";
		const webappsPath = isJetty ? "/var/lib/jetty/webapps" : "/usr/local/tomcat/webapps";
		const startCommand = isJetty ? '["jetty.sh", "run"]' : '["catalina.sh", "run"]';

		return `# Build stage
${this.getJavaBuildStage()}

# Runtime stage
FROM ${serverImage}

# Remove default applications
RUN rm -rf ${webappsPath}/*

# Copy WAR file
COPY --from=build /app/target/*.war ${webappsPath}/ROOT.war

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
		const version = this.config.jdkVersion || "17";
		const useAlpine = this.config.useAlpine;

		if (this.config.buildTool === "gradle") {
			const gradleImages = useAlpine ? this.langConfig?.gradleAlpineImages : this.langConfig?.gradleImages;
			const image = gradleImages?.[version] || `gradle:8-jdk${version}${useAlpine ? "-alpine" : ""}`;

			return `FROM ${image} AS build
WORKDIR /app

# Copy build files
COPY build.gradle settings.gradle gradlew ./
COPY gradle ./gradle
COPY src ./src

# Build application
RUN gradle build -x test --no-daemon && \\
    rm -rf /root/.gradle/caches`;
		} else {
			const mavenImages = useAlpine ? this.langConfig?.mavenAlpineImages : this.langConfig?.mavenImages;
			const image = mavenImages?.[version] || `maven:3.9-jdk-${version}${useAlpine ? "-alpine" : ""}`;

			return `FROM ${image} AS build
WORKDIR /app

# Copy POM and download dependencies in one layer
COPY pom.xml .
RUN mvn dependency:go-offline

# Copy source code and build
COPY src ./src
RUN mvn package -DskipTests && \\
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

	private getHealthCheck(): string {
		const healthPath = this.config.healthCheckPath || "/health";

		return `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD wget -q --spider http://localhost:${this.config.port}${healthPath} || exit 1`;
	}

	private generateJSFrontendDockerfile(): string {
		const nodeVersion = this.config.nodeVersion || "18";
		const image = this.getNodeImage(nodeVersion);

		return `# Build stage
FROM ${image} AS build

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./
COPY pnpm-lock.yaml* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build application
RUN npm run build

# Runtime stage
FROM ${image}

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy built application
COPY --from=build /app/.next ./.next
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package*.json ./
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.js ./next.config.js

# Create non-root user
RUN useradd -r -u 1001 -g root appuser && \\
    chown -R appuser:root /app

USER appuser

# Expose port
EXPOSE ${this.config.port}

# Start application
CMD ["npm", "start"]`;
	}

	private generateJSBackendDockerfile(): string {
		const nodeVersion = this.config.nodeVersion || "18";
		const image = this.getNodeImage(nodeVersion);

		return `FROM ${image}

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./
COPY pnpm-lock.yaml* ./

# Install production dependencies
RUN npm install --production

# Copy source code
COPY . .

# Create non-root user
RUN useradd -r -u 1001 -g root appuser && \\
    chown -R appuser:root /app

USER appuser

# Set environment to production
ENV NODE_ENV=production

# Expose port
EXPOSE ${this.config.port}

# Start application
CMD ["node", "index.js"]`;
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

	private generatePythonDockerfile(): string {
		const pythonVersion = this.config.pythonVersion || "3.11";
		const image = this.getPythonImage(pythonVersion);

		return `FROM ${image}

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    gcc \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create non-root user
RUN useradd -r -u 1001 -g root appuser && \\
    chown -R appuser:root /app

USER appuser

# Set environment variables
ENV PYTHONUNBUFFERED=1 \\
    PYTHONDONTWRITEBYTECODE=1

# Expose port
EXPOSE ${this.config.port}

# Run application
CMD ["python", "app.py"]`;
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

	private generateGoDockerfile(): string {
		const goVersion = this.config.framework || "1.21";

		let buildImage = `golang:${goVersion}`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === goVersion);
			if (versionConfig) {
				buildImage = this.config.useAlpine ? versionConfig.alpineImage || versionConfig.image : versionConfig.image;
			}
		}

		return `# Build stage
FROM ${buildImage} AS build

WORKDIR /app

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o main .

# Runtime stage
FROM ${this.config.useAlpine ? "alpine:latest" : "scratch"}

WORKDIR /app

${this.config.useAlpine ? "RUN apk --no-cache add ca-certificates\n" : ""}
COPY --from=build /app/main .

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser\nUSER appuser" : "USER 1001"}

# Expose port
EXPOSE ${this.config.port}

# Run application
CMD ["./main"]`;
	}

	private generateRustDockerfile(): string {
		const rustVersion = this.config.framework || "latest";

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

# Copy Cargo files
COPY Cargo.toml Cargo.lock ./

# Create dummy main.rs to cache dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs
RUN cargo build --release
RUN rm -rf src

# Copy source code
COPY . .

# Build application
RUN touch src/main.rs && cargo build --release

# Runtime stage
FROM ${runtimeImage}

WORKDIR /app

${this.config.useAlpine ? "RUN apk --no-cache add ca-certificates\n" : "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*\n"}
COPY --from=build /app/target/release/${this.config.projectName} .

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser\nUSER appuser" : "RUN useradd -r -u 1001 -g root appuser\nUSER appuser"}

# Expose port
EXPOSE ${this.config.port}

# Run application
CMD ["./${this.config.projectName}"]`;
	}

	private generateDotNetDockerfile(): string {
		const dotnetVersion = this.config.framework || "8.0";

		let sdkImage = `mcr.microsoft.com/dotnet/sdk:${dotnetVersion}`;
		let aspnetImage = `mcr.microsoft.com/dotnet/aspnet:${dotnetVersion}`;

		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === dotnetVersion);
			if (versionConfig) {
				sdkImage = versionConfig.sdkImage || sdkImage;
				aspnetImage = this.config.useAlpine ? versionConfig.aspnetAlpineImage || versionConfig.aspnetImage : versionConfig.aspnetImage;
			}
		}

		return `# Build stage
FROM ${sdkImage} AS build

WORKDIR /app

# Copy project files
COPY *.csproj ./
RUN dotnet restore

# Copy source code
COPY . .

# Build application
RUN dotnet publish -c Release -o out

# Runtime stage
FROM ${aspnetImage}

WORKDIR /app

# Copy published application
COPY --from=build /app/out .

# Create non-root user
RUN useradd -r -u 1001 -g root appuser && \\
    chown -R appuser:root /app

USER appuser

# Expose port
EXPOSE ${this.config.port}

# Run application
ENTRYPOINT ["dotnet", "${this.config.projectName}.dll"]`;
	}

	private generateLaravelDockerfile(): string {
		const phpVersion = this.config.framework || "8.3";

		let phpImage = `php:${phpVersion}-fpm`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === phpVersion);
			if (versionConfig?.images) {
				phpImage = this.config.useAlpine ? versionConfig.images.fpmAlpine || versionConfig.images.fpm : versionConfig.images.fpm;
			}
		}

		return `FROM ${phpImage}

WORKDIR /var/www/html

RUN apt-get update && apt-get install -y --no-install-recommends \\
    git \\
    curl \\
    libpng-dev \\
    libonig-dev \\
    libxml2-dev \\
    zip \\
    unzip \\
    && rm -rf /var/lib/apt/lists/*

RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

COPY . .

RUN composer install --no-dev --optimize-autoloader

RUN chown -R www-data:www-data /var/www/html \\
    && chmod -R 755 /var/www/html/storage \\
    && chmod -R 755 /var/www/html/bootstrap/cache

EXPOSE 9000

CMD ["php-fpm"]`;
	}

	private generateRailsDockerfile(): string {
		const rubyVersion = this.config.framework || "3.3";

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

${this.config.useAlpine ? "RUN apk add --no-cache build-base postgresql-dev nodejs yarn tzdata\n" : "RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev nodejs yarn tzdata && rm -rf /var/lib/apt/lists/*\n"}
COPY Gemfile Gemfile.lock ./

RUN gem install bundler && bundle install --without development test

COPY . .

RUN RAILS_ENV=production bundle exec rake assets:precompile

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app\nUSER appuser" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app\nUSER appuser"}

EXPOSE ${this.config.port}

CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0", "-p", "${this.config.port}"]`;
	}

	private generateCppDockerfile(): string {
		const gccVersion = this.config.framework || "13";

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

RUN g++ -o app main.cpp

# Runtime stage
FROM ${runtimeImage}

WORKDIR /app

${this.config.useAlpine ? "RUN apk --no-cache add libstdc++\n" : "RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*\n"}
COPY --from=build /app/app .

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser\nUSER appuser" : "RUN useradd -r -u 1001 -g root appuser\nUSER appuser"}

EXPOSE ${this.config.port}

CMD ["./app"]`;
	}

	private generateCDockerfile(): string {
		const gccVersion = this.config.framework || "13";

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

RUN gcc -o app main.c

# Runtime stage
FROM ${runtimeImage}

WORKDIR /app

${this.config.useAlpine ? "RUN apk --no-cache add musl\n" : "RUN apt-get update && apt-get install -y --no-install-recommends libc6 && rm -rf /var/lib/apt/lists/*\n"}
COPY --from=build /app/app .

${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser\nUSER appuser" : "RUN useradd -r -u 1001 -g root appuser\nUSER appuser"}

EXPOSE ${this.config.port}

CMD ["./app"]`;
	}

	private generateGenericDockerfile(): string {
		return `FROM ${this.config.useAlpine ? "alpine:latest" : "ubuntu:22.04"}

WORKDIR /app

COPY . .

EXPOSE ${this.config.port}

CMD ["sh", "-c", "echo 'Please configure your application startup command'"]`;
	}
}
