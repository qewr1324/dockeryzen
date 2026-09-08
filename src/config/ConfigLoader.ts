import * as fs from "fs-extra";
import * as path from "path";

export class ConfigLoader {
	private static configCache: Map<string, any> = new Map();

	static async loadConfig(configPath: string): Promise<any> {
		const fullPath = path.join(__dirname, "..", "config", configPath);

		if (this.configCache.has(fullPath)) {
			return this.configCache.get(fullPath);
		}

		try {
			const content = await fs.readFile(fullPath, "utf-8");
			const config = JSON.parse(content);
			this.configCache.set(fullPath, config);
			return config;
		} catch (error) {
			console.error(`Failed to load config: ${fullPath}`, error);
			throw error;
		}
	}

	static async loadAllDatabases(): Promise<any[]> {
		const databaseConfigs = ["databases/sql.json", "databases/nosql.json", "databases/key-value.json", "databases/wide-column.json", "databases/graph.json", "databases/time-series.json", "databases/search-engines.json", "databases/newsql.json", "databases/vector.json"];

		const allDatabases: any[] = [];

		for (const configPath of databaseConfigs) {
			const config = await this.loadConfig(configPath);
			if (config && config.databases) {
				for (const db of config.databases) {
					allDatabases.push({
						...db,
						category: config.category,
					});
				}
			}
		}

		return allDatabases;
	}
}
