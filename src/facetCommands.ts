import * as vscode from "vscode";
import { ConfigLoader } from "./utils/configLoader.js";
import { FileGenerator } from "./utils/fileGenerator.js";

export function registerFacetCommands(context: vscode.ExtensionContext, configLoader: ConfigLoader) {
	// Command: Open Panel (from status bar click)
	context.subscriptions.push(
		vscode.commands.registerCommand("facetGenerator.generateFromStatusBar", async () => {
			await showGenerationFlow(configLoader);
		}),
	);

	// Command: Generate File
	context.subscriptions.push(
		vscode.commands.registerCommand("facetGenerator.generateFile", async (language: string, facetKey: string, version: string) => {
			const generator = new FileGenerator(context, configLoader);
			await generator.generateFile(language, facetKey, version);
		}),
	);

	// Command: Reload Config
	context.subscriptions.push(
		vscode.commands.registerCommand("facetGenerator.reloadConfig", () => {
			configLoader.reloadConfig();
			vscode.window.showInformationMessage("✅ Configuration reloaded!");
		}),
	);
}

async function showGenerationFlow(configLoader: ConfigLoader) {
	const config = configLoader.getConfig();
	const languages = Object.keys(config);

	if (languages.length === 0) {
		vscode.window.showErrorMessage("No languages configured in info.json");
		return;
	}

	// Step 1: Select Language
	const language = await showLanguageSelection(languages, config);
	if (!language) return;

	// Step 2: Select Facet
	const facets = Object.keys(config[language]);
	if (facets.length === 0) {
		vscode.window.showInformationMessage(`No facets available for ${language}`);
		return;
	}

	const facetKey = await showFacetSelection(language, facets, config[language]);
	if (!facetKey) return;

	// Step 3: Select Version
	const facetConfig = config[language][facetKey];
	const versions = Object.keys(facetConfig.version);

	if (versions.length === 0) {
		vscode.window.showErrorMessage(`No versions available for ${language}.${facetKey}`);
		return;
	}

	const version = await showVersionSelection(language, facetKey, versions, facetConfig);
	if (!version) return;

	// Step 4: Generate File
	await vscode.commands.executeCommand("facetGenerator.generateFile", language, facetKey, version);
}

async function showLanguageSelection(languages: string[], config: any): Promise<string | undefined> {
	const items = languages.map((lang) => ({
		label: lang.toUpperCase(),
		description: `${Object.keys(config[lang]).length} facets`,
		detail: Object.keys(config[lang]).join(", "),
		language: lang,
		iconPath: getLanguageIcon(lang),
	}));

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: "Select programming language",
		matchOnDescription: true,
		matchOnDetail: true,
	});

	return selected?.language;
}

async function showFacetSelection(language: string, facets: string[], languageConfig: any): Promise<string | undefined> {
	const items = facets.map((facet) => ({
		label: `${languageConfig[facet].name}${languageConfig[facet].extension}`,
		description: languageConfig[facet].description,
		detail: `Versions: ${Object.keys(languageConfig[facet].version).join(", ")}`,
		facetKey: facet,
		iconPath: getFacetIcon(facet, languageConfig[facet].extension),
	}));

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: `Select ${language} configuration type`,
		matchOnDescription: true,
		matchOnDetail: true,
	});

	return selected?.facetKey;
}

async function showVersionSelection(language: string, facetKey: string, versions: string[], facetConfig: any): Promise<string | undefined> {
	const items = versions.map((version) => ({
		label: `Version ${version}`,
		description: `Template: ${facetConfig.version[version]}`,
		detail: `${facetConfig.name}${facetConfig.extension} - ${facetConfig.description}`,
		version: version,
		iconPath: new vscode.ThemeIcon("versions"),
	}));

	const selected = await vscode.window.showQuickPick(items, {
		placeHolder: "Select version",
		matchOnDescription: true,
	});

	return selected?.version;
}

function getLanguageIcon(language: string): vscode.ThemeIcon {
	const icons: { [key: string]: string } = {
		// زبان‌های برنامه‌نویسی
		java: "coffee",
		javascript: "json",
		typescript: "symbol-namespace",
		python: "file-code",
		csharp: "symbol-class",
		cpp: "symbol-constant",
		go: "symbol-event",
		rust: "gear",
		ruby: "symbol-method",
		php: "symbol-operator",
		swift: "symbol-structure",
		kotlin: "symbol-enum",
		dart: "symbol-keyword",
		scala: "symbol-interface",
		perl: "symbol-text",
		r: "graph-line",
		lua: "symbol-variable",

		// فریم‌ورک‌ها
		react: "library",
		vue: "code",
		angular: "bracket",
		nextjs: "server",
		svelte: "file-code",
		django: "layers",
		flask: "flask",
		laravel: "telescope",
		spring: "leaf",
		rails: "ruby",
		express: "server-process",
		nestjs: "symbol-namespace",

		// ابزارها و پلتفرم‌ها
		docker: "docker",
		git: "git-merge",
		nodejs: "server",
		deno: "circuit-board",
		bun: "package",
		gradle: "tools",
		maven: "package",
		npm: "package",
		yarn: "package",

		// دیتابیس‌ها
		mysql: "database",
		postgresql: "database",
		mongodb: "database",
		sqlite: "database",
		redis: "database",
		mariadb: "database",
		oracle: "database",

		// کانفیگ‌ها
		json: "json",
		yaml: "file",
		yml: "file",
		xml: "file-code",
		toml: "file",
		env: "file-binary",
		ini: "file",
		properties: "file",
		pom: "package",

		// داکیومنت‌ها
		readme: "book",
		changelog: "history",
		license: "law",
		contributing: "git-pull-request",
	};

	return new vscode.ThemeIcon(icons[language.toLowerCase()] || "file-code");
}

function getFacetIcon(facetKey: string, extension: string): vscode.ThemeIcon {
	// آیکون بر اساس نوع فایل
	const extensionIcons: { [key: string]: string } = {
		".xml": "file-code",
		".json": "json",
		".yaml": "file",
		".yml": "file",
		".toml": "file",
		".properties": "file",
		".ini": "file",
		".cfg": "file",
		".conf": "file",
		".env": "file-binary",
		".gradle": "tools",
		".md": "book",
		".txt": "file-text",
		".dockerfile": "docker",
		".gitignore": "git-merge",
	};

	if (extensionIcons[extension]) {
		return new vscode.ThemeIcon(extensionIcons[extension]);
	}

	// icons By Name
	const facetIcons: { [key: string]: string } = {
		maven: "package",
		gradle: "tools",
		docker: "docker",
		gitignore: "git-merge",
		readme: "book",
		license: "law",
		eslint: "checklist",
		prettier: "wand",
		tsconfig: "symbol-namespace",
		package: "package",
		composer: "package",
		gemfile: "ruby",
		requirements: "file-code",
		cargo: "package",
	};

	return new vscode.ThemeIcon(facetIcons[facetKey] || "file-code");
}
