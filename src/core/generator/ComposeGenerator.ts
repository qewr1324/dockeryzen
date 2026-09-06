import * as vscode from "vscode";
import type { ProjectAnalysis, DockerConfig, ComposeService, Volume, Network } from "../../types/interfaces.js";
import { DatabaseType } from "../../types/interfaces.js";

/**
 * Docker Compose generator
 */
export class ComposeGenerator {
	/**
	 * Generate docker-compose.yml content
	 */
	public generate(analysis: ProjectAnalysis, config: DockerConfig): string {
		const services: ComposeService[] = [];
		const volumes: Volume[] = [];
		const networks: Network[] = [];

		// Add application service
		services.push(this.generateAppService(analysis, config));

		// Add database service if needed
		if (config.database && config.database.type !== DatabaseType.NONE) {
			services.push(this.generateDatabaseService(config.database));
			volumes.push({
				name: `${config.database.type}-data`,
			});
		}

		// Add network
		networks.push({
			name: "dockeryzen-network",
			driver: "bridge",
		});

		return this.buildComposeFile(services, volumes, networks);
	}

	/**
	 * Generate application service
	 */
	private generateAppService(analysis: ProjectAnalysis, config: DockerConfig): ComposeService {
		const service: ComposeService = {
			name: "app",
			build: {
				context: ".",
				dockerfile: "Dockerfile",
			},
			ports: [`${config.port}:${config.port}`],
			environment: {},
			volumes: [],
			depends_on: [],
			restart: "unless-stopped",
			networks: ["dockeryzen-network"],
		};

		// Add debug port if enabled
		if (config.enableDebug) {
			service.ports.push(`${config.debugPort}:${config.debugPort}`);
		}

		// Add environment variables
		if (config.envVariables) {
			service.environment = { ...config.envVariables };
		}

		// Add database dependencies
		if (config.database && config.database.type !== DatabaseType.NONE) {
			service.depends_on.push(config.database.type);

			// Add database environment variables
			const dbType = config.database.type;
			service.environment[`SPRING_DATASOURCE_URL`] = `jdbc:${dbType}://${dbType}:${config.database.port}/${config.database.name}`;
			service.environment[`SPRING_DATASOURCE_USERNAME`] = config.database.username;
			service.environment[`SPRING_DATASOURCE_PASSWORD`] = config.database.password;
		}

		// Add health check
		if (config.enableHealthCheck) {
			service.healthcheck = {
				test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", `http://localhost:${config.port}/actuator/health`],
				interval: "30s",
				timeout: "3s",
				retries: 3,
			};
		}

		// Add resource limits
		if (config.resourceLimits) {
			service.deploy = {
				resources: {
					limits: {
						cpus: config.resourceLimits.cpus,
						memory: config.resourceLimits.memory,
					},
				},
			};
		}

		return service;
	}

	/**
	 * Generate database service
	 */
	private generateDatabaseService(dbConfig: any): ComposeService {
		const service: ComposeService = {
			name: dbConfig.type,
			image: this.getDatabaseImage(dbConfig),
			ports: [`${dbConfig.port}:${dbConfig.port}`],
			environment: {},
			volumes: [`${dbConfig.type}-data:/var/lib/${dbConfig.type}`],
			depends_on: [],
			restart: "unless-stopped",
			networks: ["dockeryzen-network"],
		};

		// Set database-specific environment variables
		switch (dbConfig.type) {
			case DatabaseType.POSTGRESQL:
				service.environment = {
					POSTGRES_DB: dbConfig.name,
					POSTGRES_USER: dbConfig.username,
					POSTGRES_PASSWORD: dbConfig.password,
				};
				break;
			case DatabaseType.MYSQL:
			case DatabaseType.MARIADB:
				service.environment = {
					MYSQL_DATABASE: dbConfig.name,
					MYSQL_USER: dbConfig.username,
					MYSQL_PASSWORD: dbConfig.password,
					MYSQL_ROOT_PASSWORD: dbConfig.password,
				};
				break;
			case DatabaseType.MONGODB:
				service.environment = {
					MONGO_INITDB_DATABASE: dbConfig.name,
					MONGO_INITDB_ROOT_USERNAME: dbConfig.username,
					MONGO_INITDB_ROOT_PASSWORD: dbConfig.password,
				};
				break;
			case DatabaseType.REDIS:
				service.environment = {};
				break;
		}

		// Add health check
		service.healthcheck = {
			test: this.getDatabaseHealthCheck(dbConfig.type),
			interval: "30s",
			timeout: "3s",
			retries: 5,
		};

		return service;
	}

	/**
	 * Get database image
	 */
	private getDatabaseImage(dbConfig: any): string {
		const version = dbConfig.version || "latest";

		switch (dbConfig.type) {
			case DatabaseType.POSTGRESQL:
				return `postgres:${version}`;
			case DatabaseType.MYSQL:
				return `mysql:${version}`;
			case DatabaseType.MARIADB:
				return `mariadb:${version}`;
			case DatabaseType.MONGODB:
				return `mongo:${version}`;
			case DatabaseType.REDIS:
				return `redis:${version}`;
			case DatabaseType.CASSANDRA:
				return `cassandra:${version}`;
			case DatabaseType.ELASTICSEARCH:
				return `docker.elastic.co/elasticsearch/elasticsearch:${version}`;
			case DatabaseType.NEO4J:
				return `neo4j:${version}`;
			default:
				return `postgres:latest`;
		}
	}

	/**
	 * Get database health check command
	 */
	private getDatabaseHealthCheck(dbType: DatabaseType): string[] {
		switch (dbType) {
			case DatabaseType.POSTGRESQL:
				return ["CMD-SHELL", "pg_isready -U admin"];
			case DatabaseType.MYSQL:
			case DatabaseType.MARIADB:
				return ["CMD-SHELL", "mysqladmin ping -h localhost"];
			case DatabaseType.MONGODB:
				return ["CMD-SHELL", "mongosh --eval \"db.adminCommand('ping')\""];
			case DatabaseType.REDIS:
				return ["CMD", "redis-cli", "ping"];
			default:
				return ["CMD-SHELL", 'echo "healthy"'];
		}
	}

	/**
	 * Build compose file content
	 */
	private buildComposeFile(services: ComposeService[], volumes: Volume[], networks: Network[]): string {
		let content = `version: '3.9'

services:
`;

		// Add services
		for (const service of services) {
			content += `  ${service.name}:
`;

			if (service.build) {
				content += `    build:
      context: ${service.build.context}
      dockerfile: ${service.build.dockerfile}
`;
			} else if (service.image) {
				content += `    image: ${service.image}
`;
			}

			if (service.ports && service.ports.length > 0) {
				content += `    ports:
`;
				for (const port of service.ports) {
					content += `      - "${port}"
`;
				}
			}

			if (service.environment && Object.keys(service.environment).length > 0) {
				content += `    environment:
`;
				for (const [key, value] of Object.entries(service.environment)) {
					content += `      ${key}: ${value}
`;
				}
			}

			if (service.volumes && service.volumes.length > 0) {
				content += `    volumes:
`;
				for (const volume of service.volumes) {
					content += `      - ${volume}
`;
				}
			}

			if (service.depends_on && service.depends_on.length > 0) {
				content += `    depends_on:
`;
				for (const dep of service.depends_on) {
					content += `      ${dep}:
        condition: service_healthy
`;
				}
			}

			if (service.healthcheck) {
				content += `    healthcheck:
      test: [${service.healthcheck.test.map((t) => `"${t}"`).join(", ")}]
      interval: ${service.healthcheck.interval}
      timeout: ${service.healthcheck.timeout}
      retries: ${service.healthcheck.retries}
`;
			}

			if (service.restart) {
				content += `    restart: ${service.restart}
`;
			}

			if (service.networks && service.networks.length > 0) {
				content += `    networks:
`;
				for (const network of service.networks) {
					content += `      - ${network}
`;
				}
			}

			if (service.deploy) {
				content += `    deploy:
      resources:
`;
				if (service.deploy.resources?.limits) {
					content += `        limits:
`;
					if (service.deploy.resources.limits.cpus) {
						content += `          cpus: '${service.deploy.resources.limits.cpus}'
`;
					}
					if (service.deploy.resources.limits.memory) {
						content += `          memory: ${service.deploy.resources.limits.memory}
`;
					}
				}
			}

			content += "\n";
		}

		// Add volumes
		if (volumes.length > 0) {
			content += `volumes:
`;
			for (const volume of volumes) {
				content += `  ${volume.name}:
`;
				if (volume.driver) {
					content += `    driver: ${volume.driver}
`;
				}
			}
			content += "\n";
		}

		// Add networks
		if (networks.length > 0) {
			content += `networks:
`;
			for (const network of networks) {
				content += `  ${network.name}:
    driver: ${network.driver}
`;
			}
		}

		return content;
	}
}
