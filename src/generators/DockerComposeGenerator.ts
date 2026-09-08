import { ProjectConfig } from "../types/index.js";

export class DockerComposeGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const services: string[] = [];

		// Main application service
		services.push(this.generateMainService());

		// Database services
		if (this.config.databases.length > 0) {
			for (const db of this.config.databases) {
				services.push(this.generateDatabaseService(db));
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
  data:
    driver: local`;
	}

	private generateMainService(): string {
		const serviceName = this.config.projectName.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
		const ports = [`      - "${this.config.port}:${this.config.port}"`];

		if (this.config.enableDebug) {
			ports.push(`      - "5005:5005"`);
		}

		return `  ${serviceName}:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
${ports.join("\n")}
    environment:
      - NODE_ENV=production
      - PORT=${this.config.port}
    networks:
      - dockeryzen-network`;
	}

	private generateDatabaseService(db: any): string {
		const serviceName = `${this.config.projectName}-${db.type}`.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
		const imageMap: Record<string, string> = {
			postgresql: "postgres",
			mysql: "mysql",
			mariadb: "mariadb",
			oracle: "oraclelinux",
			mssql: "mcr.microsoft.com/mssql/server",
			db2: "ibmcom/db2",
			mongodb: "mongo",
			couchdb: "couchdb",
			couchbase: "couchbase",
			dynamodb: "amazon/dynamodb-local",
			ravendb: "ravendb/ravendb",
			redis: "redis",
			memcached: "memcached",
			etcd: "quay.io/coreos/etcd",
			aerospike: "aerospike/aerospike-server",
			cassandra: "cassandra",
			scylladb: "scylladb/scylla",
			hbase: "harisekhon/hbase",
			bigtable: "google/cloud-sdk",
			neo4j: "neo4j",
			arangodb: "arangodb",
			janusgraph: "janusgraph/janusgraph",
			dgraph: "dgraph/dgraph",
			influxdb: "influxdb",
			timescaledb: "timescale/timescaledb",
			prometheus: "prom/prometheus",
			opentsdb: "opentsdb/opentsdb",
			elasticsearch: "docker.elastic.co/elasticsearch/elasticsearch",
			solr: "solr",
			meilisearch: "getmeili/meilisearch",
			typesense: "typesense/typesense",
			cockroachdb: "cockroachdb/cockroach",
			tidb: "pingcap/tidb",
			yugabytedb: "yugabytedb/yugabyte",
			pinecone: "pinecone/pinecone",
			weaviate: "semitechnologies/weaviate",
			qdrant: "qdrant/qdrant",
			milvus: "milvusdb/milvus",
			chroma: "chromadb/chroma",
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

		// Add environment variables based on database type
		if (db.type === "postgresql" || db.type === "timescaledb") {
			service += `
      - POSTGRES_DB=${db.databaseName || "mydb"}
      - POSTGRES_USER=${db.username || "postgres"}
      - POSTGRES_PASSWORD=${db.password || "root"}`;
		} else if (db.type === "mysql" || db.type === "mariadb") {
			service += `
      - MYSQL_DATABASE=${db.databaseName || "mydb"}
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
		}

		service += `
    volumes:
      - ${serviceName}-data:/var/lib/${db.type}
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

		return `  ${serviceName}:
    image: ${image}:${imageTag}
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
      - "${mq.externalPort}:${mq.internalPort}"
    environment:
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://${serviceName}:${mq.internalPort}
    networks:
      - dockeryzen-network`;
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

		return `  ${serviceName}:
    image: ${image}:${imageTag}
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
      - "${service.externalPort}:${service.internalPort}"
    networks:
      - dockeryzen-network`;
	}
}
