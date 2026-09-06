import * as vscode from "vscode";
import { ConfigLoader, FacetConfig } from "./utils/configLoader.js";

export class FacetTreeProvider implements vscode.TreeDataProvider<FacetTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<FacetTreeItem | undefined | null | void> = new vscode.EventEmitter<FacetTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<FacetTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private currentState: {
		language?: string;
		facet?: string;
	} = {};

	constructor(private configLoader: ConfigLoader) {}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	reset(): void {
		this.currentState = {};
		this.refresh();
	}

	getTreeItem(element: FacetTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: FacetTreeItem): Promise<FacetTreeItem[]> {
		if (!element) {
			return this.getLanguageItems();
		}

		switch (element.type) {
			case "language":
				return this.getFacetItems(element.language!);
			case "facet":
				return this.getVersionItems(element.language!, element.facetKey!);
			case "version":
				return []; // Terminal node
			default:
				return [];
		}
	}

	private getLanguageItems(): FacetTreeItem[] {
		const config = this.configLoader.getConfig();
		const languages = Object.keys(config);

		if (languages.length === 0) {
			return [new FacetTreeItem("No languages configured", "info", vscode.TreeItemCollapsibleState.None)];
		}

		return languages.map((lang) => {
			const facets = Object.keys(config[lang] || {});
			const item = new FacetTreeItem(`${this.getLanguageIcon(lang)} ${lang.toUpperCase()}`, "language", vscode.TreeItemCollapsibleState.Collapsed);
			item.language = lang;
			item.description = `${facets.length} facets`;
			item.tooltip = `Language: ${lang}\nFacets: ${facets.join(", ")}`;
			item.iconPath = new vscode.ThemeIcon("folder-library");
			return item;
		});
	}

	private getFacetItems(language: string): FacetTreeItem[] {
		const config = this.configLoader.getConfig();
		const facets = config[language] || {};

		if (Object.keys(facets).length === 0) {
			return [new FacetTreeItem("No facets available", "info", vscode.TreeItemCollapsibleState.None)];
		}

		return Object.entries(facets).map(([key, facetConfig]: [string, any]) => {
			const item = new FacetTreeItem(`📄 ${facetConfig.name}${facetConfig.extension}`, "facet", vscode.TreeItemCollapsibleState.Collapsed);
			item.language = language;
			item.facetKey = key;
			item.facetConfig = facetConfig;
			item.description = facetConfig.description || "";
			item.tooltip = [`Name: ${facetConfig.name}${facetConfig.extension}`, `Description: ${facetConfig.description}`, `Path: ${facetConfig.route}`, `Versions: ${Object.keys(facetConfig.version).join(", ")}`].join("\n");
			item.iconPath = new vscode.ThemeIcon("file-code");
			return item;
		});
	}

	private getVersionItems(language: string, facetKey: string): FacetTreeItem[] {
		const config = this.configLoader.getConfig();
		const facetConfig = config[language]?.[facetKey];

		if (!facetConfig?.version) {
			return [];
		}

		const versions = Object.entries(facetConfig.version);

		return versions.map(([version, templatePath]) => {
			const item = new FacetTreeItem(`🎯 Version ${version}`, "version", vscode.TreeItemCollapsibleState.None);
			item.language = language;
			item.facetKey = facetKey;
			item.facetConfig = facetConfig;
			item.version = version;
			item.templatePath = templatePath as string;
			item.description = `Template: ${templatePath}`;
			item.tooltip = `Version: ${version}\nTemplate: ${templatePath}`;
			item.iconPath = new vscode.ThemeIcon("versions");

			// Make it clickable to generate
			item.command = {
				command: "facetGenerator.generateFile",
				title: "Generate File",
				arguments: [language, facetKey, version],
			};

			return item;
		});
	}

	private getLanguageIcon(language: string): string {
		const icons: { [key: string]: string } = {
			java: "☕",
			javascript: "🟨",
			typescript: "🔷",
			python: "🐍",
			csharp: "🔮",
			go: "🔵",
			rust: "🦀",
			cpp: "⚡",
			ruby: "💎",
			php: "🐘",
			swift: "🕊️",
		};
		return icons[language.toLowerCase()] || "📦";
	}
}

export class FacetTreeItem extends vscode.TreeItem {
	language?: string;
	facetKey?: string;
	facetConfig?: FacetConfig;
	version?: string;
	templatePath?: string;

	constructor(
		label: string,
		public readonly type: "language" | "facet" | "version" | "info",
		collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
	}
}
