import { ProjectConfig } from "../types/index.js";

/**
 * EnvFileGenerator class - Generates .env.example file
 * Fixed bugs: 355-357, 373, 391-392, 416
 */
export class EnvFileGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const envVars: string[] = [
			"# ============================================",
			`# Environment Variables for ${this.config.projectName}`,
			"# Copy this file to .env and update values",
			"# ============================================",
			"",
			"# Application",
			`SERVER_PORT=${this.config.port}`,
			`SPRING_PROFILES_ACTIVE=production`,
			"",
		];

		// Fix bug 356, 392: Use prefixed DB env vars instead of generic DB_HOST
		for (const db of this.config.databases) {
			if (!db.useExternalUrl) {
				const prefix = this.getDbPrefix(db.type);
				// Fix bug 355, 373: Proper default database name per DB type
				const defaultDbName = this.getDefaultDbName(db.type);

				envVars.push(`# ${db.type} Database`, `${prefix}_HOST=localhost`, `${prefix}_PORT=${db.internalPort}`, `${prefix}_NAME=${db.databaseName || defaultDbName}`, `${prefix}_USER=${db.username || "root"}`, `${prefix}_PASSWORD=${db.password || "root"}`, "");
			}
		}

		// Fix bug 357: Only one Redis section
		const hasRedisAsDb = this.config.databases.some((d) => d.type === "redis");
		if (this.config.enableRedis && !hasRedisAsDb) {
			envVars.push("# Redis", "REDIS_HOST=localhost", "REDIS_PORT=6379", "REDIS_PASSWORD=", "");
		}

		// Message queue env vars
		for (const mq of this.config.messageQueues) {
			const mqPrefix = mq.type.toUpperCase().replace(/-/g, "_");
			envVars.push(`# ${mq.type} Message Queue`, `${mqPrefix}_HOST=localhost`, `${mqPrefix}_PORT=${mq.internalPort}`, "");
		}

		// Fix bug 416: JWT only for web frameworks that need it
		const needsJwt = this.config.language.startsWith("js") || this.config.language === "laravel" || this.config.language === "rails" || this.config.framework === "spring-boot";

		if (needsJwt) {
			envVars.push("# Security", "JWT_SECRET=your-secret-key-change-this-in-production", "JWT_EXPIRATION=86400", "");
		}

		// Monitoring
		if (this.config.enableHealthCheck) {
			envVars.push("# Monitoring", "PROMETHEUS_PORT=9090", "GRAFANA_PORT=3000", "GRAFANA_ADMIN_USER=admin", "GRAFANA_ADMIN_PASSWORD=admin", "");
		}

		envVars.push("# ============================================", "# Notes:", "# - Never commit .env file to git", "# - Use .env.example as template", "# - Change all passwords in production", "# ============================================");

		return envVars.join("\n");
	}

	/**
	 * Get env var prefix for database type
	 * Fix bug 356, 392
	 */
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
		};
		return prefixMap[dbType] || dbType.toUpperCase().replace(/-/g, "_");
	}

	/**
	 * Get default database name per type
	 * Fix bug 355, 373
	 */
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
		};
		return defaultNames[dbType] || "postgres";
	}
}
