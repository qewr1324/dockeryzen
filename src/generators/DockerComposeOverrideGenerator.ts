import { ProjectConfig } from "../types/index.js";
import { sanitizeName } from "../utils/helpers.js";

/**
 * DockerComposeOverrideGenerator class - Generates docker-compose.override.yml for development
 */
export class DockerComposeOverrideGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const serviceName = sanitizeName(this.config.projectName);
		const debugPort = this.config.debugPort || this.getDefaultDebugPort();

		const services: string[] = [];

		// Main app service with debug and hot reload
		let appService = `  ${serviceName}:
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - DEBUG=true
      - SPRING_PROFILES_ACTIVE=dev`;

		if (this.config.enableDebug && debugPort) {
			appService += `
    ports:
      - "${debugPort}:${debugPort}"`;
		}

		services.push(appService);

		// Database services with exposed ports for local access
		for (const db of this.config.databases) {
			if (!db.useExternalUrl) {
				const dbServiceName = sanitizeName(`${this.config.projectName}-${db.type}`);
				services.push(`
  ${dbServiceName}:
    ports:
      - "${db.externalPort}:${db.internalPort}"`);
			}
		}

		// Redis with local access
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
