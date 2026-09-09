import { ProjectConfig } from "../types/index.js";

export class DockerComposeGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const services: string[] = [];
		const volumes: string[] = [];
		const usedServiceNames = new Set<string>();

		this.checkPortConflicts();

		services.push(this.generateMainService());

		if (this.config.databases.length > 0) {
			for (const db of this.config.databases) {
				if (!db.useExternalUrl) {
					const service = this.generateDatabaseService(db);
					const serviceName = this.getServiceName(db.type);

					if (!usedServiceNames.has(serviceName)) {
						services.push(service);
						usedServiceNames.add(serviceName);
						volumes.push(`  ${serviceName}-data:\n    driver: local`);
					}
				}
			}
		}

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

		allPorts.set(this.config.port, "Main Application");

		if (this.config.enableDebug) {
			const debugPort = this.getDebugPort();
			if (debugPort) {
				allPorts.set(debugPort, "Debug Port");
			}
		}

		for (const db of this.config.databases) {
			if (!db.useExternalUrl) {
				if (allPorts.has(db.externalPort)) {
					db.externalPort = this.findFreePort(db.externalPort, allPorts);
				}
				allPorts.set(db.externalPort, `${db.type} Database`);
			}
		}

		for (const mq of this.config.messageQueues) {
			if (allPorts.has(mq.externalPort)) {
				mq.externalPort = this.findFreePort(mq.externalPort, allPorts);
			}
			allPorts.set(mq.externalPort, `${mq.type} Message Queue`);
		}

		for (const service of this.config.services) {
			if (allPorts.has(service.externalPort)) {
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

	private getDebugPort(): number | null {
		const lang = this.config.language;

		if (lang.startsWith("java")) return 5005;
		if (lang.startsWith("js")) return 9229;
		if (lang === "python") return 5678;
		if (lang === "dotnet") return 5000;
		if (lang === "go") return 2345;
		if (lang === "laravel") return 9003;
		if (lang === "rails") return 1234;

		return null;
	}

	private generateMainService(): string {
		const serviceName = this.config.projectName.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
		const ports = [`      - "${this.config.port}:${this.config.port}"`];

		let envVars = "";
		const lang = this.config.language;

		// Java
		if (lang.startsWith("java")) {
			let javaOpts = "-Xms512m -Xmx1024m";
			if (this.config.enableDebug) {
				ports.push('      - "5005:5005"');
				javaOpts += " -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:5005";
			}
			envVars = `
      - SPRING_PROFILES_ACTIVE=production
      - JAVA_OPTS=${javaOpts}`;
		}
		// Node.js
		else if (lang.startsWith("js")) {
			if (this.config.enableDebug) {
				ports.push('      - "9229:9229"');
			}
			envVars = `
      - NODE_ENV=${this.config.enableDebug ? "development" : "production"}
      - PORT=${this.config.port}`;
			if (this.config.enableDebug) {
				envVars += `
      - NODE_OPTIONS=--inspect=0.0.0.0:9229`;
			}
		}
		// Python
		else if (lang === "python") {
			if (this.config.enableDebug) {
				ports.push('      - "5678:5678"');
			}
			envVars = `
      - PYTHONUNBUFFERED=1
      - PORT=${this.config.port}`;
			if (this.config.enableDebug) {
				envVars += `
      - PYTHONPATH=/app`;
			}
		}
		// .NET
		else if (lang === "dotnet") {
			if (this.config.enableDebug) {
				ports.push('      - "5000:5000"');
			}
			envVars = `
      - ASPNETCORE_ENVIRONMENT=${this.config.enableDebug ? "Development" : "Production"}
      - ASPNETCORE_URLS=http://+:${this.config.port}`;
			if (this.config.enableDebug) {
				envVars += `
      - DOTNET_USE_POLLING_FILE_WATCHER=1`;
			}
		}
		// Go
		else if (lang === "go") {
			if (this.config.enableDebug) {
				ports.push('      - "2345:2345"');
			}
			envVars = `
      - GIN_MODE=${this.config.enableDebug ? "debug" : "release"}`;
		}
		// PHP Laravel
		else if (lang === "laravel") {
			if (this.config.enableDebug) {
				ports.push('      - "9003:9003"');
			}
			envVars = `
      - APP_ENV=${this.config.enableDebug ? "local" : "production"}
      - APP_DEBUG=${this.config.enableDebug ? "true" : "false"}`;
			if (this.config.enableDebug) {
				envVars += `
      - XDEBUG_MODE=debug
      - XDEBUG_CONFIG=client_host=host.docker.internal client_port=9003`;
			}
		}
		// Ruby on Rails
		else if (lang === "rails") {
			if (this.config.enableDebug) {
				ports.push('      - "1234:1234"');
			}
			envVars = `
      - RAILS_ENV=${this.config.enableDebug ? "development" : "production"}`;
			if (this.config.enableDebug) {
				envVars += `
      - RUBY_DEBUG_PORT=1234`;
			}
		}
		// Rust
		else if (lang === "rust") {
			envVars = `
      - RUST_LOG=${this.config.enableDebug ? "debug" : "info"}`;
		}
		// C++ / C
		else if (lang === "cpp" || lang === "c") {
			envVars = `
      - DEBUG=${this.config.enableDebug ? "1" : "0"}`;
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

		let image = db.image;
		if (db.useAlpine && db.alpineImage) {
			image = db.alpineImage;
		}
		if (!image) {
			image = `${db.type}:${db.version}`;
		}

		let service = `  ${serviceName}:
    image: ${image}
    container_name: ${serviceName}
    restart: unless-stopped
    ports:
      - "${db.externalPort}:${db.internalPort}"
    environment:`;

		const envMap: Record<string, string[]> = {
			postgresql: [`POSTGRES_DB=${db.databaseName || "postgres"}`, `POSTGRES_USER=${db.username || "postgres"}`, `POSTGRES_PASSWORD=${db.password || "root"}`],
			timescaledb: [`POSTGRES_DB=${db.databaseName || "postgres"}`, `POSTGRES_USER=${db.username || "postgres"}`, `POSTGRES_PASSWORD=${db.password || "root"}`],
			mysql: [`MYSQL_DATABASE=${db.databaseName || "mysql"}`, `MYSQL_USER=${db.username || "root"}`, `MYSQL_PASSWORD=${db.password || "root"}`, `MYSQL_ROOT_PASSWORD=${db.password || "root"}`],
			mariadb: [`MYSQL_DATABASE=${db.databaseName || "mysql"}`, `MYSQL_USER=${db.username || "root"}`, `MYSQL_PASSWORD=${db.password || "root"}`, `MYSQL_ROOT_PASSWORD=${db.password || "root"}`],
			mongodb: [`MONGO_INITDB_ROOT_USERNAME=${db.username || "root"}`, `MONGO_INITDB_ROOT_PASSWORD=${db.password || "root"}`],
			redis: [`REDIS_PASSWORD=${db.password || "root"}`],
			mssql: ["ACCEPT_EULA=Y", `MSSQL_SA_PASSWORD=${db.password || "Root1234!"}`],
			neo4j: [`NEO4J_AUTH=${db.username || "neo4j"}/${db.password || "password"}`],
			elasticsearch: ["discovery.type=single-node", "xpack.security.enabled=false", "ES_JAVA_OPTS=-Xms512m -Xmx512m"],
			cassandra: [`CASSANDRA_USER=${db.username || "cassandra"}`, `CASSANDRA_PASSWORD=${db.password || "cassandra"}`],
			influxdb: ["DOCKER_INFLUXDB_INIT_MODE=setup", `DOCKER_INFLUXDB_INIT_USERNAME=${db.username || "admin"}`, `DOCKER_INFLUXDB_INIT_PASSWORD=${db.password || "root"}`, "DOCKER_INFLUXDB_INIT_ORG=my-org", "DOCKER_INFLUXDB_INIT_BUCKET=my-bucket"],
			oracle: [`ORACLE_PWD=${db.password || "root"}`, "ORACLE_CHARACTERSET=AL32UTF8"],
			db2: ["LICENSE=accept", `DB2INST1_PASSWORD=${db.password || "root"}`, `DBNAME=${db.databaseName || "sample"}`],
			couchdb: [`COUCHDB_USER=${db.username || "admin"}`, `COUCHDB_PASSWORD=${db.password || "root"}`],
			couchbase: [`CB_USERNAME=${db.username || "admin"}`, `CB_PASSWORD=${db.password || "root"}`],
			dynamodb: ["AWS_ACCESS_KEY_ID=dummy", "AWS_SECRET_ACCESS_KEY=dummy", "AWS_DEFAULT_REGION=us-east-1"],
			ravendb: ["RAVEN_Security_UnsecuredAccessAllowed=PrivateNetwork", "RAVEN_Setup_Mode=None"],
			memcached: ["MEMCACHED_CACHE_SIZE=64"],
			etcd: ["ALLOW_NONE_AUTHENTICATION=yes", `ETCD_ADVERTISE_CLIENT_URLS=http://${serviceName}:2379`],
			aerospike: ["NAMESPACE=test"],
			scylladb: [`SCYLLA_USER=${db.username || "root"}`, `SCYLLA_PASS=${db.password || "root"}`],
			hbase: ["HBASE_STANDALONE=true"],
			bigtable: ["BIGTABLE_EMULATOR_HOST=0.0.0.0:8080"],
			arangodb: [`ARANGO_ROOT_PASSWORD=${db.password || "root"}`],
			janusgraph: ["JANUS_PROPS_TEMPLATE=berkeleyje", "janusgraph.storage.backend=berkeleyje"],
			dgraph: ["DGRAPH_ALPHA_WHITELIST=0.0.0.0/0"],
			prometheus: ["PROMETHEUS_CONFIG=/etc/prometheus/prometheus.yml"],
			opentsdb: ["TSDB_CONF=/etc/opentsdb/opentsdb.conf"],
			solr: ["SOLR_HEAP=512m"],
			meilisearch: [`MEILI_MASTER_KEY=${db.password || "root"}`, "MEILI_ENV=development"],
			typesense: [`TYPESENSE_API_KEY=${db.password || "root"}`, "TYPESENSE_DATA_DIR=/data"],
			tidb: ["TIDB_SERVER_PORT=4000", "TIDB_STATUS_PORT=10080"],
			yugabytedb: [`YB_MASTER_ADDRESS=${serviceName}:7100`, `YB_TSERVER_ADDRESS=${serviceName}:9000`],
			weaviate: ["AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true", "PERSISTENCE_DATA_PATH=/var/lib/weaviate"],
			qdrant: ["QDRANT__SERVICE__GRPC_PORT=6334"],
			cockroachdb: [`COCKROACH_DATABASE=${db.databaseName || "defaultdb"}`, `COCKROACH_USER=${db.username || "root"}`],
			milvus: ["ETCD_AUTO_COMPACTION_MODE=revision", `MILVUS_ETCD_ENDPOINTS=${serviceName}:2379`],
			chroma: [`CHROMA_SERVER_AUTH_CREDENTIALS=${db.password || "root"}`, "CHROMA_SERVER_AUTH_PROVIDER=chromadb.auth.token.TokenConfigServerAuthCredentialsProvider"],
		};

		const envVars = envMap[db.type] || [];
		for (const env of envVars) {
			service += `
      - ${env}`;
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

		let image = mq.image;
		if (mq.useAlpine && mq.alpineImage) {
			image = mq.alpineImage;
		}
		if (!image) {
			image = `${mq.type}:${mq.version}`;
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

		let image = service.image;
		if (service.useAlpine && service.alpineImage) {
			image = service.alpineImage;
		}
		if (!image) {
			image = `${service.type}:${service.version}`;
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
