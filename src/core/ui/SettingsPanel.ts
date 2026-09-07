import * as vscode from "vscode";

export class SettingsPanel {
	public static currentPanel: SettingsPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, config: any) {
		this._panel = panel;
		this._panel.webview.html = this.getHtml(config);
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			(message) => {
				if (message.command === "save") {
					vscode.window.showInformationMessage("Config saved!");
				}
			},
			null,
			this._disposables,
		);
	}

	public static show(config: any, workspaceFolder?: vscode.WorkspaceFolder): void {
		const panel = vscode.window.createWebviewPanel("dockeryzenSettings", "Dockeryzen Settings", vscode.ViewColumn.One, {
			enableScripts: true,
		});

		SettingsPanel.currentPanel = new SettingsPanel(panel, config);
	}

	private getHtml(config: any): string {
		return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .form-group { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    input, select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
    button { padding: 10px 20px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer; }
    .section { margin-bottom: 30px; }
    .section h2 { border-bottom: 2px solid #007acc; padding-bottom: 10px; }
  </style>
</head>
<body>
  <h1>Dockeryzen Settings</h1>
  
  <div class="section">
    <h2>Project</h2>
    <div class="form-group">
      <label>Name</label>
      <input type="text" id="projectName" value="${config?.project?.name || ""}">
    </div>
    <div class="form-group">
      <label>JDK Version</label>
      <input type="text" id="jdkVersion" value="${config?.project?.jdkVersion || "17"}">
    </div>
    <div class="form-group">
      <label>JDK Vendor</label>
      <select id="jdkVendor">
        <option value="eclipse-temurin">Eclipse Temurin</option>
        <option value="amazon-corretto">Amazon Corretto</option>
        <option value="openjdk">OpenJDK</option>
        <option value="oracle-jdk">Oracle JDK</option>
        <option value="graalvm">GraalVM</option>
        <option value="liberica">Liberica</option>
        <option value="redhat-openjdk">Red Hat OpenJDK</option>
      </select>
    </div>
    <div class="form-group">
      <label>Port</label>
      <input type="number" id="port" value="${config?.project?.port || 8080}">
    </div>
  </div>

  <div class="section">
    <h2>Docker</h2>
    <div class="form-group">
      <label><input type="checkbox" id="useAlpine"> Use Alpine</label>
    </div>
    <div class="form-group">
      <label>JVM Options</label>
      <input type="text" id="jvmOptions" value="${config?.docker?.jvmOptions || "-Xmx512m -Xms256m"}">
    </div>
    <div class="form-group">
      <label><input type="checkbox" id="enableDebug"> Enable Debug</label>
    </div>
    <div class="form-group">
      <label><input type="checkbox" id="enableHealthCheck" checked> Enable Health Check</label>
    </div>
  </div>

  <button onclick="saveConfig()">Save Configuration</button>

  <script>
    const vscode = acquireVsCodeApi();
    
    function saveConfig() {
      const config = {
        project: {
          name: document.getElementById('projectName').value,
          jdkVersion: document.getElementById('jdkVersion').value,
          jdkVendor: document.getElementById('jdkVendor').value,
          port: parseInt(document.getElementById('port').value)
        },
        docker: {
          useAlpine: document.getElementById('useAlpine').checked,
          jvmOptions: document.getElementById('jvmOptions').value,
          enableDebug: document.getElementById('enableDebug').checked,
          enableHealthCheck: document.getElementById('enableHealthCheck').checked
        }
      };
      
      vscode.postMessage({
        command: 'save',
        config: config
      });
    }
  </script>
</body>
</html>`;
	}

	public dispose(): void {
		SettingsPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
}
