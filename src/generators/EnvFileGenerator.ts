import { ProjectConfig } from "../types/index.js";

/**
 * EnvFileGenerator class - Generates .env.example file
 */
export class EnvFileGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const envVars: string[] = [
			"# ============================================",
			`# Environment Variables for ${this.config.projectName}`,
			"# Copy this file to .env and update values",
			"# ============================================",
			"",
			"# Application",
			`SERVER_PORT=${this.config.port}`,
			`SPRING_PROFILES_ACTIVE=production`,
			"",
		];

		// Database env vars
		for (const db of this.config.databases) {
			if (!db.useExternalUrl) {
				envVars.push(`# ${db.type} Database`, `DB_HOST=localhost`, `DB_PORT=${db.internalPort}`, `DB_NAME=${db.databaseName || "postgres"}`, `DB_USER=${db.username || "postgres"}`, `DB_PASSWORD=${db.password || "root"}`, "");
			}
		}

		// Redis env vars
		if (this.config.enableRedis) {
			envVars.push("# Redis", "REDIS_HOST=localhost", "REDIS_PORT=6379", "REDIS_PASSWORD=", "");
		}

		// Message queue env vars
		for (const mq of this.config.messageQueues) {
			const mqName = mq.type.toUpperCase().replace(/-/g, "_");
			envVars.push(`# ${mq.type} Message Queue`, `${mqName}_HOST=localhost`, `${mqName}_PORT=${mq.internalPort}`, "");
		}

		// JWT for web apps
		if (this.config.language.startsWith("js") || this.config.language === "laravel" || this.config.language === "rails" || this.config.language.startsWith("java")) {
			envVars.push("# Security", "JWT_SECRET=your-secret-key-change-this-in-production", "JWT_EXPIRATION=86400", "");
		}

		// Monitoring
		if (this.config.enableHealthCheck) {
			envVars.push("# Monitoring", "PROMETHEUS_PORT=9090", "GRAFANA_PORT=3000", "GRAFANA_ADMIN_USER=admin", "GRAFANA_ADMIN_PASSWORD=admin", "");
		}

		envVars.push("# ============================================", "# Notes:", "# - Never commit .env file to git", "# - Use .env.example as template", "# - Change all passwords in production", "# ============================================");

		return envVars.join("\n");
	}
}
