import { ProjectConfig } from "../types/index.js";

export class DockerComposeGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const services: string[] = [];
		const volumes: string[] = [];
		const usedServiceNames = new Set<string>();
		const appServiceName = this.sanitizeName(this.config.projectName);

		this.checkPortConflicts();

		// Generate main service
		const mainService = this.generateMainService();
		services.push(mainService);
		usedServiceNames.add(appServiceName);

		// Generate depends_on list
		const dependsOn: string[] = [];

		// Add database services
		if (this.config.databases.length > 0) {
			for (const db of this.config.databases) {
				if (!db.useExternalUrl) {
					const service = this.generateDatabaseService(db);
					const serviceName = this.getServiceName(db.type);

					if (!usedServiceNames.has(serviceName)) {
						services.push(service);
						usedServiceNames.add(serviceName);
						dependsOn.push(serviceName);

						const volumePath = db.volumePath || this.getVolumePath(db.type);
						volumes.push(`  ${serviceName}-data:\n    driver: local`);
					}
				}
			}
		}

		// Add message queue services
		if (this.config.messageQueues.length > 0) {
			for (const mq of this.config.messageQueues) {
				const service = this.generateMessageQueueService(mq);
				const serviceName = this.getServiceName(mq.type);

				if (!usedServiceNames.has(serviceName)) {
					services.push(service);
					usedServiceNames.add(serviceName);
					dependsOn.push(serviceName);
				}
			}
		}

		// Add additional services
		if (this.config.services.length > 0) {
			for (const service of this.config.services) {
				const serviceConfig = this.generateAdditionalService(service);
				const serviceName = this.getServiceName(service.type);

				if (!usedServiceNames.has(serviceName)) {
					services.push(serviceConfig);
					usedServiceNames.add(serviceName);
					dependsOn.push(serviceName);
				}
			}
		}

		// Add depends_on to main service if there are dependencies
		let mainServiceWithDeps = mainService;
		if (dependsOn.length > 0) {
			mainServiceWithDeps = mainService.replace("    networks:", `    depends_on:\n${dependsOn.map((d) => `      - ${d}`).join("\n")}\n    networks:`);
		}

		// Replace main service with version that has depends_on
		services[0] = mainServiceWithDeps;

		return `services:
${services.join("\n")}

networks:
  dockeryzen-network:
    driver: bridge
    name: dockeryzen-${this.sanitizeName(this.config.projectName)}-network

volumes:
${volumes.length > 0 ? volumes.join("\n") : "  data:\n    driver: local"}`;
	}

	private sanitizeName(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^a-z0-9-_]/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	private getServiceName(type: string): string {
		return `${this.sanitizeName(this.config.projectName)}-${this.sanitizeName(type)}`;
	}

	private getVolumePath(dbType: string): string {
		const volumePaths: Record<string, string> = {
			postgresql: "/var/lib/postgresql/data",
			timescaledb: "/var/lib/postgresql/data",
			mysql: "/var/lib/mysql",
			mariadb: "/var/lib/mysql",
			mongodb: "/data/db",
			redis: "/data",
			neo4j: "/data",
			elasticsearch: "/usr/share/elasticsearch/data",
			cassandra: "/var/lib/cassandra",
			influxdb: "/var/lib/influxdb",
			couchdb: "/opt/couchdb/data",
			keycloak: "/opt/jboss/keycloak/standalone/data",
			mssql: "/var/opt/mssql",
			oracle: "/opt/oracle/oradata",
			arangodb: "/var/lib/arangodb3",
			qdrant: "/qdrant/storage",
			weaviate: "/var/lib/weaviate",
			milvus: "/var/lib/milvus",
			chroma: "/chroma/data",
			cockroachdb: "/cockroach/cockroach-data",
			scylladb: "/var/lib/scylla",
			memcached: "/data",
			etcd: "/etcd-data",
			aerospike: "/opt/aerospike/data",
		};
		return volumePaths[dbType] || `/var/lib/${dbType}`;
	}

	private checkPortConflicts(): void {
		const allPorts = new Map<number, string>();

		allPorts.set(this.config.port, "Main Application");

		if (this.config.enableDebug && this.config.debugPort) {
			allPorts.set(this.config.debugPort, "Debug Port");
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
		if (this.config.debugPort) {
			return this.config.debugPort;
		}

		const lang = this.config.language;
		if (lang.startsWith("java")) return 5005;
		if (lang.startsWith("js")) return 9229;
		if (lang === "python") return 5678;
		if (lang === "dotnet") return 5000;
		if (lang === "go") return 2345;
		if (lang === "laravel") return 9003;
		if (lang === "rails") return 1234;
		if (lang === "cpp" || lang === "c") return 1234;

		return null;
	}

	private generateMainService(): string {
		const serviceName = this.sanitizeName(this.config.projectName);
		const ports = [`      - "${this.config.port}:${this.config.port}"`];

		let envVars = "";
		const lang = this.config.language;
		const debugPort = this.getDebugPort();

		// Java
		if (lang.startsWith("java")) {
			let javaOpts = "-Xms512m -Xmx1024m";
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
				javaOpts += ` -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${debugPort}`;
			}
			envVars = `
      - SPRING_PROFILES_ACTIVE=production
      - JAVA_OPTS=${javaOpts}`;
		}
		// Node.js
		else if (lang.startsWith("js")) {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - NODE_ENV=${this.config.enableDebug ? "development" : "production"}
      - PORT=${this.config.port}`;
			if (this.config.enableDebug && debugPort) {
				envVars += `
      - NODE_OPTIONS=--inspect=0.0.0.0:${debugPort}`;
			}
		}
		// Python
		else if (lang === "python") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - PYTHONUNBUFFERED=1
      - PORT=${this.config.port}`;
		}
		// .NET
		else if (lang === "dotnet") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - ASPNETCORE_ENVIRONMENT=${this.config.enableDebug ? "Development" : "Production"}
      - ASPNETCORE_URLS=http://+:${this.config.port}`;
		}
		// Go
		else if (lang === "go") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - GIN_MODE=${this.config.enableDebug ? "debug" : "release"}`;
		}
		// PHP Laravel
		else if (lang === "laravel") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - APP_ENV=${this.config.enableDebug ? "local" : "production"}
      - APP_DEBUG=${this.config.enableDebug ? "true" : "false"}`;
		}
		// Ruby on Rails
		else if (lang === "rails") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - RAILS_ENV=${this.config.enableDebug ? "development" : "production"}`;
		}
		// Rust
		else if (lang === "rust") {
			envVars = `
      - RUST_LOG=${this.config.enableDebug ? "debug" : "info"}`;
		}
		// C++ / C
		else if (lang === "cpp" || lang === "c") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - DEBUG=${this.config.enableDebug ? "1" : "0"}`;
		}

		// Add health check if enabled
		let healthCheckSection = "";
		if (this.config.enableHealthCheck) {
			const healthPath = this.config.healthCheckPath || "/health";
			healthCheckSection = `
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:${this.config.port}${healthPath}"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s`;
		}

		return `  ${serviceName}:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${serviceName}-container
    restart: unless-stopped
    ports:
${ports.join("\n")}
    environment:${envVars}${healthCheckSection}
    networks:
      - dockeryzen-network
    dns:
      - 8.8.8.8
      - 8.8.4.4`;
	}

	private generateDatabaseService(db: any): string {
		if (db.useExternalUrl) {
			return `  # External ${db.type} database
  # URL: ${db.url}
  # Connection should be configured via environment variables`;
		}

		const serviceName = this.getServiceName(db.type);

		let image = db.image;
		if (db.useAlpine && db.alpineImage) {
			image = db.alpineImage;
		}
		if (!image) {
			image = `${db.type}:${db.version}`;
		}

		const volumePath = db.volumePath || this.getVolumePath(db.type);

		let service = `  ${serviceName}:
    image: ${image}
    container_name: ${serviceName}-container
    restart: unless-stopped
    ports:
      - "${db.externalPort}:${db.internalPort}"
    environment:`;

		const envMap: Record<string, string[]> = {
			postgresql: [`POSTGRES_DB=${db.databaseName || "postgres"}`, `POSTGRES_USER=${db.username || "postgres"}`, `POSTGRES_PASSWORD=${db.password || "root"}`],
			timescaledb: [`POSTGRES_DB=${db.databaseName || "postgres"}`, `POSTGRES_USER=${db.username || "postgres"}`, `POSTGRES_PASSWORD=${db.password || "root"}`],
			mysql: [`MYSQL_DATABASE=${db.databaseName || "mysql"}`, `MYSQL_USER=${db.username || "root"}`, `MYSQL_PASSWORD=${db.password || "root"}`, `MYSQL_ROOT_PASSWORD=${db.password || "root"}`],
			mariadb: [`MYSQL_DATABASE=${db.databaseName || "mysql"}`, `MYSQL_USER=${db.username || "root"}`, `MYSQL_PASSWORD=${db.password || "root"}`, `MYSQL_ROOT_PASSWORD=${db.password || "root"}`],
			mongodb: [`MONGO_INITDB_ROOT_USERNAME=${db.username || "root"}`, `MONGO_INITDB_ROOT_PASSWORD=${db.password || "root"}`, `MONGO_INITDB_DATABASE=${db.databaseName || "admin"}`],
			redis: [`REDIS_PASSWORD=${db.password || "root"}`, `REDIS_APPENDONLY=yes`],
			mssql: ["ACCEPT_EULA=Y", `MSSQL_SA_PASSWORD=${db.password || "Root1234!"}`],
			neo4j: [`NEO4J_AUTH=${db.username || "neo4j"}/${db.password || "password"}`],
			elasticsearch: ["discovery.type=single-node", "xpack.security.enabled=false", "ES_JAVA_OPTS=-Xms512m -Xmx512m"],
			cassandra: [`CASSANDRA_USER=${db.username || "cassandra"}`, `CASSANDRA_PASSWORD=${db.password || "cassandra"}`, "JVM_OPTS=-Xms512m -Xmx512m"],
			influxdb: ["DOCKER_INFLUXDB_INIT_MODE=setup", `DOCKER_INFLUXDB_INIT_USERNAME=${db.username || "admin"}`, `DOCKER_INFLUXDB_INIT_PASSWORD=${db.password || "root"}`, "DOCKER_INFLUXDB_INIT_ORG=my-org", "DOCKER_INFLUXDB_INIT_BUCKET=my-bucket"],
			oracle: [`ORACLE_PWD=${db.password || "root"}`, "ORACLE_CHARACTERSET=AL32UTF8"],
			db2: ["LICENSE=accept", `DB2INST1_PASSWORD=${db.password || "root"}`, `DBNAME=${db.databaseName || "sample"}`],
			couchdb: [`COUCHDB_USER=${db.username || "admin"}`, `COUCHDB_PASSWORD=${db.password || "root"}`],
			couchbase: [`CB_USERNAME=${db.username || "admin"}`, `CB_PASSWORD=${db.password || "root"}`],
			dynamodb: ["AWS_ACCESS_KEY_ID=dummy", "AWS_SECRET_ACCESS_KEY=dummy", "AWS_DEFAULT_REGION=us-east-1"],
			memcached: ["MEMCACHED_CACHE_SIZE=64"],
			etcd: ["ALLOW_NONE_AUTHENTICATION=yes", `ETCD_ADVERTISE_CLIENT_URLS=http://${serviceName}:2379`],
			aerospike: ["NAMESPACE=test"],
			scylladb: [`SCYLLA_USER=${db.username || "root"}`, `SCYLLA_PASS=${db.password || "root"}`],
			arangodb: [`ARANGO_ROOT_PASSWORD=${db.password || "root"}`],
			prometheus: ["PROMETHEUS_CONFIG=/etc/prometheus/prometheus.yml"],
			meilisearch: [`MEILI_MASTER_KEY=${db.password || "root"}`, "MEILI_ENV=development"],
			typesense: [`TYPESENSE_API_KEY=${db.password || "root"}`, "TYPESENSE_DATA_DIR=/data"],
			cockroachdb: [`COCKROACH_DATABASE=${db.databaseName || "defaultdb"}`, `COCKROACH_USER=${db.username || "root"}`],
			qdrant: ["QDRANT__SERVICE__GRPC_PORT=6334"],
			weaviate: ["AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true", "PERSISTENCE_DATA_PATH=/var/lib/weaviate"],
			chroma: [`CHROMA_SERVER_AUTH_CREDENTIALS=${db.password || "root"}`, "CHROMA_SERVER_AUTH_PROVIDER=chromadb.auth.token.TokenConfigServerAuthCredentialsProvider"],
		};

		const envVars = envMap[db.type] || [];
		for (const env of envVars) {
			service += `
      - ${env}`;
		}

		service += `
    volumes:
      - ${serviceName}-data:${volumePath}
    healthcheck:
      test: ["CMD-SHELL", "exit 0"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
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
    container_name: ${serviceName}-container
    restart: unless-stopped
    ports:
      - "${mq.externalPort}:${mq.internalPort}"
    environment:`;

		if (mq.type === "kafka") {
			service += `
      - KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:${mq.internalPort},CONTROLLER://0.0.0.0:9093
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://${serviceName}:${mq.internalPort}
      - KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER
      - KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1
      - KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1
      - KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1
      - KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`;
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
    healthcheck:
      test: ["CMD-SHELL", "exit 0"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
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
    container_name: ${serviceName}-container
    restart: unless-stopped
    ports:
      - "${service.externalPort}:${service.internalPort}"`;

		if (service.type === "keycloak") {
			serviceConfig += `
    environment:
      - KEYCLOAK_ADMIN=admin
      - KEYCLOAK_ADMIN_PASSWORD=admin
    command: start-dev`;
		} else if (service.type === "minio") {
			serviceConfig += `
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    command: server /data --console-address ":9001"`;
		} else if (service.type === "grafana") {
			serviceConfig += `
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin`;
		} else if (service.type === "nginx") {
			serviceConfig += `
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./html:/usr/share/nginx/html:ro`;
		}

		serviceConfig += `
    healthcheck:
      test: ["CMD-SHELL", "exit 0"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s
    networks:
      - dockeryzen-network`;

		return serviceConfig;
	}
}
