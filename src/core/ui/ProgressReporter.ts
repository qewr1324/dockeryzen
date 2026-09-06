import * as vscode from "vscode";

/**
 * Progress reporter using Observer pattern
 */
export class ProgressReporter {
	/**
	 * Run with progress
	 */
	public async run(title: string, task: (reporter: vscode.Progress<{ message?: string; increment?: number }>) => Promise<void>): Promise<void> {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title,
				cancellable: false,
			},
			async (progress) => {
				await task(progress);
			},
		);
	}
}
