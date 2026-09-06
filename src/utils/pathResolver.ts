import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class PathResolver {
	/**
	 * Resolve the actual file path based on route template
	 * @param workspaceRoot - Root path of workspace
	 * @param routePattern - Route pattern from config (e.g., "./src/main/resources/META-INF/~")
	 * @param fileName - File name with extension (e.g., "persistence.xml")
	 * @returns Resolved full path
	 */
	static resolvePath(workspaceRoot: string, routePattern: string, fileName: string): string {
		// Replace ~ with the actual file name
		let resolvedPath = routePattern.replace("~", fileName);

		// Handle relative paths
		if (resolvedPath.startsWith("./")) {
			resolvedPath = path.join(workspaceRoot, resolvedPath.substring(2));
		} else if (resolvedPath.startsWith("/")) {
			resolvedPath = path.join(workspaceRoot, resolvedPath.substring(1));
		} else {
			resolvedPath = path.join(workspaceRoot, resolvedPath);
		}

		return path.normalize(resolvedPath);
	}

	/**
	 * Ensure directory exists, create if not
	 * @param filePath - Full file path
	 */
	static ensureDirectory(filePath: string): void {
		const directory = path.dirname(filePath);

		if (!fs.existsSync(directory)) {
			fs.mkdirSync(directory, { recursive: true });
			console.log(`Created directory: ${directory}`);
		}
	}

	/**
	 * Check if file exists and generate versioned name if needed
	 * @param filePath - Original file path
	 * @returns Final file path (may be versioned)
	 */
	static getVersionedPath(filePath: string): string {
		if (!fs.existsSync(filePath)) {
			return filePath;
		}

		const directory = path.dirname(filePath);
		const ext = path.extname(filePath);
		const baseName = path.basename(filePath, ext);

		let version = 2;
		let newPath = path.join(directory, `${baseName}_v${version}${ext}`);

		while (fs.existsSync(newPath)) {
			version++;
			newPath = path.join(directory, `${baseName}_v${version}${ext}`);
		}

		return newPath;
	}

	/**
	 * Show file save dialog with predefined path and custom option
	 * @param defaultPath - Default path from config
	 * @returns Selected file path or undefined
	 */
	static async showFileDialog(defaultPath: string, fileName: string): Promise<string | undefined> {
		const options: vscode.QuickPickItem[] = [
			{
				label: `📁 Default Path`,
				description: defaultPath,
				detail: "Use the pre-configured path",
			},
			{
				label: `📂 Custom Path`,
				description: "Choose your own location",
				detail: "Open file explorer to select path",
			},
		];

		const choice = await vscode.window.showQuickPick(options, {
			placeHolder: "Choose where to save the file",
		});

		if (!choice) {
			return undefined;
		}

		if (choice.label.includes("Custom")) {
			const uri = await vscode.window.showSaveDialog({
				defaultUri: vscode.Uri.file(path.join(defaultPath, fileName)),
				filters: {
					"All Files": ["*"],
				},
			});

			return uri?.fsPath;
		}

		// For default path, ensure directory and get versioned path
		const fullPath = path.join(defaultPath, fileName);
		PathResolver.ensureDirectory(fullPath);
		return PathResolver.getVersionedPath(fullPath);
	}
}
