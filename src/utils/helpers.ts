import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";

/**
 * Get the first workspace folder
 */
export function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
	return vscode.workspace.workspaceFolders?.[0];
}

/**
 * Get the path of the first workspace folder
 */
export function getWorkspacePath(): string | undefined {
	return getWorkspaceFolder()?.uri.fsPath;
}

/**
 * Sanitize a name for use in Docker
 */
export function sanitizeName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9-_]/g, "-")
		.replace(/^-+|-+$/g, "")
		.substring(0, 63); // Docker container name limit
}

/**
 * Validate a port number
 */
export function validatePort(port: string | number): string | null {
	const portNum = typeof port === "string" ? parseInt(port) : port;
	if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
		return "Please enter a valid port number (1-65535)";
	}
	const reservedPorts = [0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 139, 143, 179, 389, 465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 556, 563, 587, 601, 636, 993, 995, 2049, 4045, 6000];
	if (reservedPorts.includes(portNum)) {
		return `Port ${portNum} is a reserved system port. Please use a different port.`;
	}
	return null;
}

/**
 * Validate a project name
 */
export function validateProjectName(name: string): string | null {
	if (!name || name.length === 0) {
		return "Project name cannot be empty";
	}
	if (!/^[a-zA-Z0-9-_]+$/.test(name)) {
		return "Project name can only contain letters, numbers, hyphens, and underscores";
	}
	if (name.length > 50) {
		return "Project name must be less than 50 characters";
	}
	return null;
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Safely write a file with backup and user confirmation
 */
export async function safeWriteFile(filePath: string, content: string): Promise<void> {
	try {
		if (await fileExists(filePath)) {
			const backupPath = `${filePath}.backup`;
			await fs.copy(filePath, backupPath);

			const action = await vscode.window.showWarningMessage(`File ${path.basename(filePath)} already exists. What would you like to do?`, "Overwrite", "Keep Existing", "Cancel");

			if (action === "Cancel") {
				await fs.remove(backupPath);
				throw new Error("Operation cancelled by user");
			} else if (action === "Keep Existing") {
				await fs.remove(backupPath);
				return;
			}
		}

		await fs.writeFile(filePath, content);

		const backupPath = `${filePath}.backup`;
		if (await fileExists(backupPath)) {
			await fs.remove(backupPath);
		}
	} catch (error) {
		const backupPath = `${filePath}.backup`;
		if (await fileExists(backupPath)) {
			await fs.copy(backupPath, filePath);
			await fs.remove(backupPath);
		}
		throw error;
	}
}

/**
 * Find a free port
 */
export function findFreePort(startPort: number, usedPorts: Set<number>): number {
	let port = startPort;
	while (usedPorts.has(port)) {
		port++;
	}
	return port;
}

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
	const net = await import("net");
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", () => {
			resolve(false);
		});
		server.once("listening", () => {
			server.close();
			resolve(true);
		});
		server.listen(port);
	});
}
