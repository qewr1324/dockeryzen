import { ProjectConfig } from "../types/index.js";

export class DockerfileGenerator {
	constructor(private config: ProjectConfig) {}

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
			default:
				return this.generateGenericDockerfile();
		}
	}

	private generateJavaJarDockerfile(): string {
		const baseImage = this.getJavaBaseImage();
		const buildStage = this.getJavaBuildStage();
		const debugConfig = this.config.enableDebug ? this.getJavaDebugConfig() : "";
		const healthCheck = this.config.enableHealthCheck ? this.getJavaHealthCheck() : "";

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
EXPOSE ${this.config.port}
${debugConfig}${healthCheck}
# Run application
ENTRYPOINT ["java", "-jar", "app.jar"]`;
	}

	private getJavaBaseImage(): string {
		const vendor = this.config.jdkVendor || "eclipse-temurin";
		const version = this.config.jdkVersion || "17";
		const variant = this.config.useAlpine ? "-alpine" : "";

		const imageMap: Record<string, string> = {
			"eclipse-temurin": `eclipse-temurin:${version}-jre${variant}`,
			amazoncorretto: `amazoncorretto:${version}${variant}`,
			openjdk: `openjdk:${version}${variant ? "-alpine" : "-slim"}`,
			"oracle-jdk": `oraclelinux:${version}`,
		};

		return imageMap[vendor] || imageMap["eclipse-temurin"];
	}

	private getJavaBuildStage(): string {
		const version = this.config.jdkVersion || "17";

		if (this.config.buildTool === "gradle") {
			return `FROM gradle:${version}-jdk${this.config.useAlpine ? "-alpine" : ""} AS build
WORKDIR /app

# Copy build files
COPY build.gradle settings.gradle gradlew ./
COPY gradle ./gradle
COPY src ./src

# Build application
RUN gradle build -x test --no-daemon`;
		} else {
			return `FROM maven:${version}-${this.config.useAlpine ? "alpine" : "slim"} AS build
WORKDIR /app

# Copy POM and download dependencies
COPY pom.xml .
RUN mvn dependency:go-offline

# Copy source code and build
COPY src ./src
RUN mvn package -DskipTests`;
		}
	}

	private getJavaDebugConfig(): string {
		return `
# Debug port
EXPOSE 5005

# Enable debug mode
ENTRYPOINT ["java", "-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005", "-jar", "app.jar"]`;
	}

	private getJavaHealthCheck(): string {
		if (!this.config.enableHealthCheck) return "";

		if (this.config.framework === "spring-boot") {
			return `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD wget -q --spider http://localhost:${this.config.port}/actuator/health || exit 1`;
		}

		return `
# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\
  CMD wget -q --spider http://localhost:${this.config.port}/health || exit 1`;
	}

	private generateJavaWarDockerfile(): string {
		const server = this.config.server || "tomcat";
		const serverImages: Record<string, string> = {
			tomcat: `tomcat:${this.getTomcatVersion()}${this.config.useAlpine ? "-alpine" : ""}`,
			jetty: `jetty:${this.getJettyVersion()}${this.config.useAlpine ? "-alpine" : ""}`,
		};

		const healthCheck = this.config.enableHealthCheck ? this.getJavaHealthCheck() : "";

		return `# Build stage
${this.getJavaBuildStage()}

# Runtime stage
FROM ${serverImages[server]}

# Remove default applications
RUN rm -rf /usr/local/tomcat/webapps/*

# Copy WAR file
COPY --from=build /app/target/*.war /usr/local/tomcat/webapps/ROOT.war

# Expose port
EXPOSE ${this.config.port}
${healthCheck}
# Start server
CMD ["catalina.sh", "run"]`;
	}

	private getTomcatVersion(): string {
		const version = this.config.jdkVersion || "17";

		const versions: Record<string, string> = {
			"8": "8.5-jre8",
			"11": "9.0-jre11",
			"17": "10.1-jre17",
			"21": "10.1-jre21",
			"25": "11.0-jre21",
		};
		return versions[version] || "10.1-jre17";
	}

	private getJettyVersion(): string {
		const version = this.config.jdkVersion || "17";

		const versions: Record<string, string> = {
			"8": "9.4-jre8",
			"11": "11.0-jre11",
			"17": "11.0-jre17",
			"21": "12.0-jre21",
			"25": "12.0-jre21",
		};
		return versions[version] || "11.0-jre17";
	}

	private generateJSFrontendDockerfile(): string {
		const nodeVersion = this.config.nodeVersion || "18";

		return `# Build stage
FROM node:${nodeVersion}${this.config.useAlpine ? "-alpine" : ""} AS build

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
FROM node:${nodeVersion}${this.config.useAlpine ? "-alpine" : ""}

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

		return `FROM node:${nodeVersion}${this.config.useAlpine ? "-alpine" : ""}

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

	private generatePythonDockerfile(): string {
		const pythonVersion = this.config.pythonVersion || "3.11";

		return `FROM python:${pythonVersion}${this.config.useAlpine ? "-alpine" : "-slim"}

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

	private generateGoDockerfile(): string {
		const goVersion = this.config.framework || "1.21";

		return `# Build stage
FROM golang:${goVersion}${this.config.useAlpine ? "-alpine" : ""} AS build

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

# Install CA certificates (for Alpine)
${this.config.useAlpine ? "RUN apk --no-cache add ca-certificates\n" : ""}
# Copy binary
COPY --from=build /app/main .

# Create non-root user
${
	this.config.useAlpine
		? `RUN adduser -D -u 1001 appuser
USER appuser`
		: "USER 1001"
}

# Expose port
EXPOSE ${this.config.port}

# Run application
CMD ["./main"]`;
	}

	private generateRustDockerfile(): string {
		const rustVersion = this.config.framework || "1.75";

		return `# Build stage
FROM rust:${rustVersion}${this.config.useAlpine ? "-alpine" : "-slim"} AS build

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
FROM ${this.config.useAlpine ? "alpine:latest" : "debian:bookworm-slim"}

WORKDIR /app

# Install CA certificates
${this.config.useAlpine ? "RUN apk --no-cache add ca-certificates\n" : "RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*\n"}
# Copy binary
COPY --from=build /app/target/release/${this.config.projectName} .

# Create non-root user
${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser\nUSER appuser" : "RUN useradd -r -u 1001 -g root appuser\nUSER appuser"}

# Expose port
EXPOSE ${this.config.port}

# Run application
CMD ["./${this.config.projectName}"]`;
	}

	private generateDotNetDockerfile(): string {
		const dotnetVersion = this.config.framework || "8.0";

		return `# Build stage
FROM mcr.microsoft.com/dotnet/sdk:${dotnetVersion} AS build

WORKDIR /app

# Copy project files
COPY *.csproj ./
RUN dotnet restore

# Copy source code
COPY . .

# Build application
RUN dotnet publish -c Release -o out

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:${dotnetVersion}${this.config.useAlpine ? "-alpine" : ""}

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
		const phpVersion = this.config.framework || "8.2";

		return `FROM php:${phpVersion}-fpm${this.config.useAlpine ? "-alpine" : ""}

WORKDIR /var/www/html

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \\
    git \\
    curl \\
    libpng-dev \\
    libonig-dev \\
    libxml2-dev \\
    zip \\
    unzip \\
    && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Copy application files
COPY . .

# Install dependencies
RUN composer install --no-dev --optimize-autoloader

# Set permissions
RUN chown -R www-data:www-data /var/www/html \\
    && chmod -R 755 /var/www/html/storage \\
    && chmod -R 755 /var/www/html/bootstrap/cache

# Expose port
EXPOSE 9000

# Start PHP-FPM
CMD ["php-fpm"]`;
	}

	private generateRailsDockerfile(): string {
		const rubyVersion = this.config.framework || "3.2";

		return `FROM ruby:${rubyVersion}${this.config.useAlpine ? "-alpine" : ""}

WORKDIR /app

# Install system dependencies
${this.config.useAlpine ? "RUN apk add --no-cache build-base postgresql-dev nodejs yarn tzdata\n" : "RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev nodejs yarn tzdata && rm -rf /var/lib/apt/lists/*\n"}
# Copy Gemfile
COPY Gemfile Gemfile.lock ./

# Install gems
RUN gem install bundler && bundle install --without development test

# Copy application
COPY . .

# Precompile assets
RUN RAILS_ENV=production bundle exec rake assets:precompile

# Create non-root user
${this.config.useAlpine ? "RUN adduser -D -u 1001 appuser && chown -R appuser:appuser /app\nUSER appuser" : "RUN useradd -r -u 1001 -g root appuser && chown -R appuser:root /app\nUSER appuser"}

# Expose port
EXPOSE ${this.config.port}

# Start Rails server
CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0", "-p", "${this.config.port}"]`;
	}

	private generateGenericDockerfile(): string {
		return `FROM ${this.config.useAlpine ? "alpine:latest" : "ubuntu:22.04"}

WORKDIR /app

# Copy application
COPY . .

# Expose port
EXPOSE ${this.config.port}

# Run application
CMD ["sh", "-c", "echo 'Please configure your application startup command'"]`;
	}
}
