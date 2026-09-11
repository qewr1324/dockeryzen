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

		return `\n# Install health check tools\n${this.getInstallCommand()}\n`;
	}

	protected getOciLabels(): string {
		const labels = [`org.opencontainers.image.title="${this.config.projectName}"`, `org.opencontainers.image.description="Generated by Dockeryzen"`, `org.opencontainers.image.version="1.0.0"`, `org.opencontainers.image.created="${new Date().toISOString()}"`];
		return `# OCI Labels\nLABEL ${labels.join(" \\\n      ")}`;
	}
}
