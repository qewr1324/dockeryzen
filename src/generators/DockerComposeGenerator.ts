import { ProjectConfig } from "../types/index.js";
import { sanitizeName } from "../utils/helpers.js";

export class DockerComposeGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const services: string[] = [];
		const volumes: string[] = [];
		const usedServiceNames = new Set<string>();
		const appServiceName = sanitizeName(this.config.projectName);

		this.checkPortConflicts();

		const mainService = this.generateMainService();
		services.push(mainService);
		usedServiceNames.add(appServiceName);

		// باگ 551: محدود کردن depends_on به حداکثر 10 سرویس
		const dependsOn: string[] = [];
		const maxDependsOn = 10;

		if (this.config.databases.length > 0) {
			for (const db of this.config.databases) {
				if (!db.useExternalUrl && db.type !== "prometheus" && db.type !== "grafana") {
					const service = this.generateDatabaseService(db);
					const serviceName = this.getServiceName(db.type);
					if (!usedServiceNames.has(serviceName)) {
						services.push(service);
						usedServiceNames.add(serviceName);
						if (dependsOn.length < maxDependsOn) {
							dependsOn.push(serviceName);
						}
						volumes.push(`  ${serviceName}-data:\n    driver: local`);

						const backupService = this.generateBackupService(db);
						if (backupService) {
							const backupName = `${serviceName}-backup`;
							if (!usedServiceNames.has(backupName)) {
								services.push(backupService);
								usedServiceNames.add(backupName);
								volumes.push(`  ${backupName}-data:\n    driver: local`);
							}
						}
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
					if (dependsOn.length < maxDependsOn) {
						dependsOn.push(serviceName);
					}
				}
				// باگ 559: Kafka 4.x بدون Zookeeper
				if (mq.type === "kafka" && mq.version.startsWith("2")) {
					const zookeeperService = this.generateZookeeperService();
					const zookeeperName = this.getServiceName("zookeeper");
					if (!usedServiceNames.has(zookeeperName)) {
						services.push(zookeeperService);
						usedServiceNames.add(zookeeperName);
					}
				}
			}
		}

		const needRedis = this.config.enableRedis || this.config.enableQueueWorker || this.config.enableSidekiq;
		if (needRedis && !this.config.databases.some((d) => d.type === "redis")) {
			const redisService = this.generateRedisService();
			const redisName = this.getServiceName("redis");
			if (!usedServiceNames.has(redisName)) {
				services.push(redisService);
				usedServiceNames.add(redisName);
				if (dependsOn.length < maxDependsOn) {
					dependsOn.push(redisName);
				}
				volumes.push(`  ${redisName}-data:\n    driver: local`);
			}
		}

		if (this.config.language === "laravel" && this.config.enableNginx && !this.config.services.some((s) => s.type === "nginx")) {
			const nginxService = this.generateNginxService(appServiceName);
			const nginxName = this.getServiceName("nginx");
			if (!usedServiceNames.has(nginxName)) {
				services.push(nginxService);
				usedServiceNames.add(nginxName);
			}
		}

		if (this.config.language === "laravel" && this.config.enableQueueWorker && needRedis) {
			const queueWorker = this.generateLaravelQueueWorker(appServiceName);
			const queueName = this.getServiceName("queue-worker");
			if (!usedServiceNames.has(queueName)) {
				services.push(queueWorker);
				usedServiceNames.add(queueName);
			}
		}

		if (this.config.language === "rails" && this.config.enableSidekiq && needRedis) {
			const sidekiq = this.generateSidekiqWorker(appServiceName);
			const sidekiqName = this.getServiceName("sidekiq");
			if (!usedServiceNames.has(sidekiqName)) {
				services.push(sidekiq);
				usedServiceNames.add(sidekiqName);
			}
		}

		if (this.config.enableHealthCheck) {
			if (!this.config.databases.some((d) => d.type === "prometheus")) {
				const prometheus = this.generatePrometheusService();
				const prometheusName = this.getServiceName("prometheus");
				if (!usedServiceNames.has(prometheusName)) {
					services.push(prometheus);
					usedServiceNames.add(prometheusName);
					volumes.push(`  ${prometheusName}-data:\n    driver: local`);
				}
			}
			if (!this.config.services.some((s) => s.type === "grafana")) {
				const grafana = this.generateGrafanaService();
				const grafanaName = this.getServiceName("grafana");
				if (!usedServiceNames.has(grafanaName)) {
					services.push(grafana);
					usedServiceNames.add(grafanaName);
					volumes.push(`  ${grafanaName}-data:\n    driver: local`);
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
					if (dependsOn.length < maxDependsOn) {
						dependsOn.push(serviceName);
					}
				}
			}
		}

		let mainServiceWithDeps = mainService;
		if (dependsOn.length > 0) {
			const depsWithCondition = dependsOn.map((d) => `      ${d}:\n        condition: service_healthy`).join("\n");
			mainServiceWithDeps = mainService.replace("    networks:", `    depends_on:\n${depsWithCondition}\n    networks:`);
		}
		services[0] = mainServiceWithDeps;

		const secretsSection = this.generateSecretsSection();
		const networkDriver = this.config.networkDriver || "bridge";

		return `# ============================================
# Dockeryzen Generated Docker Compose
# Project: ${this.config.projectName}
# Language: ${this.config.language}
# Generated: ${new Date().toISOString()}
# ============================================

services:
${services.join("\n")}

networks:
  dockeryzen-network:
    driver: ${networkDriver}
    name: dockeryzen-${sanitizeName(this.config.projectName)}-network

volumes:
${volumes.length > 0 ? volumes.join("\n") : "  data:\n    driver: local"}

${secretsSection}`;
	}

	private generateSecretsSection(): string {
		const passwordNeedingDBs = ["postgresql", "timescaledb", "mysql", "mariadb", "mongodb", "redis", "mssql", "oracle", "db2", "couchdb", "couchbase", "arangodb", "elasticsearch", "cassandra", "scylladb", "influxdb"];
		const secrets: string[] = [];

		for (const db of this.config.databases) {
			if (!db.useExternalUrl && passwordNeedingDBs.includes(db.type)) {
				secrets.push(`  ${sanitizeName(db.type)}_password:\n    file: ./secrets/${sanitizeName(db.type)}_password.txt`);
			}
		}
		if (this.config.enableRedis && !this.config.databases.some((d) => d.type === "redis")) {
			secrets.push(`  redis_password:\n    file: ./secrets/redis_password.txt`);
		}
		if (secrets.length === 0) return "";
		return `secrets:\n${secrets.join("\n")}`;
	}

	private getServiceName(type: string): string {
		return sanitizeName(`${this.config.projectName}-${type}`).substring(0, 63);
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
			mssql: "/var/opt/mssql",
			// باگ 639: Oracle volume path اصلاح شد
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
			tidb: "/var/lib/tidb",
			yugabytedb: "/var/lib/yugabyte",
		};
		return volumePaths[dbType] || `/var/lib/${dbType}`;
	}

	private checkPortConflicts(): void {
		const allPorts = new Map<number, string>();
		allPorts.set(this.config.port, "Main Application");

		// باگ 563: Debug port conflict check
		if (this.config.enableDebug && this.config.debugPort) {
			if (allPorts.has(this.config.debugPort)) {
				this.config.debugPort = this.findFreePort(this.config.debugPort, allPorts);
			}
			allPorts.set(this.config.debugPort, "Debug Port");
		}

		for (const db of this.config.databases) {
			if (!db.useExternalUrl) {
				if (allPorts.has(db.externalPort)) {
					db.externalPort = this.findFreePort(db.externalPort, allPorts);
				}
				// باگ 562 و 673: internal port conflict check
				if (allPorts.has(db.internalPort)) {
					db.internalPort = this.findFreePort(db.internalPort, allPorts);
				}
				allPorts.set(db.externalPort, `${db.type} Database`);
				allPorts.set(db.internalPort, `${db.type} Database (internal)`);
			}
		}

		for (const mq of this.config.messageQueues) {
			if (allPorts.has(mq.externalPort)) {
				mq.externalPort = this.findFreePort(mq.externalPort, allPorts);
			}
			if (allPorts.has(mq.internalPort)) {
				mq.internalPort = this.findFreePort(mq.internalPort, allPorts);
			}
			allPorts.set(mq.externalPort, `${mq.type} Message Queue`);
			allPorts.set(mq.internalPort, `${mq.type} Message Queue (internal)`);
		}

		for (const service of this.config.services) {
			if (allPorts.has(service.externalPort)) {
				service.externalPort = this.findFreePort(service.externalPort, allPorts);
			}
			if (allPorts.has(service.internalPort)) {
				service.internalPort = this.findFreePort(service.internalPort, allPorts);
			}
			allPorts.set(service.externalPort, `${service.type} Service`);
			allPorts.set(service.internalPort, `${service.type} Service (internal)`);
		}
	}

	private findFreePort(startPort: number, usedPorts: Map<number, string>): number {
		let port = startPort + 1;
		while (usedPorts.has(port)) port++;
		return port;
	}

	private getDebugPort(): number | null {
		if (this.config.debugPort) return this.config.debugPort;
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
		const serviceName = sanitizeName(this.config.projectName);
		const ports = [`      - "${this.config.port}:${this.config.port}"`];
		const restartPolicy = this.config.restartPolicy || "unless-stopped";
		const debugPort = this.getDebugPort();
		const lang = this.config.language;
		const isWar = lang === "java-war";

		let envVars = "";

		if (lang.startsWith("java")) {
			if (isWar) {
				if (this.config.enableDebug && debugPort) {
					ports.push(`      - "${debugPort}:${debugPort}"`);
					const catalinaOpts = `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${debugPort}`;
					envVars = `\n      - CATALINA_OPTS=${catalinaOpts}`;
				}
			} else {
				let profileEnv = "";
				if (this.config.framework === "quarkus") {
					profileEnv = "QUARKUS_PROFILE=prod";
				} else if (this.config.framework === "micronaut") {
					profileEnv = "MICRONAUT_ENVIRONMENTS=prod";
				} else {
					profileEnv = "SPRING_PROFILES_ACTIVE=production";
				}

				let javaOpts = "-Xms512m -Xmx1024m -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:+ExitOnOutOfMemoryError -XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0";
				if (this.config.enableDebug && debugPort) {
					ports.push(`      - "${debugPort}:${debugPort}"`);
					javaOpts += ` -agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=*:${debugPort}`;
				}
				envVars = `
      - ${profileEnv}
      - JAVA_OPTS=${javaOpts}`;
			}
		} else if (lang.startsWith("js")) {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - NODE_ENV=${this.config.enableDebug ? "development" : "production"}
      - PORT=${this.config.port}
      - NODE_OPTIONS=--max-old-space-size=512`;
		} else if (lang === "python") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - PYTHONUNBUFFERED=1
      - PORT=${this.config.port}`;
		} else if (lang === "dotnet") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - ASPNETCORE_ENVIRONMENT=${this.config.enableDebug ? "Development" : "Production"}
      - ASPNETCORE_URLS=http://+:${this.config.port}`;
		} else if (lang === "go") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - GIN_MODE=${this.config.enableDebug ? "debug" : "release"}`;
		} else if (lang === "laravel") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			const redisHost = this.config.enableRedis || this.config.enableQueueWorker ? this.getServiceName("redis") : "localhost";
			envVars = `
      - APP_ENV=${this.config.enableDebug ? "local" : "production"}
      - APP_DEBUG=${this.config.enableDebug ? "true" : "false"}
      - DB_HOST=${this.getServiceName("postgresql")}
      - DB_PORT=5432
      - REDIS_HOST=${redisHost}`;
		} else if (lang === "rails") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			const redisUrl = this.config.enableRedis || this.config.enableSidekiq ? `redis://${this.getServiceName("redis")}:6379/0` : "";
			envVars = `
      - RAILS_ENV=${this.config.enableDebug ? "development" : "production"}
      - DATABASE_URL=postgresql://postgres:root@${this.getServiceName("postgresql")}:5432/${this.config.projectName}_production${redisUrl ? `\n      - REDIS_URL=${redisUrl}` : ""}`;
		} else if (lang === "rust") {
			envVars = `
      - RUST_LOG=${this.config.enableDebug ? "debug" : "info"}`;
		} else if (lang === "cpp" || lang === "c") {
			if (this.config.enableDebug && debugPort) {
				ports.push(`      - "${debugPort}:${debugPort}"`);
			}
			envVars = `
      - DEBUG=${this.config.enableDebug ? "1" : "0"}`;
		}

		// باگ 553: تشخیص ARM64 برای Linux
		const isArm64 = process.arch === "arm64" || process.arch === "riscv64";
		const platformSection = `
    platform: ${isArm64 ? "linux/arm64" : "linux/amd64"}`;

		const loggingConfig = `
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"`;

		// باگ 638: init فقط روی Linux
		const initProcess =
			process.platform === "linux"
				? `
    init: true`
				: "";

		// باگ 564: read_only فقط در production
		const readOnly = this.config.enableDebug
			? ""
			: `
    read_only: true
    tmpfs:
      - /tmp
      - /var/tmp`;

		const pullPolicy = `
    pull_policy: if_not_present`;

		let healthCheckSection = "";
		if (this.config.enableHealthCheck) {
			const isWarLang = this.config.language === "java-war";
			const healthPath = isWarLang ? "/" : this.config.healthCheckPath || "/health";
			// باگ 695: استفاده از wget به جای curl
			healthCheckSection = `
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:${this.config.port}${healthPath}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s`;
		}

		const devVolume = this.config.enableDebug
			? `
    volumes:
      - .:/app`
			: "";

		const labels = `
    labels:
      - "com.dockeryzen.project=${this.config.projectName}"
      - "com.dockeryzen.language=${this.config.language}"
      - "com.dockeryzen.generated=true"
      - "com.dockeryzen.version=1.0.0"`;

		const networksSection = `
    networks:
      dockeryzen-network:
        aliases:
          - ${serviceName}.local
          - app`;

		const environmentSection = envVars ? `    environment:${envVars}` : "";

		return `  ${serviceName}:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${serviceName}-container
    restart: ${restartPolicy}
    ports:
${ports.join("\n")}${platformSection}${pullPolicy}
${environmentSection}${devVolume}${initProcess}${readOnly}${loggingConfig}${healthCheckSection}${labels}${networksSection}
    dns:
      - 8.8.8.8
      - 8.8.4.4`;
	}

	private generateDatabaseService(db: any): string {
		if (db.useExternalUrl) {
			return `  # External ${db.type} database
  # URL: ${db.url}`;
		}
		const serviceName = this.getServiceName(db.type);
		let image = db.image;
		if (db.useAlpine && db.alpineImage) image = db.alpineImage;
		if (!image) image = `${db.type}:${db.version}`;

		const volumePath = db.volumePath || this.getVolumePath(db.type);
		const restartPolicy = this.config.restartPolicy || "unless-stopped";

		let service = `  ${serviceName}:
    image: ${image}
    container_name: ${serviceName}-container
    restart: ${restartPolicy}
    ports:
      - "${db.externalPort}:${db.internalPort}"
    environment:`;

		const envMap: Record<string, string[]> = {
			postgresql: [`POSTGRES_DB=${db.databaseName || "postgres"}`, `POSTGRES_USER=${db.username || "postgres"}`, `POSTGRES_PASSWORD=${db.password || "root"}`],
			timescaledb: [`POSTGRES_DB=${db.databaseName || "postgres"}`, `POSTGRES_USER=${db.username || "postgres"}`, `POSTGRES_PASSWORD=${db.password || "root"}`],
			mysql: [`MYSQL_DATABASE=${db.databaseName || "mysql"}`, `MYSQL_USER=${db.username || "root"}`, `MYSQL_PASSWORD=${db.password || "root"}`, `MYSQL_ROOT_PASSWORD=${db.password || "root"}`],
			mariadb: [`MYSQL_DATABASE=${db.databaseName || "mysql"}`, `MYSQL_USER=${db.username || "root"}`, `MYSQL_PASSWORD=${db.password || "root"}`, `MYSQL_ROOT_PASSWORD=${db.password || "root"}`],
			mongodb: [`MONGO_INITDB_ROOT_USERNAME=${db.username || "root"}`, `MONGO_INITDB_ROOT_PASSWORD=${db.password || "root"}`, `MONGO_INITDB_DATABASE=${db.databaseName || "admin"}`],
			redis: [`REDIS_PASSWORD=${db.password || ""}`, "REDIS_APPENDONLY=yes", "REDIS_MAXMEMORY=256mb", "REDIS_MAXMEMORY_POLICY=allkeys-lru"],
			mssql: ["ACCEPT_EULA=Y", `MSSQL_SA_PASSWORD=${db.password || "Root1234!"}`],
			// باگ 654: Neo4j auth format اصلاح شد
			neo4j: [`NEO4J_AUTH=${db.username || "neo4j"}/${db.password || "password"}`],
			elasticsearch: ["discovery.type=single-node", "xpack.security.enabled=false", "ES_JAVA_OPTS=-Xms512m -Xmx512m"],
			cassandra: [`CASSANDRA_USER=${db.username || "cassandra"}`, `CASSANDRA_PASSWORD=${db.password || "cassandra"}`],
			influxdb: ["DOCKER_INFLUXDB_INIT_MODE=setup", `DOCKER_INFLUXDB_INIT_USERNAME=${db.username || "admin"}`, `DOCKER_INFLUXDB_INIT_PASSWORD=${db.password || "root"}`, "DOCKER_INFLUXDB_INIT_ORG=my-org", "DOCKER_INFLUXDB_INIT_BUCKET=my-bucket"],
			// باگ 554: Oracle credentials از config
			oracle: [`ORACLE_PWD=${db.password || "root"}`, "ORACLE_CHARACTERSET=AL32UTF8"],
			db2: ["LICENSE=accept", `DB2INST1_PASSWORD=${db.password || "root"}`, `DBNAME=${db.databaseName || "sample"}`],
			couchdb: [`COUCHDB_USER=${db.username || "admin"}`, `COUCHDB_PASSWORD=${db.password || "root"}`],
			couchbase: [`CB_USERNAME=${db.username || "admin"}`, `CB_PASSWORD=${db.password || "root"}`],
			arangodb: [`ARANGO_ROOT_PASSWORD=${db.password || "root"}`],
			scylladb: [`SCYLLA_USER=${db.username || "root"}`, `SCYLLA_PASS=${db.password || "root"}`],
			cockroachdb: [`COCKROACH_DATABASE=${db.databaseName || "defaultdb"}`, `COCKROACH_USER=${db.username || "root"}`],
			meilisearch: [`MEILI_MASTER_KEY=${db.password || "root"}`, "MEILI_ENV=development"],
			typesense: [`TYPESENSE_API_KEY=${db.password || "root"}`, "TYPESENSE_DATA_DIR=/data"],
			chroma: [`CHROMA_SERVER_AUTH_CREDENTIALS=${db.password || "root"}`, "CHROMA_SERVER_AUTH_PROVIDER=chromadb.auth.token.TokenConfigServerAuthCredentialsProvider"],
			qdrant: ["QDRANT__SERVICE__GRPC_PORT=6334"],
			weaviate: ["AUTHENTICATION_ANONYMOUS_ACCESS_ENABLED=true", "PERSISTENCE_DATA_PATH=/var/lib/weaviate"],
			memcached: ["MEMCACHED_CACHE_SIZE=64"],
			etcd: ["ALLOW_NONE_AUTHENTICATION=yes", `ETCD_ADVERTISE_CLIENT_URLS=http://${serviceName}:2379`],
			aerospike: ["NAMESPACE=test"],
		};

		const envVars = envMap[db.type] || [];
		for (const env of envVars) {
			service += `\n      - ${env}`;
		}

		// باگ 620: Cassandra volume اضافه شد
		service += `
    volumes:
      - ${serviceName}-data:${volumePath}
    healthcheck:
      test: ${this.getDatabaseHealthCheck(db.type)}
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - dockeryzen-network
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"`;

		return service;
	}

	private getDatabaseHealthCheck(dbType: string): string {
		switch (dbType) {
			case "postgresql":
			case "timescaledb":
				return '["CMD-SHELL", "pg_isready -U postgres"]';
			case "mysql":
			case "mariadb":
				return '["CMD", "mysqladmin", "ping", "-h", "localhost"]';
			case "mongodb":
				return '["CMD", "mongosh", "--eval", "db.adminCommand(\'ping\')"]';
			case "redis":
				return '["CMD", "redis-cli", "ping"]';
			case "elasticsearch":
				return '["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]';
			case "cassandra":
				return '["CMD-SHELL", "cqlsh -e \'SELECT now() FROM system.local\' || exit 1"]';
			case "neo4j":
				return '["CMD-SHELL", "cypher-shell -u neo4j -p password \'RETURN 1\' || exit 1"]';
			case "influxdb":
				return '["CMD-SHELL", "curl -f http://localhost:8086/health || exit 1"]';
			case "couchdb":
				return '["CMD-SHELL", "curl -f http://localhost:5984/_up || exit 1"]';
			case "couchbase":
				return '["CMD-SHELL", "curl -f http://localhost:8091/pools || exit 1"]';
			case "arangodb":
				return '["CMD-SHELL", "curl -f http://localhost:8529/_api/version || exit 1"]';
			case "meilisearch":
				return '["CMD-SHELL", "curl -f http://localhost:7700/health || exit 1"]';
			// باگ 556: CockroachDB پورت اصلاح شد
			case "cockroachdb":
				return '["CMD-SHELL", "curl -f http://localhost:26257/health || exit 1"]';
			// باگ 557: TiDB health check اضافه شد
			case "tidb":
				return '["CMD-SHELL", "mysql -h 127.0.0.1 -P 4000 -u root -e \'SELECT 1\' || exit 1"]';
			// باگ 557: YugabyteDB health check اضافه شد
			case "yugabytedb":
				return '["CMD-SHELL", "postgres -c \'SELECT 1\' || exit 1"]';
			case "oracle":
				return '["CMD-SHELL", "sqlplus -s system/root@localhost:1521/ORCL <<< \'SELECT 1 FROM dual;\' | grep -q 1 || exit 1"]';
			case "mssql":
				return '["CMD-SHELL", "sqlcmd -S localhost -U sa -P Root1234! -Q \'SELECT 1\' || exit 1"]';
			default:
				return '["CMD-SHELL", "exit 0"]';
		}
	}

	private generateBackupService(db: any): string {
		const serviceName = `${this.getServiceName(db.type)}-backup`;
		const dbServiceName = this.getServiceName(db.type);
		let backupCmd = "";
		let backupImage = "";

		// باگ 640: password دیگر در command لو نمیره
		if (db.type === "postgresql" || db.type === "timescaledb") {
			backupImage = "postgres:17-alpine";
			backupCmd = `sh -c "while true; do PGPASSWORD='\${DB_PASSWORD}' pg_dump -h ${dbServiceName} -U ${db.username || "postgres"} ${db.databaseName || "postgres"} | gzip > /backup/db_\$(date +%Y%m%d_%H%M%S).sql.gz; find /backup -name '*.gz' -mtime +7 -delete; sleep 86400; done"`;
		} else if (db.type === "mysql" || db.type === "mariadb") {
			backupImage = "mysql:8";
			backupCmd = `sh -c "while true; do MYSQL_PWD='\${DB_PASSWORD}' mysqldump -h ${dbServiceName} -u ${db.username || "root"} ${db.databaseName || "mysql"} | gzip > /backup/db_\$(date +%Y%m%d_%H%M%S).sql.gz; find /backup -name '*.gz' -mtime +7 -delete; sleep 86400; done"`;
		} else if (db.type === "mongodb") {
			backupImage = "mongo:7";
			backupCmd = `sh -c "while true; do mongodump --host ${dbServiceName} -u ${db.username || "root"} -p '\${DB_PASSWORD}' --authenticationDatabase admin --out /backup/dump_\$(date +%Y%m%d_%H%M%S); find /backup -name 'dump_*' -mtime +7 -delete; sleep 86400; done"`;
		} else {
			return "";
		}

		return `  ${serviceName}:
    image: ${backupImage}
    container_name: ${serviceName}-container
    restart: unless-stopped
    command: ${backupCmd}
    environment:
      - DB_PASSWORD=${db.password || "root"}
    volumes:
      - ${serviceName}-data:/backup
    depends_on:
      ${dbServiceName}:
        condition: service_healthy
    networks:
      - dockeryzen-network
    logging:
      driver: json-file
      options:
        max-size: "1m"
        max-file: "3"`;
	}

	private generateMessageQueueService(mq: any): string {
		const serviceName = this.getServiceName(mq.type);
		let image = mq.image;
		if (mq.useAlpine && mq.alpineImage) image = mq.alpineImage;
		if (!image) image = `${mq.type}:${mq.version}`;

		const restartPolicy = this.config.restartPolicy || "unless-stopped";
		let service = `  ${serviceName}:
    image: ${image}
    container_name: ${serviceName}-container
    restart: ${restartPolicy}
    ports:
      - "${mq.externalPort}:${mq.internalPort}"`;

		if (mq.type === "rabbitmq") {
			// باگ 560: پورت management اختیاری
			const mgmtPort = this.config.enableHealthCheck ? '\n      - "15672:15672"' : "";
			service += `${mgmtPort}
    environment:
      - RABBITMQ_DEFAULT_USER=guest
      - RABBITMQ_DEFAULT_PASS=guest
      - RABBITMQ_VM_MEMORY_HIGH_WATERMARK=0.7
      - RABBITMQ_DISK_FREE_LIMIT=2GB`;
		} else if (mq.type === "kafka") {
			if (mq.version.startsWith("2")) {
				service += `
    environment:
      - KAFKA_ZOOKEEPER_CONNECT=${this.getServiceName("zookeeper")}:2181
      - KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:${mq.internalPort}
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://${serviceName}:${mq.internalPort}
      - KAFKA_AUTO_CREATE_TOPICS_ENABLE=true`;
			} else {
				service += `
    environment:
      - KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:${mq.internalPort},CONTROLLER://0.0.0.0:9093
      - KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://${serviceName}:${mq.internalPort}
      - KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER
      - KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      - KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1
      - KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1
      - KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1
      - KAFKA_AUTO_CREATE_TOPICS_ENABLE=true
      - KAFKA_DEFAULT_REPLICATION_FACTOR=1
      - KAFKA_LOG_RETENTION_HOURS=168`;
			}
		} else {
			service += `
    environment:
      - ARTEMIS_USER=admin
      - ARTEMIS_PASSWORD=admin`;
		}

		service += `
    healthcheck:
      test: ${mq.type === "rabbitmq" ? '["CMD", "rabbitmq-diagnostics", "check_port_connectivity"]' : '["CMD-SHELL", "exit 0"]'}
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - dockeryzen-network`;

		return service;
	}

	private generateZookeeperService(): string {
		const serviceName = this.getServiceName("zookeeper");
		return `  ${serviceName}:
    image: confluentinc/cp-zookeeper:latest
    container_name: ${serviceName}-container
    restart: unless-stopped
    ports:
      - "2181:2181"
    environment:
      - ZOOKEEPER_CLIENT_PORT=2181
      - ZOOKEEPER_TICK_TIME=2000
    healthcheck:
      test: ["CMD-SHELL", "echo ruok | nc localhost 2181 | grep imok || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - dockeryzen-network`;
	}

	private generateRedisService(): string {
		const serviceName = this.getServiceName("redis");
		// باگ 623: Redis با password
		return `  ${serviceName}:
    image: redis:8-alpine
    container_name: ${serviceName}-container
    restart: unless-stopped
    ports:
      - "6379:6379"
    command: redis-server --requirepass \${REDIS_PASSWORD}
    environment:
      - REDIS_PASSWORD=root
    volumes:
      - ${serviceName}-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "\${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - dockeryzen-network`;
	}

	private generateNginxService(appServiceName: string): string {
		const serviceName = this.getServiceName("nginx");
		return `  ${serviceName}:
    image: nginx:alpine
    container_name: ${serviceName}-container
    restart: unless-stopped
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      ${appServiceName}:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "nginx", "-t"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - dockeryzen-network`;
	}

	private generateLaravelQueueWorker(appServiceName: string): string {
		const serviceName = this.getServiceName("queue-worker");
		const redisName = this.getServiceName("redis");
		return `  ${serviceName}:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${serviceName}-container
    restart: unless-stopped
    command: php artisan queue:work redis --sleep=3 --tries=3
    depends_on:
      ${appServiceName}:
        condition: service_healthy
      ${redisName}:
        condition: service_healthy
    environment:
      - APP_ENV=production
      - QUEUE_CONNECTION=redis
      - REDIS_HOST=${redisName}
    networks:
      - dockeryzen-network`;
	}

	private generateSidekiqWorker(appServiceName: string): string {
		const serviceName = this.getServiceName("sidekiq");
		const redisName = this.getServiceName("redis");
		return `  ${serviceName}:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ${serviceName}-container
    restart: unless-stopped
    command: bundle exec sidekiq
    depends_on:
      ${appServiceName}:
        condition: service_healthy
      ${redisName}:
        condition: service_healthy
    environment:
      - RAILS_ENV=production
      - REDIS_URL=redis://${redisName}:6379/0
    networks:
      - dockeryzen-network`;
	}

	private generatePrometheusService(): string {
		const serviceName = this.getServiceName("prometheus");
		return `  ${serviceName}:
    image: prom/prometheus:latest
    container_name: ${serviceName}-container
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ${serviceName}-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:9090/-/healthy"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - dockeryzen-network`;
	}

	private generateGrafanaService(): string {
		const serviceName = this.getServiceName("grafana");
		// باگ 566: admin password از environment variable
		return `  ${serviceName}:
    image: grafana/grafana:latest
    container_name: ${serviceName}-container
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_ADMIN_PASSWORD:-admin}
    volumes:
      - ${serviceName}-data:/var/lib/grafana
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - dockeryzen-network`;
	}

	private generateAdditionalService(service: any): string {
		const serviceName = this.getServiceName(service.type);
		let image = service.image;
		if (service.useAlpine && service.alpineImage) image = service.alpineImage;
		if (!image) image = `${service.type}:${service.version}`;

		const restartPolicy = this.config.restartPolicy || "unless-stopped";
		let serviceConfig = `  ${serviceName}:
    image: ${image}
    container_name: ${serviceName}-container
    restart: ${restartPolicy}
    ports:
      - "${service.externalPort}:${service.internalPort}"`;

		if (service.type === "keycloak") {
			// باگ 570: Keycloak بدون PostgreSQL
			const hasPostgres = this.config.databases.some((d) => d.type === "postgresql");
			// باگ 659: Keycloak 26 --optimized
			const optimizedFlag = service.version?.startsWith("26") ? " --optimized" : "";
			serviceConfig += `
    environment:
      - KEYCLOAK_ADMIN=admin
      - KEYCLOAK_ADMIN_PASSWORD=admin${hasPostgres ? `\n      - KC_DB=postgres\n      - KC_DB_URL=jdbc:postgresql://${this.getServiceName("postgresql")}:5432/postgres\n      - KC_DB_USERNAME=postgres\n      - KC_DB_PASSWORD=root` : ""}
    command: start${optimizedFlag}`;
		} else if (service.type === "minio") {
			serviceConfig += `
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - ${serviceName}-data:/data`;
		} else if (service.type === "nginx") {
			serviceConfig += `
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro`;
		} else if (service.type === "grafana") {
			serviceConfig += `
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=\${GRAFANA_ADMIN_PASSWORD:-admin}`;
		}

		serviceConfig += `
    healthcheck:
      test: ["CMD-SHELL", "exit 0"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    networks:
      - dockeryzen-network`;

		return serviceConfig;
	}
}
