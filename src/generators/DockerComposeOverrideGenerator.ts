import { ProjectConfig } from "../types/index.js";
import { sanitizeName } from "../utils/helpers.js";

export class DockerComposeOverrideGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const serviceName = sanitizeName(this.config.projectName);
		const debugPort = this.config.debugPort || this.getDefaultDebugPort();
		const lang = this.config.language;
		const services: string[] = [];

		const isNodeProject = lang.startsWith("js");

		let nodeModulesPath = "/app/node_modules";
		if (isNodeProject) {
			nodeModulesPath = "/app/node_modules";
		}

		const volumes = isNodeProject ? `      - .:/app\n      - ${nodeModulesPath}` : `      - .:/app`;

		let appService = `  ${serviceName}:
    volumes:
${volumes}
    environment:
      - DEBUG=true`;

		let effectiveDebugPort = debugPort;
		if (effectiveDebugPort && effectiveDebugPort === this.config.port) {
			effectiveDebugPort = this.config.port + 1000;
		}

		if (this.config.enableDebug && effectiveDebugPort) {
			appService += `
    ports:
      - "${effectiveDebugPort}:${effectiveDebugPort}"`;
		}
		services.push(appService);

		for (const db of this.config.databases) {
			if (!db.useExternalUrl) {
				const dbServiceName = sanitizeName(`${this.config.projectName}-${db.type}`);
				services.push(`
  ${dbServiceName}:
    ports:
      - "${db.externalPort}:${db.internalPort}"`);
			}
		}

		if (this.config.enableRedis) {
			const redisName = sanitizeName(`${this.config.projectName}-redis`);
			services.push(`
  ${redisName}:
    ports:
      - "6379:6379"`);
		}

		return `# Development overrides
# This file is automatically merged with docker-compose.yml
# Used only for local development with hot reload and debugging
# Run with: docker compose up (auto-detects this file)

services:
${services.join("\n")}`;
	}

	private getDefaultDebugPort(): number | null {
		const lang = this.config.language;
		if (lang.startsWith("java")) return 5005;
		if (lang.startsWith("js")) return 9229;
		if (lang === "python") return 5678;
		if (lang === "dotnet") return 5000;
		if (lang === "go") return 2345;
		if (lang === "laravel") return 9003;
		if (lang === "rails") return 1234;
		if (lang === "cpp" || lang === "c") return 1234;
		return null;
	}
}
