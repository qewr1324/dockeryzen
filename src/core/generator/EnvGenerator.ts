import type { ProjectAnalysis, DockerConfig } from "../../types/interfaces.js";

export class EnvGenerator {
	public generate(analysis: ProjectAnalysis, config: DockerConfig): string {
		const envVars: string[] = [];

		// Remove 'alpine' from jvmOptions
		const cleanJvmOptions = (config.jvmOptions || "-Xmx512m -Xms256m").replace(/\s*alpine\s*/g, " ").trim();

		// Add database environment variables
		if (config.database && config.database.type !== "none") {
			envVars.push(`# Database Configuration`);
			envVars.push(`SPRING_DATASOURCE_URL=jdbc:${config.database.type}://${config.database.type}:${config.database.port}/${config.database.name}`);
			envVars.push(`SPRING_DATASOURCE_USERNAME=${config.database.username}`);
			envVars.push(`SPRING_DATASOURCE_PASSWORD=${config.database.password}`);
			envVars.push(``);
		}

		// Add application port
		envVars.push(`# Application Configuration`);
		envVars.push(`SERVER_PORT=${config.port || analysis.port || 8080}`);
		envVars.push(``);

		// Add JVM options
		envVars.push(`# JVM Configuration`);
		envVars.push(`JAVA_OPTS=${cleanJvmOptions}`);
		envVars.push(``);

		// Add debug configuration
		if (config.enableDebug) {
			envVars.push(`# Debug Configuration`);
			envVars.push(`DEBUG_PORT=${config.debugPort || 5005}`);
			envVars.push(``);
		}

		// Add custom environment variables
		if (config.envVariables && Object.keys(config.envVariables).length > 0) {
			envVars.push(`# Custom Environment Variables`);
			for (const [key, value] of Object.entries(config.envVariables)) {
				envVars.push(`${key}=${value}`);
			}
			envVars.push(``);
		}

		// Add security warning
		envVars.push(`# SECURITY WARNING: Do not commit this file to version control!`);
		envVars.push(`# Add .env to .gitignore immediately.`);

		return envVars.join("\n");
	}
}
