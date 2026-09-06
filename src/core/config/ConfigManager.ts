import * as vscode from "vscode";
import type { UserPreferences, JdkVendor, DatabaseType } from "../../types/interfaces";

/**
 * Singleton configuration manager
 */
export class ConfigManager {
	private static instance: ConfigManager;
	private preferences: UserPreferences;
	private cache: Map<string, { data: any; timestamp: number }> = new Map();

	private constructor() {
		this.preferences = this.loadPreferences();
	}

	public static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager();
		}
		return ConfigManager.instance;
	}

	/**
	 * Load user preferences from VS Code settings
	 */
	private loadPreferences(): UserPreferences {
		const config = vscode.workspace.getConfiguration("dockeryzen");

		return {
			jdkImage: (config.get("defaultJdkImage") as JdkVendor) || "eclipse-temurin",
			port: config.get("defaultPort") || 8080,
			jvmOptions: config.get("jvmOptions") || "-Xmx512m -Xms256m",
			enableDebug: config.get("enableDebug") || false,
			enableHealthCheck: config.get("enableHealthCheck") || true,
			databaseType: (config.get("databaseType") as DatabaseType) || "auto",
			databaseVersion: "",
			databaseName: "appdb",
			databaseUsername: "admin",
			databasePassword: "password",
			outputPath: config.get("outputPath") || "",
			imageOptimization: (config.get("imageOptimization") as "alpine" | "full" | "slim") || "alpine",
			enableCompose: true,
			enableDevContainer: false,
			enableCiCd: false,
			enableKubernetes: false,
		};
	}

	/**
	 * Get user preferences
	 */
	public getPreferences(): UserPreferences {
		return this.preferences;
	}

	/**
	 * Update user preferences
	 */
	public updatePreferences(prefs: Partial<UserPreferences>): void {
		this.preferences = { ...this.preferences, ...prefs };
		this.savePreferences();
	}

	/**
	 * Save preferences to VS Code settings
	 */
	private savePreferences(): void {
		const config = vscode.workspace.getConfiguration("dockeryzen");
		config.update("defaultJdkImage", this.preferences.jdkImage, vscode.ConfigurationTarget.Global);
		config.update("defaultPort", this.preferences.port, vscode.ConfigurationTarget.Global);
		config.update("jvmOptions", this.preferences.jvmOptions, vscode.ConfigurationTarget.Global);
		config.update("enableDebug", this.preferences.enableDebug, vscode.ConfigurationTarget.Global);
		config.update("enableHealthCheck", this.preferences.enableHealthCheck, vscode.ConfigurationTarget.Global);
		config.update("databaseType", this.preferences.databaseType, vscode.ConfigurationTarget.Global);
		config.update("outputPath", this.preferences.outputPath, vscode.ConfigurationTarget.Global);
		config.update("imageOptimization", this.preferences.imageOptimization, vscode.ConfigurationTarget.Global);
	}

	/**
	 * Cache analysis results
	 */
	public cacheData(key: string, data: any, timeoutSeconds: number = 300): void {
		this.cache.set(key, {
			data,
			timestamp: Date.now() + timeoutSeconds * 1000,
		});
	}

	/**
	 * Get cached data
	 */
	public getCachedData(key: string): any | undefined {
		const cached = this.cache.get(key);
		if (cached && cached.timestamp > Date.now()) {
			return cached.data;
		}
		if (cached) {
			this.cache.delete(key);
		}
		return undefined;
	}

	/**
	 * Clear cache
	 */
	public clearCache(): void {
		this.cache.clear();
	}
}
