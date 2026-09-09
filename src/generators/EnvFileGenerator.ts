import { ProjectConfig } from "../types/index.js";

export class EnvFileGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const envVars: string[] = ["# ============================================", `# Environment Variables for ${this.config.projectName}`, "# Copy this file to .env and update values", "# ============================================", "", "# Application", `SERVER_PORT=${this.config.port}`];

		// باگ 578 و 685: SPRING_PROFILES_ACTIVE فقط برای Java
		if (this.config.language.startsWith("java")) {
			envVars.push(`SPRING_PROFILES_ACTIVE=production`);
		}
		envVars.push("");

		for (const db of this.config.databases) {
			// باگ 579: برای external URL پورت اضافه نمیشه
			if (!db.useExternalUrl) {
				const prefix = this.getDbPrefix(db.type);
				const defaultDbName = this.getDefaultDbName(db.type);
				envVars.push(`# ${db.type} Database`, `${prefix}_HOST=localhost`, `${prefix}_PORT=${db.internalPort}`, `${prefix}_NAME=${db.databaseName || defaultDbName}`, `${prefix}_USER=${db.username || "root"}`, `${prefix}_PASSWORD=${db.password || "root"}`, "");
			}
		}

		const hasRedisAsDb = this.config.databases.some((d) => d.type === "redis");
		if (this.config.enableRedis && !hasRedisAsDb) {
			envVars.push("# Redis", "REDIS_HOST=localhost", "REDIS_PORT=6379", "REDIS_PASSWORD=", "");
		}

		for (const mq of this.config.messageQueues) {
			const mqPrefix = mq.type.toUpperCase().replace(/-/g, "_");
			envVars.push(`# ${mq.type} Message Queue`, `${mqPrefix}_HOST=localhost`, `${mqPrefix}_PORT=${mq.internalPort}`, "");
		}

		// باگ 627: JWT_SECRET فقط برای js-backend
		const needsJwt = this.config.language === "js-backend" || this.config.language === "laravel" || this.config.language === "rails" || this.config.framework === "spring-boot";

		if (needsJwt) {
			envVars.push("# Security", "JWT_SECRET=your-secret-key-change-this-in-production", "JWT_EXPIRATION=86400", "");
		}

		if (this.config.enableHealthCheck) {
			envVars.push(
				"# Monitoring",
				"PROMETHEUS_PORT=9090",
				"GRAFANA_PORT=3000",
				"GRAFANA_ADMIN_USER=admin",
				// باگ 698: Grafana password اشاره به env variable
				"GRAFANA_ADMIN_PASSWORD=change-me-in-production",
				"",
			);
		}

		envVars.push(
			"# ============================================",
			"# Notes:",
			"# - Never commit .env file to git",
			"# - Use .env.example as template",
			// باگ 649: هشدار امنیتی
			"# - Change all passwords in production",
			"# - Use secrets manager for production",
			"# ============================================",
		);

		return envVars.join("\n");
	}

	private getDbPrefix(dbType: string): string {
		const prefixMap: Record<string, string> = {
			postgresql: "POSTGRES",
			timescaledb: "TIMESCALE",
			mysql: "MYSQL",
			mariadb: "MARIADB",
			mongodb: "MONGO",
			redis: "REDIS",
			mssql: "MSSQL",
			oracle: "ORACLE",
			db2: "DB2",
			couchdb: "COUCHDB",
			couchbase: "COUCHBASE",
			cassandra: "CASSANDRA",
			scylladb: "SCYLLA",
			influxdb: "INFLUXDB",
			neo4j: "NEO4J",
			arangodb: "ARANGO",
			elasticsearch: "ELASTICSEARCH",
			memcached: "MEMCACHED",
			etcd: "ETCD",
			aerospike: "AEROSPIKE",
			cockroachdb: "COCKROACH",
			tidb: "TIDB",
			yugabytedb: "YUGABYTE",
		};
		return prefixMap[dbType] || dbType.toUpperCase().replace(/-/g, "_");
	}

	private getDefaultDbName(dbType: string): string {
		const defaultNames: Record<string, string> = {
			postgresql: "postgres",
			timescaledb: "postgres",
			mysql: "mysql",
			mariadb: "mysql",
			mongodb: "admin",
			redis: "",
			mssql: "master",
			oracle: "ORCL",
			db2: "sample",
			couchdb: "_users",
			couchbase: "default",
			cassandra: "system",
			scylladb: "system",
			influxdb: "my-bucket",
			neo4j: "neo4j",
			arangodb: "_system",
			elasticsearch: "elasticsearch",
			cockroachdb: "defaultdb",
			tidb: "test",
			yugabytedb: "yugabyte",
		};
		return defaultNames[dbType] || "postgres";
	}
}
