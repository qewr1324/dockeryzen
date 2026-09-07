import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { DatabaseType } from "../../types/interfaces.js";

export class AddDatabaseCommand {
	public async execute(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage("No workspace folder found.");
				return;
			}

			const composePath = path.join(workspaceFolder.uri.fsPath, "docker-compose.yml");
			if (!(await fs.pathExists(composePath))) {
				vscode.window.showErrorMessage("docker-compose.yml not found.");
				return;
			}

			const dbTypeChoice = await vscode.window.showQuickPick(
				[
					{ label: "PostgreSQL", detail: DatabaseType.POSTGRESQL },
					{ label: "MySQL", detail: DatabaseType.MYSQL },
					{ label: "MariaDB", detail: DatabaseType.MARIADB },
					{ label: "MongoDB", detail: DatabaseType.MONGODB },
					{ label: "Redis", detail: DatabaseType.REDIS },
					{ label: "Cassandra", detail: DatabaseType.CASSANDRA },
					{ label: "Elasticsearch", detail: DatabaseType.ELASTICSEARCH },
					{ label: "Neo4j", detail: DatabaseType.NEO4J },
				],
				{ placeHolder: "Select database type to add:" },
			);

			if (!dbTypeChoice) return;

			const dbName = await vscode.window.showInputBox({ prompt: "Database name:", value: "appdb" });
			if (!dbName) return;

			const dbUser = await vscode.window.showInputBox({ prompt: "Username:", value: "admin" });
			if (!dbUser) return;

			const dbPass = await vscode.window.showInputBox({ prompt: "Password:", value: "password", password: true });
			if (!dbPass) return;

			const dbType = dbTypeChoice.detail as DatabaseType;
			const dbPort = this.getPort(dbType);
			const dbVersion = this.getVersion(dbType);
			const dbTypeName = dbType.toString().toLowerCase();

			const composeContent = await fs.readFile(composePath, "utf8");

			if (composeContent.includes(`  ${dbTypeName}:`)) {
				vscode.window.showErrorMessage(`${dbTypeName} already exists!`);
				return;
			}

			// Build the new service
			const service = this.buildService(dbType, dbTypeName, dbName, dbUser, dbPass, dbPort, dbVersion);

			// Parse existing compose and rebuild it
			const updatedCompose = this.rebuildCompose(composeContent, service, dbTypeName);

			await fs.writeFile(composePath, updatedCompose, "utf8");

			// Update .env
			await this.rebuildEnv(workspaceFolder.uri.fsPath, dbName, dbUser, dbPass);

			vscode.window.showInformationMessage(`Added ${dbTypeChoice.label}!`);
		} catch (error) {
			vscode.window.showErrorMessage(`Error: ${error}`);
		}
	}

	/**
	 * Rebuild the entire docker-compose.yml cleanly
	 */
	private rebuildCompose(composeContent: string, newService: string, newDbType: string): string {
		// Extract app service
		const appMatch = composeContent.match(/  app:[\s\S]*?(?=\n  \w+:|\n\w+:|\n$)/);
		const appService = appMatch ? appMatch[0] : "";

		// Extract all existing database services
		const dbTypes = ["postgresql", "mysql", "mariadb", "mongodb", "redis", "cassandra", "elasticsearch", "neo4j"];
		const services: string[] = [];

		for (const db of dbTypes) {
			if (db === newDbType) continue; // Skip the new one, we'll add it separately

			const regex = new RegExp(`  ${db}:\\n[\\s\\S]*?(?=\\n  \\w+:|\\n\\w+:|\\n$)`, "g");
			const match = composeContent.match(regex);
			if (match && match[0]) {
				services.push(match[0]);
			}
		}

		// Add the new service
		services.push(newService);

		// Build the compose file
		let result = `version: '3.9'

services:
`;

		// Add app service first if exists
		if (appService) {
			result += appService + "\n";
		}

		// Add all database services
		for (const service of services) {
			result += service + "\n";
		}

		// Add volumes section
		result += `volumes:
`;

		// Add volumes for all databases found
		const allServices = result;
		for (const db of dbTypes) {
			if (allServices.includes(`  ${db}:`)) {
				result += `  ${db}-data:
`;
			}
		}

		// Add networks
		result += `
networks:
  dockeryzen-network:
    driver: bridge
`;

		return result;
	}

	/**
	 * Rebuild .env file cleanly
	 */
	private async rebuildEnv(workspacePath: string, dbName: string, dbUser: string, dbPass: string): Promise<void> {
		const composePath = path.join(workspacePath, "docker-compose.yml");
		const composeContent = await fs.readFile(composePath, "utf8");

		const dbTypes = ["postgresql", "mysql", "mariadb", "mongodb", "redis", "cassandra", "elasticsearch", "neo4j"];
		const foundDbs = dbTypes.filter((db) => composeContent.includes(`  ${db}:`));

		let envContent = "";

		if (foundDbs.length > 0) {
			envContent += "# Database Configuration\n";
			for (const db of foundDbs) {
				const dbTypeEnum = db.toUpperCase() as DatabaseType;
				const port = this.getPort(dbTypeEnum);
				envContent += `SPRING_DATASOURCE_URL=jdbc:${db}://${db}:${port}/${dbName}\n`;
				envContent += `SPRING_DATASOURCE_USERNAME=${dbUser}\n`;
				envContent += `SPRING_DATASOURCE_PASSWORD=${dbPass}\n`;
				envContent += "\n";
			}
		}

		envContent += "# SECURITY WARNING: Do not commit this file to version control!\n";
		envContent += "# Add .env to .gitignore immediately.";

		const envPath = path.join(workspacePath, ".env");
		await fs.writeFile(envPath, envContent, "utf8");
	}

	private buildService(dbType: DatabaseType, name: string, dbName: string, dbUser: string, dbPass: string, port: number, version: string): string {
		const images: Record<string, string> = {
			postgresql: `postgres:${version}`,
			mysql: `mysql:${version}`,
			mariadb: `mariadb:${version}`,
			mongodb: `mongo:${version}`,
			redis: `redis:${version}`,
			cassandra: `cassandra:${version}`,
			elasticsearch: `docker.elastic.co/elasticsearch/elasticsearch:${version}`,
			neo4j: `neo4j:${version}`,
		};

		const envs: Record<string, string> = {
			postgresql: `      POSTGRES_DB: ${dbName}\n      POSTGRES_USER: ${dbUser}\n      POSTGRES_PASSWORD: ${dbPass}`,
			mysql: `      MYSQL_DATABASE: ${dbName}\n      MYSQL_USER: ${dbUser}\n      MYSQL_PASSWORD: ${dbPass}\n      MYSQL_ROOT_PASSWORD: ${dbPass}`,
			mariadb: `      MARIADB_DATABASE: ${dbName}\n      MARIADB_USER: ${dbUser}\n      MARIADB_PASSWORD: ${dbPass}\n      MARIADB_ROOT_PASSWORD: ${dbPass}`,
			mongodb: `      MONGO_INITDB_DATABASE: ${dbName}\n      MONGO_INITDB_ROOT_USERNAME: ${dbUser}\n      MONGO_INITDB_ROOT_PASSWORD: ${dbPass}`,
			redis: "",
			cassandra: "",
			elasticsearch: '      ES_JAVA_OPTS: "-Xms512m -Xmx512m"',
			neo4j: `      NEO4J_AUTH: ${dbUser}/${dbPass}`,
		};

		const healthChecks: Record<string, string> = {
			postgresql: `      test: ["CMD-SHELL", "pg_isready -U ${dbUser}"]`,
			mysql: `      test: ["CMD-SHELL", "mysqladmin ping -h localhost"]`,
			mariadb: `      test: ["CMD-SHELL", "mysqladmin ping -h localhost"]`,
			mongodb: `      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand({ ping: 1 })"]`,
			redis: `      test: ["CMD", "redis-cli", "ping"]`,
			cassandra: `      test: ["CMD-SHELL", "cqlsh -e 'DESCRIBE system'"]`,
			elasticsearch: `      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]`,
			neo4j: `      test: ["CMD-SHELL", "cypher-shell -u ${dbUser} -p ${dbPass} 'RETURN 1'"]`,
		};

		const volumes: Record<string, string> = {
			postgresql: "/var/lib/postgresql/data",
			mysql: "/var/lib/mysql",
			mariadb: "/var/lib/mysql",
			mongodb: "/data/db",
			redis: "/data",
			cassandra: "/var/lib/cassandra",
			elasticsearch: "/usr/share/elasticsearch/data",
			neo4j: "/data",
		};

		const image = images[name] || `postgres:latest`;
		const env = envs[name] || "";
		const health = healthChecks[name] || "";
		const volumePath = volumes[name] || "/data";

		let result = `  ${name}:
    image: ${image}
    ports:
      - "${port}:${port}"
`;

		if (env) {
			result += `    environment:\n${env}\n`;
		}

		result += `    volumes:
      - ${name}-data:${volumePath}
`;

		if (health) {
			result += `    healthcheck:\n${health}\n      interval: 30s\n      timeout: 3s\n      retries: 5\n`;
		}

		result += `    restart: unless-stopped
    networks:
      - dockeryzen-network
`;

		return result;
	}

	private getPort(dbType: DatabaseType): number {
		const ports: Record<string, number> = {
			postgresql: 5432,
			mysql: 3306,
			mariadb: 3306,
			mongodb: 27017,
			redis: 6379,
			cassandra: 9042,
			elasticsearch: 9200,
			neo4j: 7687,
		};
		return ports[dbType] || 5432;
	}

	private getVersion(dbType: DatabaseType): string {
		const versions: Record<string, string> = {
			postgresql: "16",
			mysql: "8.4",
			mariadb: "11",
			mongodb: "7",
			redis: "7",
			cassandra: "5",
			elasticsearch: "8",
			neo4j: "5",
		};
		return versions[dbType] || "latest";
	}
}
