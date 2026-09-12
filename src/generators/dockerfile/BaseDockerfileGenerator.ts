import { ProjectConfig } from "../../types/index.js";

export abstract class BaseDockerfileGenerator {
	constructor(
		protected config: ProjectConfig,
		protected langConfig?: any,
	) {}

	abstract generate(): string;

	protected getDebugPort(): string {
		if (this.config.debugPort) return this.config.debugPort.toString();
		const lang = this.config.language;
		if (lang.startsWith("java")) return "5005";
		if (lang.startsWith("js")) return "9229";
		if (lang === "python") return "5678";
		if (lang === "dotnet") return "5000";
		if (lang === "go") return "2345";
		if (lang === "laravel") return "9003";
		if (lang === "rails") return "1234";
		if (lang === "rust") return "1234";
		if (lang === "cpp" || lang === "c") return "1234";
		return "";
	}

	protected getDebugExpose(): string {
		if (!this.config.enableDebug) return "";
		const lang = this.config.language;

		// ✅ FIX: Laravel از Xdebug استفاده می‌کنه (پورت 9003)
		if (lang === "laravel") {
			return `\n# Debug port (Xdebug)\nEXPOSE 9003`;
		}

		if (lang === "go") {
			return `\n# Debug port (delve)\nEXPOSE 2345`;
		}
		if (lang === "cpp" || lang === "c") {
			return `\n# Debug port (gdbserver)\nEXPOSE 1234`;
		}
		if (lang === "rust") {
			return `\n# Debug port (lldb/gdb)\nEXPOSE 1234`;
		}
		const debugPort = this.getDebugPort();
		if (!debugPort) return "";
		return `\n# Debug port (only exposed, not published)\nEXPOSE ${debugPort}`;
	}

	protected getHealthCheck(): string {
		if (!this.config.enableHealthCheck) return "";
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
			const healthPath = this.config.healthCheckPath || "/health";
			const primaryCheck = `curl -f http://localhost:${port}${healthPath}`;
			const fallbackCheck = `curl -f http://localhost:${port}/ || exit 1`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \\\n  CMD ${primaryCheck} || ${fallbackCheck}`;
		}

		if (lang === "python") {
			const healthPath = this.config.healthCheckPath || "/health";
			const primaryCheck = `curl -f http://localhost:${port}${healthPath}`;
			const fallbackCheck = `curl -f http://localhost:${port}/`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD ${primaryCheck} || ${fallbackCheck} || exit 1`;
		}

		if (lang === "js-frontend" && framework === "angular") {
			return `\n# Health check (SPA serves index.html at root)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\\n  CMD wget -q --spider http://localhost:${port}/ || exit 1`;
		}

		if (lang === "js-frontend" || lang === "js-backend") {
			const healthPath = this.config.healthCheckPath || "/health";
			const primaryCheck = `wget -q --spider http://localhost:${port}${healthPath}`;
			const fallbackCheck = `wget -q --spider http://localhost:${port}/`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=5 \\\n  CMD ${primaryCheck} || ${fallbackCheck} || exit 1`;
		}

		if (lang === "rails") {
			const healthPath = this.config.healthCheckPath || "/health";
			const primaryCheck = `curl -f http://localhost:${port}${healthPath}`;
			const fallbackCheck = `curl -f http://localhost:${port}/up`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=90s --retries=5 \\\n  CMD ${primaryCheck} || ${fallbackCheck} || curl -f http://localhost:${port}/ || exit 1`;
		}

		if (lang === "laravel") {
			// ✅ Laravel FPM روی پورت داخلی 9000 گوش می‌ده و نیازی به curl نداره.
			return `\n# Health check (FPM listens on internal port 9000)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=5 \\\n  CMD php -r "exit(@fsockopen('127.0.0.1', 9000) ? 0 : 1);" || exit 1`;
		}

		if (lang === "go") {
			const healthPath = this.config.healthCheckPath || "/health";
			const primaryCheck = `curl -f http://localhost:${port}${healthPath}`;
			const fallbackCheck = `curl -f http://localhost:${port}/`;
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\\n  CMD ${primaryCheck} || ${fallbackCheck} || exit 1`;
		}

		if (lang === "rust") {
			const healthPath = this.config.healthCheckPath || "/health";
			if (this.config.useAlpine) {
				return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD wget -q --spider http://localhost:${port}${healthPath} || exit 1`;
			}
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD curl -f http://localhost:${port}${healthPath} || exit 1`;
		}

		if (lang === "cpp" || lang === "c") {
			return `\n# Health check (TCP port check for non-HTTP services)\nHEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\\n  CMD nc -z localhost ${port} || exit 1`;
		}

		const healthPath = this.config.healthCheckPath || "/health";
		if (this.config.useAlpine) {
			return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD wget -q --spider http://localhost:${port}${healthPath} || exit 1`;
		}

		return `\n# Health check\nHEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \\\n  CMD curl -f http://localhost:${port}${healthPath} || exit 1`;
	}

	protected getInstallCommand(): string {
		if (this.config.useAlpine) {
			return "RUN apk add --no-cache curl ca-certificates";
		}
		return "RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*";
	}

	protected getHealthCheckInstall(): string {
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
		if (lang === "js-frontend" || lang === "js-backend") {
			if (useAlpine) {
				return `\n# Install health check tools\nRUN apk add --no-cache ca-certificates curl\n`;
			}
			return `\n# Install health check tools\nRUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl wget && rm -rf /var/lib/apt/lists/*\n`;
		}

		if (lang === "laravel") {
			return "";
		}

		return `\n# Install health check tools\n${this.getInstallCommand()}\n`;
	}

	protected getOciLabels(): string {
		// const created = (this.config as any).createdAt || "1970-01-01T00:00:00.000Z";
		const created = (this.config as any).createdAt || new Date().toISOString();
		const labels = [`org.opencontainers.image.title="${this.config.projectName}"`, `org.opencontainers.image.description="Generated by Dockeryzen"`, `org.opencontainers.image.version="1.0.0"`, `org.opencontainers.image.created="${created}"`];
		return `# OCI Labels\nLABEL ${labels.join(" \\\n      ")}`;
	}

	/**
	 * ساخت header مشترک برای همه‌ی Dockerfileها.
	 * بر اساس language و framework، خطوط مناسب رو برمی‌گردونه.
	 */
	protected getHeader(): string {
		const lang = this.config.language;
		const isJava = lang.startsWith("java");

		const frameworkOrServer = this.config.framework || this.config.server;
		const title = frameworkOrServer ? this.toTitleCase(frameworkOrServer) : this.toTitleCase(lang);

		const lines: string[] = [`# Framework: ${title}`];

		// ── Build tool ──
		const buildTool = this.getBuildTool();
		if (buildTool) {
			lines.push(`# Build tool: ${buildTool}`);
		}

		// ── Version (JDK / Node / Python / ...) ──
		const versionLine = this.getVersionLine();
		if (versionLine) {
			lines.push(versionLine);
		}

		return `# ═══════════════════════════════════════════════════════════════
${lines.join("\n")}
# ═══════════════════════════════════════════════════════════════`;
	}

	/**
	 * ساخت دستور ساخت user و chown برای همه‌ی generatorها.
	 * - Alpine: adduser با home directory
	 * - non-Alpine: useradd با home directory
	 * - بدون -g root (امنیت بهتر)
	 */
	protected buildUserSetup(): string {
		return this.config.useAlpine ? "RUN adduser -D -u 1001 -h /home/appuser appuser && chown -R appuser:appuser /app" : "RUN useradd -r -u 1001 -m -d /home/appuser appuser && chown -R appuser:appuser /app";
	}

	/**
	 * "spring-boot" → "SpringBoot"
	 * "js-frontend" → "JsFrontend"
	 * "nextjs" → "Nextjs"
	 */
	private toTitleCase(value: string): string {
		// ✅ special case برای .NET
		if (value === "dotnet") return ".NET";

		return value
			.split(/[-_]/)
			.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
			.join("");
	}

	/**
	 * تشخیص build tool بر اساس زبان
	 */
	private getBuildTool(): string | undefined {
		const lang = this.config.language;

		if (lang.startsWith("java")) return this.config.buildTool || "maven";
		if (lang.startsWith("js")) return this.config.packageManager || "npm";
		if (lang === "python") return "pip";
		if (lang === "rust") return "cargo";
		if (lang === "go") return "go";
		if (lang === "dotnet") return "dotnet";
		if (lang === "laravel") return "composer";
		if (lang === "rails") return "bundler";
		if (lang === "cpp" || lang === "c") return "gcc";

		return undefined;
	}

	/**
	 * خط نسخه بر اساس زبان
	 */
	private getVersionLine(): string | undefined {
		const lang = this.config.language;

		if (lang.startsWith("java")) {
			const jdk = this.config.jdkVersion || "17";
			const vendor = this.config.jdkVendor || "eclipse-temurin";
			return `# JDK: ${jdk} (${vendor})`;
		}
		if (lang.startsWith("js")) {
			const node = this.config.nodeVersion || "18";
			return `# Node.js: ${node}`;
		}
		if (lang === "python") {
			const py = this.config.pythonVersion || "3.11";
			return `# Python: ${py}`;
		}
		if (lang === "rust") {
			const rust = this.config.rustVersion || "latest";
			return `# Rust: ${rust}`;
		}
		if (lang === "go") {
			const go = this.config.goVersion || "1.21";
			return `# Go: ${go}`;
		}
		if (lang === "dotnet") {
			const dotnet = this.config.dotnetVersion || "8.0";
			return `# .NET: ${dotnet}`;
		}
		if (lang === "laravel") {
			const php = this.config.phpVersion || "8.3";
			return `# PHP: ${php}`;
		}
		if (lang === "rails") {
			const ruby = this.config.rubyVersion || "3.3";
			return `# Ruby: ${ruby}`;
		}
		if (lang === "cpp" || lang === "c") {
			const gcc = this.config.gccVersion || "13";
			return `# GCC: ${gcc}`;
		}

		return undefined;
	}
}
