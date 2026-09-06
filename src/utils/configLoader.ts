import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export interface VersionConfig {
	[version: string]: string; // version -> template path
}

export interface FacetConfig {
	name: string;
	extension: string;
	route: string;
	description: string;
	version: VersionConfig;
}

export interface LanguageConfig {
	[facetName: string]: FacetConfig;
}

export interface FacetConfiguration {
	[language: string]: LanguageConfig;
}

export class ConfigLoader {
	private config: FacetConfiguration;
	private configPath: string;
	private watcher: vscode.FileSystemWatcher | undefined;

	constructor(private context: vscode.ExtensionContext) {
		this.configPath = path.join(context.extensionPath, "info.json");
		this.config = this.loadConfig();
		this.setupWatcher();
	}

	private loadConfig(): FacetConfiguration {
		try {
			if (!fs.existsSync(this.configPath)) {
				vscode.window.showErrorMessage("info.json not found! Creating default configuration...");
				this.createDefaultConfig();
			}

			const content = fs.readFileSync(this.configPath, "utf-8");
			const config = JSON.parse(content);

			// Validate config
			this.validateConfig(config);

			return config;
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to load info.json: ${error instanceof Error ? error.message : error}`);
			return {};
		}
	}

	private setupWatcher() {
		this.watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.context.extensionPath, "info.json"));

		this.watcher.onDidChange(() => {
			vscode.window.showInformationMessage("Configuration updated. Reloading...");
			this.reloadConfig();
		});

		this.context.subscriptions.push(this.watcher);
	}

	private validateConfig(config: any) {
		for (const [lang, facets] of Object.entries(config)) {
			if (typeof facets !== "object") {
				throw new Error(`Invalid configuration for language: ${lang}`);
			}

			for (const [facetName, facetConfig] of Object.entries(facets as any)) {
				const fc = facetConfig as FacetConfig;
				if ((!fc.name && !fc.extension) || !fc.route || !fc.version) {
					throw new Error(`Invalid facet configuration: ${lang}.${facetName}`);
				}
			}
		}
	}

	private createDefaultConfig() {
		const defaultConfig: FacetConfiguration = {
			java: {
				maven: {
					name: "pom",
					extension: ".xml",
					route: "./~",
					description: "Maven Project Configuration",
					version: {
						"1.0": "./lib/java/maven/v1.0.ts",
					},
				},
			},
		};

		fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 4), "utf-8");
	}

	public reloadConfig(): void {
		this.config = this.loadConfig();
		vscode.commands.executeCommand("facetGenerator.refreshTree");
	}

	public getConfig(): FacetConfiguration {
		return this.config;
	}

	public getLanguageConfig(language: string): LanguageConfig | undefined {
		return this.config[language];
	}

	public getFacetConfig(language: string, facetName: string): FacetConfig | undefined {
		return this.config[language]?.[facetName];
	}

	public getLanguages(): string[] {
		return Object.keys(this.config);
	}
}
