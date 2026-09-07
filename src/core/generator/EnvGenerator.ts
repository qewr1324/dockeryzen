import type { ProjectAnalysis, DockerConfig } from "../../types/interfaces.js";
import { DatabaseType } from "../../types/interfaces.js";

export class EnvGenerator {
	public generate(analysis: ProjectAnalysis, config: DockerConfig): string {
		const envVars: string[] = [];

		// Remove 'alpine' from jvmOptions
		const cleanJvmOptions = (config.jvmOptions || "-Xmx512m -Xms256m").replace(/\s*alpine\s*/g, " ").trim();

		// Add database environment variables
		if (config.databases && config.databases.length > 0) {
			envVars.push(`# Database Configuration`);
			for (const db of config.databases) {
				if (db.type !== DatabaseType.NONE) {
					envVars.push(`# ${db.type.toUpperCase()} Database`);
					envVars.push(`SPRING_DATASOURCE_URL_${db.type.toUpperCase()}=jdbc:${db.type}://${db.type}:${db.port}/${db.name}`);
					envVars.push(`SPRING_DATASOURCE_USERNAME_${db.type.toUpperCase()}=${db.username}`);
					envVars.push(`SPRING_DATASOURCE_PASSWORD_${db.type.toUpperCase()}=${db.password}`);

					// For primary database (first one)
					if (config.databases && config.databases[0] === db) {
						envVars.push(`SPRING_DATASOURCE_URL=jdbc:${db.type}://${db.type}:${db.port}/${db.name}`);
						envVars.push(`SPRING_DATASOURCE_USERNAME=${db.username}`);
						envVars.push(`SPRING_DATASOURCE_PASSWORD=${db.password}`);
					}

					envVars.push(`${db.type.toUpperCase()}_HOST=${db.type}`);
					envVars.push(`${db.type.toUpperCase()}_PORT=${db.port}`);
					envVars.push(`${db.type.toUpperCase()}_DB=${db.name}`);
					envVars.push(`${db.type.toUpperCase()}_USER=${db.username}`);
					envVars.push(`${db.type.toUpperCase()}_PASSWORD=${db.password}`);
					envVars.push(``);
				}
			}
		} else if (config.database && config.database.type !== DatabaseType.NONE) {
			envVars.push(`# Database Configuration`);
			envVars.push(`SPRING_DATASOURCE_URL=jdbc:${config.database.type}://${config.database.type}:${config.database.port}/${config.database.name}`);
			envVars.push(`SPRING_DATASOURCE_USERNAME=${config.database.username}`);
			envVars.push(`SPRING_DATASOURCE_PASSWORD=${config.database.password}`);
			envVars.push(``);
		}

		// Add message queue environment variables
		if (config.messageQueues && config.messageQueues.length > 0) {
			envVars.push(`# Message Queue Configuration`);
			for (const mq of config.messageQueues) {
				switch (mq.type) {
					case "rabbitmq":
						envVars.push(`SPRING_RABBITMQ_HOST=rabbitmq`);
						envVars.push(`SPRING_RABBITMQ_PORT=${mq.port || 5672}`);
						envVars.push(`SPRING_RABBITMQ_USERNAME=guest`);
						envVars.push(`SPRING_RABBITMQ_PASSWORD=guest`);
						break;
					case "kafka":
						envVars.push(`SPRING_KAFKA_BOOTSTRAP_SERVERS=kafka:${mq.port || 9092}`);
						break;
					case "activemq":
						envVars.push(`SPRING_ACTIVEMQ_BROKER_URL=tcp://activemq:${mq.port || 61616}`);
						break;
				}
			}
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
