import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { DatabaseType } from "../../types/interfaces.js";

/**
 * Add database service to existing docker-compose.yml
 */
export class AddDatabaseCommand {
	/**
	 * Execute add database command
	 */
	public async execute(): Promise<void> {
		try {
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			if (!workspaceFolder) {
				vscode.window.showErrorMessage("No workspace folder found.");
				return;
			}

			// Find docker-compose.yml
			const composePath = path.join(workspaceFolder.uri.fsPath, "docker-compose.yml");
			if (!(await fs.pathExists(composePath))) {
				vscode.window.showErrorMessage("docker-compose.yml not found. Please generate Docker files first.");
				return;
			}

			// Select database type
			const dbTypeChoice = await vscode.window.showQuickPick(
				[
					{ label: "PostgreSQL", description: "Recommended", detail: DatabaseType.POSTGRESQL },
					{ label: "MySQL", description: "Popular", detail: DatabaseType.MYSQL },
					{ label: "MariaDB", description: "MySQL fork", detail: DatabaseType.MARIADB },
					{ label: "MongoDB", description: "NoSQL", detail: DatabaseType.MONGODB },
					{ label: "Redis", description: "Cache", detail: DatabaseType.REDIS },
					{ label: "Cassandra", description: "Distributed", detail: DatabaseType.CASSANDRA },
					{ label: "Elasticsearch", description: "Search", detail: DatabaseType.ELASTICSEARCH },
					{ label: "Neo4j", description: "Graph", detail: DatabaseType.NEO4J },
				],
				{
					placeHolder: "Select database type to add:",
					title: "Dockeryzen - Add Database",
				},
			);

			if (!dbTypeChoice) {
				return;
			}

			// Get database configuration
			const dbName = await vscode.window.showInputBox({
				prompt: "Enter database name:",
				value: "appdb",
			});

			if (!dbName) {
				return;
			}

			const dbUser = await vscode.window.showInputBox({
				prompt: "Enter database username:",
				value: "admin",
			});

			if (!dbUser) {
				return;
			}

			const dbPass = await vscode.window.showInputBox({
				prompt: "Enter database password:",
				value: "password",
				password: true,
			});

			if (!dbPass) {
				return;
			}

			const dbType = dbTypeChoice.detail as DatabaseType;
			const dbPort = this.getDefaultDbPort(dbType);
			const dbVersion = this.getDefaultVersion(dbType);

			// Generate database service
			const dbService = this.generateDatabaseService(dbType, {
				name: dbName,
				username: dbUser,
				password: dbPass,
				version: dbVersion,
				port: dbPort,
			});

			// Read existing compose file
			const composeContent = await fs.readFile(composePath, "utf8");

			// Add database service to compose
			const updatedCompose = this.addServiceToCompose(composeContent, dbService);

			// Write updated compose file
			await fs.writeFile(composePath, updatedCompose, "utf8");

			// Update .env if exists
			const envPath = path.join(workspaceFolder.uri.fsPath, ".env");
			if (await fs.pathExists(envPath)) {
				let envContent = await fs.readFile(envPath, "utf8");

				// Add database env vars to .env
				const dbEnvVars = [`SPRING_DATASOURCE_URL=jdbc:${dbType}://${dbType}:${dbPort}/${dbName}`, `SPRING_DATASOURCE_USERNAME=${dbUser}`, `SPRING_DATASOURCE_PASSWORD=${dbPass}`].join("\n");

				// Remove old database section if exists
				envContent = envContent.replace(/# Database Configuration[\s\S]*?(?=# |$)/, "");

				// Add new database section
				envContent = `# Database Configuration\n${dbEnvVars}\n\n` + envContent;

				await fs.writeFile(envPath, envContent, "utf8");
			} else {
				// Create .env if doesn't exist
				const envContent = `# Database Configuration
SPRING_DATASOURCE_URL=jdbc:${dbType}://${dbType}:${dbPort}/${dbName}
SPRING_DATASOURCE_USERNAME=${dbUser}
SPRING_DATASOURCE_PASSWORD=${dbPass}

# SECURITY WARNING: Do not commit this file to version control!
# Add .env to .gitignore immediately.`;

				await fs.writeFile(envPath, envContent, "utf8");
			}

			vscode.window.showInformationMessage(`Dockeryzen: Added ${dbTypeChoice.label} to docker-compose.yml and .env`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to add database: ${error}`);
		}
	}

	/**
	 * Generate database service YAML
	 */
	private generateDatabaseService(dbType: DatabaseType, config: any): string {
		const dbTypeName = dbType.toString().toLowerCase();

		const imageMap: Record<DatabaseType, string> = {
			[DatabaseType.POSTGRESQL]: `postgres:${config.version}`,
			[DatabaseType.MYSQL]: `mysql:${config.version}`,
			[DatabaseType.MARIADB]: `mariadb:${config.version}`,
			[DatabaseType.MONGODB]: `mongo:${config.version}`,
			[DatabaseType.REDIS]: `redis:${config.version}`,
			[DatabaseType.CASSANDRA]: `cassandra:${config.version}`,
			[DatabaseType.ELASTICSEARCH]: `docker.elastic.co/elasticsearch/elasticsearch:${config.version}`,
			[DatabaseType.NEO4J]: `neo4j:${config.version}`,
			[DatabaseType.H2]: `h2:${config.version}`,
			[DatabaseType.NONE]: "",
		};

		const envMap: Record<DatabaseType, string> = {
			[DatabaseType.POSTGRESQL]: `      POSTGRES_DB: ${config.name}\n      POSTGRES_USER: ${config.username}\n      POSTGRES_PASSWORD: ${config.password}`,
			[DatabaseType.MYSQL]: `      MYSQL_DATABASE: ${config.name}\n      MYSQL_USER: ${config.username}\n      MYSQL_PASSWORD: ${config.password}\n      MYSQL_ROOT_PASSWORD: ${config.password}`,
			[DatabaseType.MARIADB]: `      MARIADB_DATABASE: ${config.name}\n      MARIADB_USER: ${config.username}\n      MARIADB_PASSWORD: ${config.password}\n      MARIADB_ROOT_PASSWORD: ${config.password}`,
			[DatabaseType.MONGODB]: `      MONGO_INITDB_DATABASE: ${config.name}\n      MONGO_INITDB_ROOT_USERNAME: ${config.username}\n      MONGO_INITDB_ROOT_PASSWORD: ${config.password}`,
			[DatabaseType.REDIS]: ``,
			[DatabaseType.CASSANDRA]: ``,
			[DatabaseType.ELASTICSEARCH]: `      ES_JAVA_OPTS: "-Xms512m -Xmx512m"`,
			[DatabaseType.NEO4J]: `      NEO4J_AUTH: ${config.username}/${config.password}`,
			[DatabaseType.H2]: ``,
			[DatabaseType.NONE]: ``,
		};

		const healthCheckMap: Record<DatabaseType, string> = {
			[DatabaseType.POSTGRESQL]: `      test: ["CMD-SHELL", "pg_isready -U ${config.username}"]`,
			[DatabaseType.MYSQL]: `      test: ["CMD-SHELL", "mysqladmin ping -h localhost"]`,
			[DatabaseType.MARIADB]: `      test: ["CMD-SHELL", "mysqladmin ping -h localhost"]`,
			[DatabaseType.MONGODB]: `      test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand({ ping: 1 })"]`,
			[DatabaseType.REDIS]: `      test: ["CMD", "redis-cli", "ping"]`,
			[DatabaseType.CASSANDRA]: `      test: ["CMD-SHELL", "cqlsh -e 'DESCRIBE system'"]`,
			[DatabaseType.ELASTICSEARCH]: `      test: ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"]`,
			[DatabaseType.NEO4J]: `      test: ["CMD-SHELL", "cypher-shell -u ${config.username} -p ${config.password} 'RETURN 1'"]`,
			[DatabaseType.H2]: ``,
			[DatabaseType.NONE]: ``,
		};

		const volumeMap: Record<DatabaseType, string> = {
			[DatabaseType.POSTGRESQL]: `/var/lib/postgresql/data`,
			[DatabaseType.MYSQL]: `/var/lib/mysql`,
			[DatabaseType.MARIADB]: `/var/lib/mysql`,
			[DatabaseType.MONGODB]: `/data/db`,
			[DatabaseType.REDIS]: `/data`,
			[DatabaseType.CASSANDRA]: `/var/lib/cassandra`,
			[DatabaseType.ELASTICSEARCH]: `/usr/share/elasticsearch/data`,
			[DatabaseType.NEO4J]: `/data`,
			[DatabaseType.H2]: `/opt/h2-data`,
			[DatabaseType.NONE]: ``,
		};

		const image = imageMap[dbType] || `postgres:latest`;
		const env = envMap[dbType] || "";
		const healthCheck = healthCheckMap[dbType] || "";
		const volumePath = volumeMap[dbType] || "/data";

		return `  ${dbTypeName}:
    image: ${image}
    ports:
      - "${config.port}:${config.port}"
${env ? `    environment:\n${env}\n` : ""}    volumes:
      - ${dbTypeName}-data:${volumePath}
${healthCheck ? `    healthcheck:\n${healthCheck}\n      interval: 30s\n      timeout: 3s\n      retries: 5\n` : ""}    restart: unless-stopped
    networks:
      - dockeryzen-network
`;
	}

	/**
	 * Add service to existing compose file
	 */
	private addServiceToCompose(composeContent: string, dbService: string): string {
		const servicesMatch = composeContent.match(/services:\n/);
		if (!servicesMatch) {
			return composeContent;
		}

		const servicesIndex = servicesMatch.index! + servicesMatch[0].length;

		let updatedContent = composeContent.slice(0, servicesIndex) + dbService + composeContent.slice(servicesIndex);

		// Add volume if not exists
		const dbTypeMatch = dbService.match(/  (\w+):/);
		const dbType = dbTypeMatch?.[1] || "database";

		if (!updatedContent.includes("volumes:")) {
			updatedContent += `\nvolumes:\n  ${dbType}-data:\n`;
		} else {
			const volumeRegex = new RegExp(`  ${dbType}-data:`);
			if (!volumeRegex.test(updatedContent)) {
				updatedContent = updatedContent.replace(/volumes:\n/, `volumes:\n  ${dbType}-data:\n`);
			}
		}

		return updatedContent;
	}

	/**
	 * Get default database version
	 */
	private getDefaultVersion(dbType: DatabaseType): string {
		const versions: Record<DatabaseType, string> = {
			[DatabaseType.POSTGRESQL]: "16",
			[DatabaseType.MYSQL]: "8.4",
			[DatabaseType.MARIADB]: "11",
			[DatabaseType.MONGODB]: "7",
			[DatabaseType.REDIS]: "7",
			[DatabaseType.CASSANDRA]: "5",
			[DatabaseType.ELASTICSEARCH]: "8",
			[DatabaseType.NEO4J]: "5",
			[DatabaseType.H2]: "latest",
			[DatabaseType.NONE]: "latest",
		};

		return versions[dbType] || "latest";
	}

	/**
	 * Get default database port
	 */
	private getDefaultDbPort(dbType: DatabaseType): number {
		const ports: Record<DatabaseType, number> = {
			[DatabaseType.POSTGRESQL]: 5432,
			[DatabaseType.MYSQL]: 3306,
			[DatabaseType.MARIADB]: 3306,
			[DatabaseType.MONGODB]: 27017,
			[DatabaseType.REDIS]: 6379,
			[DatabaseType.CASSANDRA]: 9042,
			[DatabaseType.ELASTICSEARCH]: 9200,
			[DatabaseType.NEO4J]: 7687,
			[DatabaseType.H2]: 9092,
			[DatabaseType.NONE]: 0,
		};

		return ports[dbType] || 5432;
	}
}
