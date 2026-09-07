import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import type { ProjectAnalysis, DockerConfig, ComposeService, Volume, Network, MessageQueueConfig, AdditionalServiceConfig } from "../../types/interfaces.js";
import { DatabaseType } from "../../types/interfaces.js";

export class ComposeGenerator {
	public generate(analysis: ProjectAnalysis, config: DockerConfig): string {
		const services: ComposeService[] = [];
		const volumes: Volume[] = [];
		const networks: Network[] = [];
		const usedServiceNames = new Set<string>();
		const usedPorts = new Set<number>();

		const useEnvFile = config.generateEnvFile !== false;
		const appPort = config.port || analysis.port || 8080;
		usedPorts.add(appPort);

		const appService = this.generateAppService(analysis, config, useEnvFile);
		services.push(appService);
		usedServiceNames.add(appService.name);

		if (config.databases && config.databases.length > 0) {
			for (let i = 0; i < config.databases.length; i++) {
				const db = config.databases[i];
				if (db.type !== DatabaseType.NONE) {
					const serviceName = i === 0 ? db.type : `${db.type}-${i + 1}`;
					if (!usedServiceNames.has(serviceName)) {
						let externalPort = db.externalPort || db.port;
						if (usedPorts.has(externalPort)) {
							externalPort = this.findAvailablePort(externalPort, usedPorts);
						}
						usedPorts.add(externalPort);

						const dbService = this.generateDatabaseService(db, serviceName, externalPort);
						services.push(dbService);
						volumes.push({ name: `${serviceName}-data`, driver: "local" });
						usedServiceNames.add(serviceName);
					}
				}
			}
		} else if (config.database && config.database.type !== DatabaseType.NONE) {
			const serviceName = config.database.type;
			if (!usedServiceNames.has(serviceName)) {
				let externalPort = config.database.externalPort || config.database.port;
				if (usedPorts.has(externalPort)) {
					externalPort = this.findAvailablePort(externalPort, usedPorts);
				}
				usedPorts.add(externalPort);

				const dbService = this.generateDatabaseService(config.database, serviceName, externalPort);
				services.push(dbService);
				volumes.push({ name: `${serviceName}-data`, driver: "local" });
				usedServiceNames.add(serviceName);
			}
		}

		if (config.messageQueues && config.messageQueues.length > 0) {
			for (let i = 0; i < config.messageQueues.length; i++) {
				const mq = config.messageQueues[i];
				const serviceName = i === 0 ? mq.type : `${mq.type}-${i + 1}`;
				if (!usedServiceNames.has(serviceName)) {
					let externalPort = mq.externalPort || mq.port;
					if (usedPorts.has(externalPort)) {
						externalPort = this.findAvailablePort(externalPort, usedPorts);
					}
					usedPorts.add(externalPort);

					const mqService = this.generateMessageQueueService(mq, serviceName, externalPort);
					services.push(mqService);
					volumes.push({ name: `${serviceName}-data`, driver: "local" });
					usedServiceNames.add(serviceName);
				}
			}
		}

		if (config.additionalServices && config.additionalServices.length > 0) {
			for (let i = 0; i < config.additionalServices.length; i++) {
				const svc = config.additionalServices[i];
				const realServices = ["nginx", "grafana", "prometheus", "keycloak", "minio"];
				if (realServices.includes(svc.type)) {
					const serviceName = i === 0 ? svc.type : `${svc.type}-${i + 1}`;
					if (!usedServiceNames.has(serviceName)) {
						let externalPort = svc.externalPort || svc.port;
						if (usedPorts.has(externalPort)) {
							externalPort = this.findAvailablePort(externalPort, usedPorts);
						}
						usedPorts.add(externalPort);

						const addService = this.generateAdditionalService(svc, serviceName, externalPort);
						services.push(addService);
						if (svc.type !== "nginx") {
							volumes.push({ name: `${serviceName}-data`, driver: "local" });
						}
						usedServiceNames.add(serviceName);
					}
				}
			}
		}

		networks.push({ name: "dockeryzen-network", driver: "bridge" });

		return this.buildComposeFile(services, volumes, networks);
	}

	private findAvailablePort(startPort: number, usedPorts: Set<number>): number {
		let port = startPort;
		while (usedPorts.has(port)) {
			port++;
		}
		return port;
	}

	private generateAppService(analysis: ProjectAnalysis, config: DockerConfig, useEnvFile: boolean): ComposeService {
		const port = config.port || analysis.port || 8080;
		const service: ComposeService = {
			name: "app",
			build: { context: ".", dockerfile: "Dockerfile" },
			ports: [`${port}:${port}`],
			environment: {},
			volumes: [],
			depends_on: [],
			restart: "unless-stopped",
			networks: ["dockeryzen-network"],
			logging: {
				driver: "json-file",
				options: {
					"max-size": "10m",
					"max-file": "3",
				},
			},
		};

		if (config.enableDebug) {
			service.ports.push(`${config.debugPort || 5005}:${config.debugPort || 5005}`);
		}

		// Spring Boot Actuator
		service.environment["MANAGEMENT_ENDPOINTS_WEB_EXPOSURE_INCLUDE"] = "health,info,metrics";
		service.environment["MANAGEMENT_ENDPOINT_HEALTH_SHOW_DETAILS"] = "always";

		if (config.databases && config.databases.length > 0) {
			for (let i = 0; i < config.databases.length; i++) {
				const db = config.databases[i];
				if (db.type !== DatabaseType.NONE) {
					const serviceName = i === 0 ? db.type : `${db.type}-${i + 1}`;
					service.depends_on.push(serviceName);

					if (!useEnvFile) {
						this.addDatabaseEnvVars(service, db, serviceName);
					}
				}
			}
		} else if (config.database && config.database.type !== DatabaseType.NONE) {
			const db = config.database;
			const serviceName = db.type;
			service.depends_on.push(serviceName);

			if (!useEnvFile) {
				this.addDatabaseEnvVars(service, db, serviceName);
			}
		}

		if (config.messageQueues && config.messageQueues.length > 0) {
			for (let i = 0; i < config.messageQueues.length; i++) {
				const mq = config.messageQueues[i];
				const serviceName = i === 0 ? mq.type : `${mq.type}-${i + 1}`;
				service.depends_on.push(serviceName);

				if (!useEnvFile) {
					this.addMessageQueueEnvVars(service, mq, serviceName);
				}
			}
		}

		if (useEnvFile) {
			service.env_file = [".env"];
		}

		if (config.enableHealthCheck !== false) {
			const healthEndpoint = analysis.outputType === "war" ? `http://localhost:${port}/` : `http://localhost:${port}${config.healthCheckEndpoint || "/actuator/health"}`;
			service.healthcheck = {
				test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", healthEndpoint],
				interval: "30s",
				timeout: "3s",
				retries: 3,
				start_period: "30s",
			};
		}

		return service;
	}

	private addDatabaseEnvVars(service: ComposeService, db: any, serviceName: string): void {
		const jdbcUrls: Record<string, string> = {
			postgresql: `jdbc:postgresql://${serviceName}:${db.port}/${db.name}`,
			mysql: `jdbc:mysql://${serviceName}:${db.port}/${db.name}?useSSL=false&serverTimezone=UTC`,
			mariadb: `jdbc:mariadb://${serviceName}:${db.port}/${db.name}`,
			mongodb: `mongodb://${db.username}:${db.password}@${serviceName}:${db.port}/${db.name}?authSource=admin`,
			redis: `redis://${serviceName}:${db.port}`,
			cassandra: `cassandra://${serviceName}:${db.port}/${db.name}`,
			elasticsearch: `http://${serviceName}:${db.port}`,
			neo4j: `bolt://${serviceName}:${db.port}`,
			h2: `jdbc:h2:mem:${db.name}`,
		};

		if (db.type === "postgresql" || db.type === "mysql" || db.type === "mariadb" || db.type === "h2") {
			service.environment["SPRING_DATASOURCE_URL"] = jdbcUrls[db.type];
			service.environment["SPRING_DATASOURCE_USERNAME"] = db.username;
			service.environment["SPRING_DATASOURCE_PASSWORD"] = db.password;
		} else if (db.type === "mongodb") {
			service.environment["SPRING_DATA_MONGODB_URI"] = jdbcUrls[db.type];
			service.environment["SPRING_DATA_MONGODB_DATABASE"] = db.name;
		} else if (db.type === "redis") {
			service.environment["SPRING_DATA_REDIS_HOST"] = serviceName;
			service.environment["SPRING_DATA_REDIS_PORT"] = db.port.toString();
		} else if (db.type === "cassandra") {
			service.environment["SPRING_DATA_CASSANDRA_CONTACT_POINTS"] = serviceName;
			service.environment["SPRING_DATA_CASSANDRA_PORT"] = db.port.toString();
			service.environment["SPRING_DATA_CASSANDRA_KEYSPACE_NAME"] = db.name;
			service.environment["SPRING_DATA_CASSANDRA_USERNAME"] = db.username;
			service.environment["SPRING_DATA_CASSANDRA_PASSWORD"] = db.password;
		} else if (db.type === "elasticsearch") {
			service.environment["SPRING_ELASTICSEARCH_URIS"] = jdbcUrls[db.type];
			service.environment["SPRING_ELASTICSEARCH_USERNAME"] = db.username;
			service.environment["SPRING_ELASTICSEARCH_PASSWORD"] = db.password;
		} else if (db.type === "neo4j") {
			service.environment["SPRING_NEO4J_URI"] = jdbcUrls[db.type];
			service.environment["SPRING_NEO4J_AUTHENTICATION_USERNAME"] = db.username;
			service.environment["SPRING_NEO4J_AUTHENTICATION_PASSWORD"] = db.password;
		}
	}

	private addMessageQueueEnvVars(service: ComposeService, mq: any, serviceName: string): void {
		switch (mq.type) {
			case "rabbitmq":
				service.environment["SPRING_RABBITMQ_HOST"] = serviceName;
				service.environment["SPRING_RABBITMQ_PORT"] = (mq.port || 5672).toString();
				service.environment["SPRING_RABBITMQ_USERNAME"] = mq.username || "guest";
				service.environment["SPRING_RABBITMQ_PASSWORD"] = mq.password || "guest";
				break;
			case "kafka":
				service.environment["SPRING_KAFKA_BOOTSTRAP_SERVERS"] = `${serviceName}:${mq.port || 9092}`;
				break;
			case "activemq":
				service.environment["SPRING_ACTIVEMQ_BROKER_URL"] = `tcp://${serviceName}:${mq.port || 61616}`;
				break;
		}
	}

	private generateDatabaseService(dbConfig: any, serviceName: string, externalPort: number): ComposeService {
		const service: ComposeService = {
			name: serviceName,
			image: this.getDatabaseImage(dbConfig),
			ports: [`${externalPort}:${dbConfig.port}`],
			environment: {},
			volumes: [`${serviceName}-data:${this.getDatabaseVolumePath(dbConfig.type)}`],
			depends_on: [],
			restart: "unless-stopped",
			networks: ["dockeryzen-network"],
			logging: {
				driver: "json-file",
				options: {
					"max-size": "10m",
					"max-file": "3",
				},
			},
		};

		switch (dbConfig.type) {
			case "postgresql":
				service.environment = {
					POSTGRES_DB: dbConfig.name || "appdb",
					POSTGRES_USER: dbConfig.username || "admin",
					POSTGRES_PASSWORD: dbConfig.password || "password",
					POSTGRES_INITDB_ARGS: "--encoding=UTF8 --locale=C",
				};
				service.volumes = [`${serviceName}-data:/var/lib/postgresql/data`, `./docker/${serviceName}/init:/docker-entrypoint-initdb.d:ro`];
				break;
			case "mysql":
				service.environment = {
					MYSQL_DATABASE: dbConfig.name || "appdb",
					MYSQL_USER: dbConfig.username || "admin",
					MYSQL_PASSWORD: dbConfig.password || "password",
					MYSQL_ROOT_PASSWORD: dbConfig.password || "password",
				};
				service.volumes = [`${serviceName}-data:/var/lib/mysql`, `./docker/${serviceName}/init:/docker-entrypoint-initdb.d:ro`];
				break;
			case "mariadb":
				service.environment = {
					MARIADB_DATABASE: dbConfig.name || "appdb",
					MARIADB_USER: dbConfig.username || "admin",
					MARIADB_PASSWORD: dbConfig.password || "password",
					MARIADB_ROOT_PASSWORD: dbConfig.password || "password",
				};
				service.volumes = [`${serviceName}-data:/var/lib/mysql`, `./docker/${serviceName}/init:/docker-entrypoint-initdb.d:ro`];
				break;
			case "mongodb":
				service.environment = {
					MONGO_INITDB_DATABASE: dbConfig.name || "appdb",
					MONGO_INITDB_ROOT_USERNAME: dbConfig.username || "admin",
					MONGO_INITDB_ROOT_PASSWORD: dbConfig.password || "password",
				};
				service.volumes = [`${serviceName}-data:/data/db`, `./docker/${serviceName}/init:/docker-entrypoint-initdb.d:ro`];
				break;
			case "redis":
				if (dbConfig.password && dbConfig.password !== "password") {
					service.environment = {
						REDIS_PASSWORD: dbConfig.password,
					};
				}
				service.volumes = [`${serviceName}-data:/data`];
				break;
			case "cassandra":
				service.environment = {
					CASSANDRA_USER: dbConfig.username || "admin",
					CASSANDRA_PASSWORD: dbConfig.password || "password",
				};
				service.volumes = [`${serviceName}-data:/var/lib/cassandra`];
				break;
			case "elasticsearch":
				service.environment = {
					"discovery.type": "single-node",
					ES_JAVA_OPTS: "-Xms512m -Xmx512m",
					"xpack.security.enabled": "false",
				};
				service.volumes = [`${serviceName}-data:/usr/share/elasticsearch/data`];
				break;
			case "neo4j":
				service.environment = {
					NEO4J_AUTH: `${dbConfig.username || "neo4j"}/${dbConfig.password || "password"}`,
					NEO4J_dbms_memory_heap_max__size: "512m",
				};
				service.volumes = [`${serviceName}-data:/data`, `./docker/${serviceName}/plugins:/plugins`];
				break;
		}

		service.healthcheck = {
			test: this.getDatabaseHealthCheck(dbConfig.type, dbConfig),
			interval: "10s",
			timeout: "5s",
			retries: 5,
			start_period: "30s",
		};

		return service;
	}

	private generateMessageQueueService(mqConfig: any, serviceName: string, externalPort: number): ComposeService {
		const service: ComposeService = {
			name: serviceName,
			image: this.getMessageQueueImage(mqConfig),
			ports: [`${externalPort}:${mqConfig.port}`],
			environment: {},
			volumes: [`${serviceName}-data:${this.getMessageQueueVolumePath(mqConfig.type)}`],
			depends_on: [],
			restart: "unless-stopped",
			networks: ["dockeryzen-network"],
			logging: {
				driver: "json-file",
				options: {
					"max-size": "10m",
					"max-file": "3",
				},
			},
		};

		if (mqConfig.type === "kafka") {
			const kafkaPort = mqConfig.port || 9092;
			const controllerPort = kafkaPort + 1;

			service.ports = [`${externalPort}:${kafkaPort}`, `${externalPort + 1}:${controllerPort}`];

			service.environment = {
				KAFKA_NODE_ID: "1",
				KAFKA_PROCESS_ROLES: "broker,controller",
				KAFKA_CONTROLLER_LISTENER_NAMES: "CONTROLLER",
				KAFKA_LISTENERS: `PLAINTEXT://:${kafkaPort},CONTROLLER://:${controllerPort}`,
				KAFKA_ADVERTISED_LISTENERS: `PLAINTEXT://${serviceName}:${kafkaPort}`,
				KAFKA_CONTROLLER_QUORUM_VOTERS: `1@${serviceName}:${controllerPort}`,
				KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: "PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT",
				KAFKA_INTER_BROKER_LISTENER_NAME: "PLAINTEXT",
				KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1",
				KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: "1",
				KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: "1",
				KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: "0",
				KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true",
				KAFKA_DELETE_TOPIC_ENABLE: "true",
				KAFKA_LOG_DIRS: "/var/lib/kafka/data",
				KAFKA_LOG_RETENTION_HOURS: "168",
				KAFKA_LOG_SEGMENT_BYTES: "1073741824",
			};
		} else if (mqConfig.type === "rabbitmq") {
			service.environment = {
				RABBITMQ_DEFAULT_USER: mqConfig.username || "guest",
				RABBITMQ_DEFAULT_PASS: mqConfig.password || "guest",
			};
		}

		service.healthcheck = {
			test: this.getMessageQueueHealthCheck(mqConfig.type),
			interval: "10s",
			timeout: "5s",
			retries: 5,
			start_period: "30s",
		};

		return service;
	}

	private generateAdditionalService(svcConfig: any, serviceName: string, externalPort: number): ComposeService {
		const service: ComposeService = {
			name: serviceName,
			image: this.getAdditionalServiceImage(svcConfig),
			ports: [`${externalPort}:${svcConfig.port}`],
			environment: {},
			volumes: [],
			depends_on: [],
			restart: "unless-stopped",
			networks: ["dockeryzen-network"],
			logging: {
				driver: "json-file",
				options: {
					"max-size": "10m",
					"max-file": "3",
				},
			},
		};

		switch (svcConfig.type) {
			case "nginx":
				service.volumes = [`./nginx/nginx.conf:/etc/nginx/nginx.conf:ro`, `./nginx/conf.d:/etc/nginx/conf.d:ro`];
				break;
			case "grafana":
				service.environment = {
					GF_SECURITY_ADMIN_PASSWORD: svcConfig.password || "admin",
					GF_USERS_ALLOW_SIGN_UP: "false",
				};
				service.volumes = [`${serviceName}-data:/var/lib/grafana`, `./grafana/dashboards:/etc/grafana/dashboards:ro`];
				break;
			case "prometheus":
				service.volumes = [`./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro`, `${serviceName}-data:/prometheus`];
				break;
			case "keycloak":
				service.environment = {
					KEYCLOAK_ADMIN: svcConfig.username || "admin",
					KEYCLOAK_ADMIN_PASSWORD: svcConfig.password || "admin",
				};
				service.volumes = [`${serviceName}-data:/opt/keycloak/data`];
				break;
			case "minio":
				service.environment = {
					MINIO_ROOT_USER: svcConfig.username || "minioadmin",
					MINIO_ROOT_PASSWORD: svcConfig.password || "minioadmin",
				};
				service.volumes = [`${serviceName}-data:/data`];
				break;
		}

		if (svcConfig.type === "grafana" || svcConfig.type === "prometheus") {
			service.healthcheck = {
				test: svcConfig.type === "grafana" ? ["CMD", "wget", "--spider", `http://localhost:${svcConfig.port}/api/health`] : ["CMD", "wget", "--spider", `http://localhost:${svcConfig.port}/-/healthy`],
				interval: "10s",
				timeout: "5s",
				retries: 5,
				start_period: "30s",
			};
		}

		return service;
	}

	private getDatabaseImage(dbConfig: any): string {
		const type = dbConfig.type.toLowerCase();
		const version = dbConfig.version || "latest";
		const useAlpine = dbConfig.useAlpine || false;

		const images: Record<string, string> = {
			postgresql: "postgres",
			mysql: "mysql",
			mariadb: "mariadb",
			mongodb: "mongo",
			redis: "redis",
			cassandra: "cassandra",
			elasticsearch: "docker.elastic.co/elasticsearch/elasticsearch",
			neo4j: "neo4j",
		};

		const baseImage = images[type] || "postgres";

		if (useAlpine && !version.includes("-alpine") && type !== "elasticsearch" && type !== "neo4j") {
			return `${baseImage}:${version}-alpine`;
		}

		return `${baseImage}:${version}`;
	}

	private getMessageQueueImage(mqConfig: any): string {
		const type = mqConfig.type;
		const version = mqConfig.version || "latest";
		const useAlpine = mqConfig.useAlpine || false;

		const images: Record<string, string> = {
			kafka: "confluentinc/cp-kafka",
			rabbitmq: "rabbitmq",
			activemq: "apache/activemq-classic",
		};

		const baseImage = images[type] || "rabbitmq";

		if (useAlpine && type !== "kafka" && !version.includes("-alpine")) {
			return `${baseImage}:${version}-alpine`;
		}

		return `${baseImage}:${version}`;
	}

	private getAdditionalServiceImage(svcConfig: any): string {
		const type = svcConfig.type;
		const version = svcConfig.version || "latest";
		const useAlpine = svcConfig.useAlpine || false;

		const images: Record<string, string> = {
			nginx: "nginx",
			grafana: "grafana/grafana",
			prometheus: "prom/prometheus",
			keycloak: "quay.io/keycloak/keycloak",
			minio: "minio/minio",
		};

		const baseImage = images[type] || "nginx";

		if (useAlpine && !version.includes("-alpine") && type !== "keycloak") {
			return `${baseImage}:${version}-alpine`;
		}

		return `${baseImage}:${version}`;
	}

	private getDatabaseVolumePath(dbType: string): string {
		const paths: Record<string, string> = {
			postgresql: "/var/lib/postgresql/data",
			mysql: "/var/lib/mysql",
			mariadb: "/var/lib/mysql",
			mongodb: "/data/db",
			redis: "/data",
			cassandra: "/var/lib/cassandra",
			elasticsearch: "/usr/share/elasticsearch/data",
			neo4j: "/data",
		};
		return paths[dbType] || "/data";
	}

	private getMessageQueueVolumePath(mqType: string): string {
		const paths: Record<string, string> = {
			kafka: "/var/lib/kafka/data",
			rabbitmq: "/var/lib/rabbitmq",
			activemq: "/opt/activemq/data",
		};
		return paths[mqType] || "/data";
	}

	private getDatabaseHealthCheck(dbType: string, dbConfig?: any): string[] {
		switch (dbType) {
			case "postgresql":
				return ["CMD-SHELL", `pg_isready -U ${dbConfig?.username || "admin"} -d ${dbConfig?.name || "appdb"}`];
			case "mysql":
			case "mariadb":
				return ["CMD-SHELL", "mysqladmin ping -h localhost -u root -p${MYSQL_ROOT_PASSWORD:-password}"];
			case "mongodb":
				return ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand({ ping: 1 })"];
			case "redis":
				if (dbConfig?.password && dbConfig.password !== "password") {
					return ["CMD", "redis-cli", "-a", dbConfig.password, "ping"];
				}
				return ["CMD", "redis-cli", "ping"];
			case "cassandra":
				return ["CMD-SHELL", "cqlsh -e 'DESCRIBE system'"];
			case "elasticsearch":
				return ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"];
			case "neo4j":
				return ["CMD-SHELL", "cypher-shell -u neo4j -p neo4j 'RETURN 1' || exit 1"];
			default:
				return ["CMD-SHELL", "echo 'healthy'"];
		}
	}

	private getMessageQueueHealthCheck(mqType: string): string[] {
		switch (mqType) {
			case "kafka":
				return ["CMD-SHELL", "kafka-topics --bootstrap-server localhost:9092 --list"];
			case "rabbitmq":
				return ["CMD", "rabbitmq-diagnostics", "ping"];
			case "activemq":
				return ["CMD-SHELL", "curl -f http://localhost:8161/ || exit 1"];
			default:
				return ["CMD-SHELL", "echo 'healthy'"];
		}
	}

	private buildComposeFile(services: ComposeService[], volumes: Volume[], networks: Network[]): string {
		let content = `version: '3.9'

services:
`;

		const uniqueVolumes = volumes.filter((vol, index, self) => index === self.findIndex((v) => v.name === vol.name));

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

			if (service.env_file && service.env_file.length > 0) {
				content += `    env_file:
`;
				for (const envFile of service.env_file) {
					content += `      - ${envFile}
`;
				}
			} else if (service.environment && Object.keys(service.environment).length > 0) {
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
				if (service.healthcheck.start_period) {
					content += `      start_period: ${service.healthcheck.start_period}
`;
				}
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

			if (service.logging) {
				content += `    logging:
      driver: ${service.logging.driver}
      options:
`;
				for (const [key, value] of Object.entries(service.logging.options)) {
					content += `        ${key}: "${value}"
`;
				}
			}

			content += "\n";
		}

		if (uniqueVolumes.length > 0) {
			content += `volumes:
`;
			for (const volume of uniqueVolumes) {
				content += `  ${volume.name}:
    driver: ${volume.driver || "local"}
`;
			}
			content += "\n";
		}

		if (networks.length > 0) {
			content += `networks:
`;
			for (const network of networks) {
				content += `  ${network.name}:
    driver: ${network.driver}
    ipam:
      config:
        - subnet: 172.28.0.0/16
`;
			}
		}

		return content;
	}
}
