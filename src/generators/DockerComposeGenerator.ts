import { ProjectConfig } from "../types/index.js";

export class DockerComposeGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const services: string[] = [];
		const volumes: string[] = [];
		const usedPorts = new Set<number>();
		const usedServiceNames = new Set<string>();

		// Check for port conflicts
		this.checkPortConflicts();

		// Main application service
		services.push(this.generateMainService());
		usedPorts.add(this.config.port);
		if (this.config.enableDebug) {
			usedPorts.add(5005);
		}

		// Database services
		if (this.config.databases.length > 0) {
			for (const db of this.config.databases) {
				if (!db.useExternalUrl) {
					const service = this.generateDatabaseService(db);
					const serviceName = this.getServiceName(db.type);

					if (!usedServiceNames.has(serviceName)) {
						services.push(service);
						usedServiceNames.add(serviceName);

						const volumeName = `${this.config.projectName}-${db.type}-data`.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
						volumes.push(`  ${volumeName}:\n    driver: local`);
					}
				}
			}
		}

		// Message queue services
		if (this.config.messageQueues.length > 0) {
			for (const mq of this.config.messageQueues) {
				const service = this.generateMessageQueueService(mq);
				const serviceName = this.getServiceName(mq.type);

				if (!usedServiceNames.has(serviceName)) {
					services.push(service);
					usedServiceNames.add(serviceName);
				}
			}
		}

		// Additional services
		if (this.config.services.length > 0) {
			for (const service of this.config.services) {
				const serviceConfig = this.generateAdditionalService(service);
				const serviceName = this.getServiceName(service.type);

				if (!usedServiceNames.has(serviceName)) {
					services.push(serviceConfig);
					usedServiceNames.add(serviceName);
				}
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

	private getServiceName(type: string): string {
		return `${this.config.projectName}-${type}`.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
	}

	private checkPortConflicts(): void {
		const allPorts = new Map<number, string>();

		// Main app port
		allPorts.set(this.config.port, "Main Application");
		if (this.config.enableDebug) {
			allPorts.set(5005, "Debug Port");
		}

		// Database ports
		for (const db of this.config.databases) {
			if (!db.useExternalUrl) {
				if (allPorts.has(db.externalPort)) {
					console.warn(`Port conflict: ${db.type} uses port ${db.externalPort} which is already used by ${allPorts.get(db.externalPort)}`);
					db.externalPort = this.findFreePort(db.externalPort, allPorts);
				}
				allPorts.set(db.externalPort, `${db.type} Database`);
			}
		}

		// Message queue ports
		for (const mq of this.config.messageQueues) {
			if (allPorts.has(mq.externalPort)) {
				console.warn(`Port conflict: ${mq.type} uses port ${mq.externalPort} which is already used by ${allPorts.get(mq.externalPort)}`);
				mq.externalPort = this.findFreePort(mq.externalPort, allPorts);
			}
			allPorts.set(mq.externalPort, `${mq.type} Message Queue`);
		}

		// Service ports
		for (const service of this.config.services) {
			if (allPorts.has(service.externalPort)) {
				console.warn(`Port conflict: ${service.type} uses port ${service.externalPort} which is already used by ${allPorts.get(service.externalPort)}`);
				service.externalPort = this.findFreePort(service.externalPort, allPorts);
			}
			allPorts.set(service.externalPort, `${service.type} Service`);
		}
	}

	private findFreePort(startPort: number, usedPorts: Map<number, string>): number {
		let port = startPort + 1;
		while (usedPorts.has(port)) {
			port++;
		}
		return port;
	}

	private generateMainService(): string {
		const serviceName = this.config.projectName.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
		const ports = [`      - "${this.config.port}:${this.config.port}"`];

		if (this.config.enableDebug) {
			ports.push(`      - "5005:5005"`);
		}

		let envVars = "";
		if (this.config.language.startsWith("java")) {
			let javaOpts = "-Xms512m -Xmx1024m";
			if (this.config.enableDebug) {
				javaOpts += " -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005";
			}
			envVars = `
      - SPRING_PROFILES_ACTIVE=production
      - JAVA_OPTS=${javaOpts}`;
		} else if (this.config.language.startsWith("js")) {
			envVars = `
      - NODE_ENV=production
      - PORT=${this.config.port}`;
		} else if (this.config.language === "python") {
			envVars = `
      - PYTHONUNBUFFERED=1
      - PORT=${this.config.port}`;
		} else if (this.config.language === "go") {
			envVars = `
      - GIN_MODE=release`;
		} else if (this.config.language === "rust") {
			envVars = `
      - RUST_LOG=info`;
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

		const serviceName = this.getServiceName(db.type);

		// Use image from config
		let image = db.image;

		// If alpine selected and alpineImage exists
		if (db.useAlpine && db.alpineImage) {
			image = db.alpineImage;
		}

		// Fallback if no image
		if (!image) {
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
				oracle: "container-registry.oracle.com/database/enterprise",
				mssql: "mcr.microsoft.com/mssql/server",
				db2: "ibmcom/db2",
				couchbase: "couchbase/server",
				ravendb: "ravendb/ravendb",
				memcached: "memcached",
				etcd: "bitnami/etcd",
				aerospike: "aerospike/aerospike-server",
				scylladb: "scylladb/scylla",
				hbase: "apache/hbase",
				bigtable: "google/cloud-sdk",
				arangodb: "arangodb",
				janusgraph: "janusgraph/janusgraph",
				dgraph: "dgraph/dgraph",
				timescaledb: "timescale/timescaledb",
				prometheus: "prom/prometheus",
				opentsdb: "petergrace/opentsdb-docker",
				typesense: "typesense/typesense",
				tidb: "pingcap/tidb",
				yugabytedb: "yugabytedb/yugabyte",
				weaviate: "semitechnologies/weaviate",
				chroma: "chromadb/chroma",
			};
			const baseImage = imageMap[db.type] || db.type;
			image = `${baseImage}:${db.version}`;
		}

		let service = `  ${serviceName}:
    image: ${image}
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
      - "${db.externalPort}:${db.internalPort}"
    environment:`;

		// Add environment variables based on database type
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
      - MSSQL_SA_PASSWORD=${db.password || "Root1234!"}`;
		} else if (db.type === "neo4j") {
			service += `
      - NEO4J_AUTH=${db.username || "neo4j"}/${db.password || "password"}`;
		} else if (db.type === "elasticsearch") {
			service += `
      - discovery.type=single-node
      - xpack.security.enabled=false
      - ES_JAVA_OPTS=-Xms512m -Xmx512m`;
		} else if (db.type === "cassandra") {
			service += `
      - CASSANDRA_USER=${db.username || "cassandra"}
      - CASSANDRA_PASSWORD=${db.password || "cassandra"}`;
		} else if (db.type === "influxdb") {
			service += `
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=${db.username || "admin"}
      - DOCKER_INFLUXDB_INIT_PASSWORD=${db.password || "root"}
      - DOCKER_INFLUXDB_INIT_ORG=my-org
      - DOCKER_INFLUXDB_INIT_BUCKET=my-bucket`;
		} else if (db.type === "oracle") {
			service += `
      - ORACLE_PWD=${db.password || "root"}
      - ORACLE_CHARACTERSET=AL32UTF8`;
		} else if (db.type === "db2") {
			service += `
      - LICENSE=accept
      - DB2INST1_PASSWORD=${db.password || "root"}
      - DBNAME=${db.databaseName || "sample"}`;
		} else if (db.type === "couchdb") {
			service += `
      - COUCHDB_USER=${db.username || "admin"}
      - COUCHDB_PASSWORD=${db.password || "root"}`;
		} else if (db.type === "couchbase") {
			service += `
      - CB_USERNAME=${db.username || "admin"}
      - CB_PASSWORD=${db.password || "root"}`;
		} else if (db.type === "dynamodb") {
			service += `
      - AWS_ACCESS_KEY_ID=dummy
      - AWS_SECRET_ACCESS_KEY=dummy
      - AWS_DEFAULT_REGION=us-east-1`;
		} else if (db.type === "ravendb") {
			service += `
      - RAVEN_Security_UnsecuredAccessAllowed=PrivateNetwork
      - RAVEN_Setup_Mode=None`;
		} else if (db.type === "memcached") {
			service += `
      - MEMCACHED_CACHE_SIZE=64`;
		} else if (db.type === "etcd") {
			service += `
      - ALLOW_NONE_AUTHENTICATION=yes
      - ETCD_ADVERTISE_CLIENT_URLS=http://${serviceName}:2379`;
		} else if (db.type === "aerospike") {
			service += `
      - NAMESPACE=test`;
		} else if (db.type === "scylladb") {
			service += `
      - SCYLLA_USER=${db.username || "root"}
      - SCYLLA_PASS=${db.password || "root"}`;
		} else if (db.type === "hbase") {
			service += `
      - HBASE_STANDALONE=true`;
		} else if (db.type === "bigtable") {
			service += `
      - BIGTABLE_EMULATOR_HOST=0.0.0.0:8080`;
		} else if (db.type === "arangodb") {
			service += `
      - ARANGO_ROOT_PASSWORD=${db.password || "root"}`;
		} else if (db.type === "janusgraph") {
			service += `
      - JANUS_PROPS_TEMPLATE=berkeleyje
      - janusgraph.storage.backend=berkeleyje`;
		} else if (db.type === "dgraph") {
			service += `
      - DGRAPH_ALPHA_WHITELIST=0.0.0.0/0`;
		} else if (db.type === "prometheus") {
			service += `
      - PROMETHEUS_CONFIG=/etc/prometheus/prometheus.yml`;
		} else if (db.type === "opentsdb") {
			service += `
      - TSDB_CONF=/etc/opentsdb/opentsdb.conf`;
		} else if (db.type === "solr") {
			service += `
      - SOLR_HEAP=512m`;
		} else if (db.type === "meilisearch") {
			service += `
      - MEILI_MASTER_KEY=${db.password || "root"}
      - MEILI_ENV=development`;
		} else if (db.type === "typesense") {
			service += `
      - TYPESENSE_API_KEY=${db.password || "root"}
      - TYPESENSE_DATA_DIR=/data`;
		} else if (db.type === "tidb") {
			service += `
      - TIDB_SERVER_PORT=4000
      - TIDB_STATUS_PORT=10080`;
		} else if (db.type === "yugabytedb") {
			service += `
      - YB_MASTER_ADDRESS=${serviceName}:7100
      - YB_TSERVER_ADDRESS=${serviceName}:9000`;
		} else if (db.type === "weaviate") {
			service += `
      - AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true
      - PERSISTENCE_DATA_PATH=/var/lib/weaviate`;
		} else if (db.type === "qdrant") {
			service += `
      - QDRANT__SERVICE__GRPC_PORT=6334`;
		} else if (db.type === "cockroachdb") {
			service += `
      - COCKROACH_DATABASE=${db.databaseName || "defaultdb"}
      - COCKROACH_USER=${db.username || "root"}`;
		} else if (db.type === "milvus") {
			service += `
      - ETCD_AUTO_COMPACTION_MODE=revision
      - MILVUS_ETCD_ENDPOINTS=${serviceName}:2379`;
		} else if (db.type === "chroma") {
			service += `
      - CHROMA_SERVER_AUTH_CREDENTIALS=${db.password || "root"}
      - CHROMA_SERVER_AUTH_PROVIDER=chromadb.auth.token.TokenConfigServerAuthCredentialsProvider`;
		}

		service += `
    volumes:
      - ${serviceName}-data:/var/lib/${db.type === "postgresql" ? "postgresql" : db.type}
    networks:
      - dockeryzen-network`;

		return service;
	}

	private generateMessageQueueService(mq: any): string {
		const serviceName = this.getServiceName(mq.type);

		// Use image from config
		let image = mq.image;

		// If alpine selected and alpineImage exists
		if (mq.useAlpine && mq.alpineImage) {
			image = mq.alpineImage;
		}

		// Fallback if no image
		if (!image) {
			const imageMap: Record<string, string> = {
				kafka: "apache/kafka",
				rabbitmq: "rabbitmq",
				"activemq-classic": "apache/activemq-classic",
				"activemq-artemis": "apache/activemq-artemis",
			};
			const baseImage = imageMap[mq.type] || mq.type;
			image = `${baseImage}:${mq.version}`;
		}

		let service = `  ${serviceName}:
    image: ${image}
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
      - "${mq.externalPort}:${mq.internalPort}"
    environment:`;

		if (mq.type === "kafka") {
			service += `
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://${serviceName}:${mq.internalPort}
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1
      - KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1
      - KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1`;
		} else if (mq.type === "rabbitmq") {
			service += `
      - RABBITMQ_DEFAULT_USER=guest
      - RABBITMQ_DEFAULT_PASS=guest`;
		} else if (mq.type === "activemq-classic" || mq.type === "activemq-artemis") {
			service += `
      - ARTEMIS_USER=admin
      - ARTEMIS_PASSWORD=admin`;
		}

		service += `
    networks:
      - dockeryzen-network`;

		return service;
	}

	private generateAdditionalService(service: any): string {
		const serviceName = this.getServiceName(service.type);

		// Use image from config
		let image = service.image;

		// If alpine selected and alpineImage exists
		if (service.useAlpine && service.alpineImage) {
			image = service.alpineImage;
		}

		// Fallback if no image
		if (!image) {
			const imageMap: Record<string, string> = {
				nginx: "nginx",
				grafana: "grafana/grafana",
				prometheus: "prom/prometheus",
				keycloak: "quay.io/keycloak/keycloak",
				minio: "minio/minio",
			};
			const baseImage = imageMap[service.type] || service.type;
			image = `${baseImage}:${service.version}`;
		}

		let serviceConfig = `  ${serviceName}:
    image: ${image}
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
		} else if (service.type === "grafana") {
			serviceConfig += `
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin`;
		}

		serviceConfig += `
    networks:
      - dockeryzen-network`;

		return serviceConfig;
	}
}
