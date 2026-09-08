import { ProjectConfig } from "../types/index.js";

export class DockerComposeGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const services: string[] = [];
		const volumes: string[] = [];

		// Main application service
		services.push(this.generateMainService());

		// Database services
		if (this.config.databases.length > 0) {
			for (const db of this.config.databases) {
				services.push(this.generateDatabaseService(db));
				if (!db.useExternalUrl) {
					const volumeName = `${this.config.projectName}-${db.type}-data`.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
					volumes.push(`  ${volumeName}:\n    driver: local`);
				}
			}
		}

		// Message queue services
		if (this.config.messageQueues.length > 0) {
			for (const mq of this.config.messageQueues) {
				services.push(this.generateMessageQueueService(mq));
			}
		}

		// Additional services
		if (this.config.services.length > 0) {
			for (const service of this.config.services) {
				services.push(this.generateAdditionalService(service));
			}
		}

		return `version: '3.8'

services:
${services.join("\n")}

networks:
  dockeryzen-network:
    driver: bridge

volumes:
${volumes.length > 0 ? volumes.join("\n") : "  data:\n    driver: local"}`;
	}

	private generateMainService(): string {
		const serviceName = this.config.projectName.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
		const ports = [`      - "${this.config.port}:${this.config.port}"`];

		if (this.config.enableDebug) {
			ports.push(`      - "5005:5005"`);
		}

		let envVars = "";
		if (this.config.language.startsWith("java")) {
			envVars = `
      - SPRING_PROFILES_ACTIVE=production
      - JAVA_OPTS=-Xms512m -Xmx1024m`;
		} else if (this.config.language.startsWith("js")) {
			envVars = `
      - NODE_ENV=production
      - PORT=${this.config.port}`;
		} else if (this.config.language === "python") {
			envVars = `
      - PYTHONUNBUFFERED=1
      - PORT=${this.config.port}`;
		}

		return `  ${serviceName}:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
${ports.join("\n")}
    environment:${envVars}
    networks:
      - dockeryzen-network`;
	}

	private generateDatabaseService(db: any): string {
		if (db.useExternalUrl) {
			return `  # External ${db.type} database
  # URL: ${db.url}`;
		}

		const serviceName = `${this.config.projectName}-${db.type}`.toLowerCase().replace(/[^a-z0-9-_]/g, "-");

		const imageMap: Record<string, string> = {
			postgresql: "postgres",
			mysql: "mysql",
			mariadb: "mariadb",
			mongodb: "mongo",
			redis: "redis",
			elasticsearch: "docker.elastic.co/elasticsearch/elasticsearch",
			cassandra: "cassandra",
			neo4j: "neo4j",
			influxdb: "influxdb",
			qdrant: "qdrant/qdrant",
			cockroachdb: "cockroachdb/cockroach",
			couchdb: "couchdb",
			dynamodb: "amazon/dynamodb-local",
			solr: "solr",
			meilisearch: "getmeili/meilisearch",
			milvus: "milvusdb/milvus",
			oracle: "oraclelinux",
			mssql: "mcr.microsoft.com/mssql/server",
			db2: "ibmcom/db2",
		};

		const image = imageMap[db.type] || db.type;
		const imageTag = db.useAlpine ? `${db.version}-alpine` : db.version;

		let service = `  ${serviceName}:
    image: ${image}:${imageTag}
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
      - "${db.externalPort}:${db.internalPort}"
    environment:`;

		if (db.type === "postgresql" || db.type === "timescaledb") {
			service += `
      - POSTGRES_DB=${db.databaseName || "postgres"}
      - POSTGRES_USER=${db.username || "postgres"}
      - POSTGRES_PASSWORD=${db.password || "root"}`;
		} else if (db.type === "mysql" || db.type === "mariadb") {
			service += `
      - MYSQL_DATABASE=${db.databaseName || "mysql"}
      - MYSQL_USER=${db.username || "root"}
      - MYSQL_PASSWORD=${db.password || "root"}
      - MYSQL_ROOT_PASSWORD=${db.password || "root"}`;
		} else if (db.type === "mongodb") {
			service += `
      - MONGO_INITDB_ROOT_USERNAME=${db.username || "root"}
      - MONGO_INITDB_ROOT_PASSWORD=${db.password || "root"}`;
		} else if (db.type === "redis") {
			service += `
      - REDIS_PASSWORD=${db.password || "root"}`;
		} else if (db.type === "mssql") {
			service += `
      - ACCEPT_EULA=Y
      - SA_PASSWORD=${db.password || "Root1234!"}`;
		} else if (db.type === "neo4j") {
			service += `
      - NEO4J_AUTH=${db.username || "neo4j"}/${db.password || "password"}`;
		} else if (db.type === "elasticsearch") {
			service += `
      - discovery.type=single-node
      - xpack.security.enabled=false`;
		} else if (db.type === "cassandra") {
			service += `
      - CASSANDRA_USER=${db.username || "cassandra"}
      - CASSANDRA_PASSWORD=${db.password || "cassandra"}`;
		}

		service += `
    volumes:
      - ${serviceName}-data:/var/lib/${db.type === "postgresql" ? "postgresql" : db.type}
    networks:
      - dockeryzen-network`;

		return service;
	}

	private generateMessageQueueService(mq: any): string {
		const serviceName = `${this.config.projectName}-${mq.type}`.toLowerCase().replace(/[^a-z0-9-_]/g, "-");

		const imageMap: Record<string, string> = {
			kafka: "confluentinc/cp-kafka",
			rabbitmq: "rabbitmq",
			activemq: "apache/activemq-artemis",
		};

		const image = imageMap[mq.type] || mq.type;
		const imageTag = mq.useAlpine ? `${mq.version}-alpine` : mq.version;

		let service = `  ${serviceName}:
    image: ${image}:${imageTag}
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
      - "${mq.externalPort}:${mq.internalPort}"
    environment:`;

		if (mq.type === "kafka") {
			service += `
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://${serviceName}:${mq.internalPort}
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1`;
		} else if (mq.type === "rabbitmq") {
			service += `
      - RABBITMQ_DEFAULT_USER=guest
      - RABBITMQ_DEFAULT_PASS=guest`;
		}

		service += `
    networks:
      - dockeryzen-network`;

		return service;
	}

	private generateAdditionalService(service: any): string {
		const serviceName = `${this.config.projectName}-${service.type}`.toLowerCase().replace(/[^a-z0-9-_]/g, "-");

		const imageMap: Record<string, string> = {
			nginx: "nginx",
			grafana: "grafana/grafana",
			prometheus: "prom/prometheus",
			keycloak: "quay.io/keycloak/keycloak",
			minio: "minio/minio",
		};

		const image = imageMap[service.type] || service.type;
		const imageTag = service.useAlpine ? `${service.version}-alpine` : service.version;

		let serviceConfig = `  ${serviceName}:
    image: ${image}:${imageTag}
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
      - "${service.externalPort}:${service.internalPort}"`;

		if (service.type === "keycloak") {
			serviceConfig += `
    environment:
      - KEYCLOAK_ADMIN=admin
      - KEYCLOAK_ADMIN_PASSWORD=admin`;
		} else if (service.type === "minio") {
			serviceConfig += `
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin`;
		}

		serviceConfig += `
    networks:
      - dockeryzen-network`;

		return serviceConfig;
	}
}
