import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import * as yaml from "js-yaml";
import * as toml from "@iarna/toml";

export class ConfigLoader {
	public async load(workspaceFolder: vscode.WorkspaceFolder): Promise<any> {
		const configFiles = ["dockeryzen.config.json", "dockeryzen.config.yaml", "dockeryzen.config.yml", "dockeryzen.config.toml", ".dockeryzen.json", ".dockeryzen.yaml", ".dockeryzen.yml", ".dockeryzen.toml"];

		for (const file of configFiles) {
			const filePath = path.join(workspaceFolder.uri.fsPath, file);
			if (await fs.pathExists(filePath)) {
				return this.parseFile(filePath);
			}
		}

		return undefined;
	}

	private async parseFile(filePath: string): Promise<any> {
		const content = await fs.readFile(filePath, "utf8");
		const ext = path.extname(filePath).toLowerCase();

		switch (ext) {
			case ".json":
				return JSON.parse(content);
			case ".yaml":
			case ".yml":
				return yaml.load(content);
			case ".toml":
				return toml.parse(content);
			default:
				throw new Error(`Unsupported config format: ${ext}`);
		}
	}

	public async save(workspaceFolder: vscode.WorkspaceFolder, config: any, format: "json" | "yaml" | "toml"): Promise<string> {
		const fileName = `dockeryzen.config.${format}`;
		const filePath = path.join(workspaceFolder.uri.fsPath, fileName);

		let content = "";
		switch (format) {
			case "json":
				content = JSON.stringify(config, null, 2);
				break;
			case "yaml":
				content = yaml.dump(config);
				break;
			case "toml":
				content = toml.stringify(config);
				break;
		}

		await fs.writeFile(filePath, content, "utf8");
		return filePath;
	}
}
