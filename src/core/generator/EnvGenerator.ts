import type { ProjectAnalysis, DockerConfig } from "../../types/interfaces.js";
import { DatabaseType } from "../../types/interfaces.js";

export class EnvGenerator {
	public generate(analysis: ProjectAnalysis, config: DockerConfig): string {
		const envVars: string[] = [];

		const cleanJvmOptions = (config.jvmOptions || "-Xmx512m -Xms256m").replace(/\s*alpine\s*/g, " ").trim();

		if (config.databases && config.databases.length > 0) {
			envVars.push(`# Database Configuration`);
			for (let i = 0; i < config.databases.length; i++) {
				const db = config.databases[i];
				if (db.type !== DatabaseType.NONE) {
					const serviceName = i === 0 ? db.type : `${db.type}-${i + 1}`;
					envVars.push(`# ${db.type.toUpperCase()} Database`);

					this.generateDatabaseEnvVars(envVars, db, i === 0, serviceName);

					envVars.push(`${db.type.toUpperCase()}_HOST=${serviceName}`);
					envVars.push(`${db.type.toUpperCase()}_PORT=${db.port}`);
					envVars.push(`${db.type.toUpperCase()}_DB=${db.name}`);
					envVars.push(`${db.type.toUpperCase()}_USER=${db.username}`);
					envVars.push(`${db.type.toUpperCase()}_PASSWORD=${db.password}`);
					envVars.push(``);
				}
			}
		} else if (config.database && config.database.type !== DatabaseType.NONE) {
			envVars.push(`# Database Configuration`);
			this.generateDatabaseEnvVars(envVars, config.database, true, config.database.type);
			envVars.push(``);
		}

		if (config.messageQueues && config.messageQueues.length > 0) {
			envVars.push(`# Message Queue Configuration`);
			for (let i = 0; i < config.messageQueues.length; i++) {
				const mq = config.messageQueues[i];
				const serviceName = i === 0 ? mq.type : `${mq.type}-${i + 1}`;

				switch (mq.type) {
					case "rabbitmq":
						envVars.push(`SPRING_RABBITMQ_HOST=${serviceName}`);
						envVars.push(`SPRING_RABBITMQ_PORT=${mq.port || 5672}`);
						envVars.push(`SPRING_RABBITMQ_USERNAME=${mq.username || "guest"}`);
						envVars.push(`SPRING_RABBITMQ_PASSWORD=${mq.password || "guest"}`);
						break;
					case "kafka":
						envVars.push(`SPRING_KAFKA_BOOTSTRAP_SERVERS=${serviceName}:${mq.port || 9092}`);
						break;
					case "activemq":
						envVars.push(`SPRING_ACTIVEMQ_BROKER_URL=tcp://${serviceName}:${mq.port || 61616}`);
						break;
				}
			}
			envVars.push(``);
		}

		envVars.push(`# Application Configuration`);
		envVars.push(`SERVER_PORT=${config.port || analysis.port || 8080}`);
		envVars.push(``);

		envVars.push(`# JVM Configuration`);
		envVars.push(`JAVA_OPTS=${cleanJvmOptions}`);
		envVars.push(``);

		if (config.enableDebug) {
			envVars.push(`# Debug Configuration`);
			envVars.push(`DEBUG_PORT=${config.debugPort || 5005}`);
			envVars.push(``);
		}

		if (config.envVariables && Object.keys(config.envVariables).length > 0) {
			envVars.push(`# Custom Environment Variables`);
			for (const [key, value] of Object.entries(config.envVariables)) {
				envVars.push(`${key}=${value}`);
			}
			envVars.push(``);
		}

		envVars.push(`# SECURITY WARNING: Do not commit this file to version control!`);
		envVars.push(`# Add .env to .gitignore immediately.`);

		return envVars.join("\n");
	}

	private generateDatabaseEnvVars(envVars: string[], db: any, isPrimary: boolean, serviceName: string): void {
		const host = serviceName;

		switch (db.type) {
			case "postgresql":
				envVars.push(`SPRING_DATASOURCE_URL=jdbc:postgresql://${host}:${db.port}/${db.name}`);
				envVars.push(`SPRING_DATASOURCE_USERNAME=${db.username}`);
				envVars.push(`SPRING_DATASOURCE_PASSWORD=${db.password}`);
				if (isPrimary) {
					envVars.push(`SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver`);
				}
				break;
			case "mysql":
				envVars.push(`SPRING_DATASOURCE_URL=jdbc:mysql://${host}:${db.port}/${db.name}?useSSL=false&serverTimezone=UTC`);
				envVars.push(`SPRING_DATASOURCE_USERNAME=${db.username}`);
				envVars.push(`SPRING_DATASOURCE_PASSWORD=${db.password}`);
				if (isPrimary) {
					envVars.push(`SPRING_DATASOURCE_DRIVER_CLASS_NAME=com.mysql.cj.jdbc.Driver`);
				}
				break;
			case "mariadb":
				envVars.push(`SPRING_DATASOURCE_URL=jdbc:mariadb://${host}:${db.port}/${db.name}`);
				envVars.push(`SPRING_DATASOURCE_USERNAME=${db.username}`);
				envVars.push(`SPRING_DATASOURCE_PASSWORD=${db.password}`);
				if (isPrimary) {
					envVars.push(`SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.mariadb.jdbc.Driver`);
				}
				break;
			case "mongodb":
				envVars.push(`SPRING_DATA_MONGODB_URI=mongodb://${db.username}:${db.password}@${host}:${db.port}/${db.name}?authSource=admin`);
				envVars.push(`SPRING_DATA_MONGODB_DATABASE=${db.name}`);
				break;
			case "redis":
				envVars.push(`SPRING_DATA_REDIS_HOST=${host}`);
				envVars.push(`SPRING_DATA_REDIS_PORT=${db.port}`);
				if (db.password && db.password !== "password") {
					envVars.push(`SPRING_DATA_REDIS_PASSWORD=${db.password}`);
				}
				break;
			case "cassandra":
				envVars.push(`SPRING_DATA_CASSANDRA_CONTACT_POINTS=${host}`);
				envVars.push(`SPRING_DATA_CASSANDRA_PORT=${db.port}`);
				envVars.push(`SPRING_DATA_CASSANDRA_KEYSPACE_NAME=${db.name}`);
				envVars.push(`SPRING_DATA_CASSANDRA_USERNAME=${db.username}`);
				envVars.push(`SPRING_DATA_CASSANDRA_PASSWORD=${db.password}`);
				break;
			case "elasticsearch":
				envVars.push(`SPRING_ELASTICSEARCH_URIS=http://${host}:${db.port}`);
				envVars.push(`SPRING_ELASTICSEARCH_USERNAME=${db.username}`);
				envVars.push(`SPRING_ELASTICSEARCH_PASSWORD=${db.password}`);
				break;
			case "neo4j":
				envVars.push(`SPRING_NEO4J_URI=bolt://${host}:${db.port}`);
				envVars.push(`SPRING_NEO4J_AUTHENTICATION_USERNAME=${db.username}`);
				envVars.push(`SPRING_NEO4J_AUTHENTICATION_PASSWORD=${db.password}`);
				break;
			case "h2":
				envVars.push(`SPRING_DATASOURCE_URL=jdbc:h2:mem:${db.name}`);
				envVars.push(`SPRING_DATASOURCE_USERNAME=${db.username}`);
				envVars.push(`SPRING_DATASOURCE_PASSWORD=${db.password}`);
				envVars.push(`SPRING_H2_CONSOLE_ENABLED=true`);
				break;
		}
	}
}
