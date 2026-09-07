import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { ConfigLoader } from "../config/ConfigLoader.js";

export class SettingsPanel {
	public static currentPanel: SettingsPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private _config: any;
	private _configFormat: "json" | "yaml" | "toml" = "json";

	private constructor(panel: vscode.WebviewPanel, config: any) {
		this._panel = panel;
		this._config = config;
		this._panel.webview.html = this.getHtml(config);
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case "save":
						this._config = message.config;
						await this.saveConfigToFile();
						vscode.window.showInformationMessage("Configuration saved!");
						break;
					case "generate":
						this._config = message.config;
						await this.saveConfigToFile();
						vscode.commands.executeCommand("dockeryzen.generateFromConfig");
						break;
					case "addDatabase":
						this.addDatabase(message.dbConfig);
						break;
					case "removeDatabase":
						this.removeDatabase(message.index);
						await this.saveConfigToFile();
						break;
					case "addService":
						this.addService(message.serviceConfig);
						await this.saveConfigToFile();
						break;
					case "removeService":
						this.removeService(message.index);
						await this.saveConfigToFile();
						break;
					case "addMessageQueue":
						this.addMessageQueue(message.mqConfig);
						await this.saveConfigToFile();
						break;
					case "removeMessageQueue":
						this.removeMessageQueue(message.index);
						await this.saveConfigToFile();
						break;
					case "addProfile":
						this.addProfile(message.profileName);
						await this.saveConfigToFile();
						break;
					case "removeProfile":
						this.removeProfile(message.index);
						await this.saveConfigToFile();
						break;
				}
			},
			null,
			this._disposables,
		);
	}

	private async saveConfigToFile(): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) return;

		const configLoader = new ConfigLoader();
		await configLoader.save(workspaceFolder, this._config, this._configFormat);
	}

	private addDatabase(dbConfig: any): void {
		const db = {
			type: dbConfig.type,
			version: dbConfig.version || this.getDefaultVersion(dbConfig.type),
			port: dbConfig.port || this.getDefaultPort(dbConfig.type),
			name: dbConfig.name || "appdb",
			username: dbConfig.username || "admin",
			password: dbConfig.password || "password",
			host: dbConfig.type,
		};

		if (!this._config.databases) {
			this._config.databases = [];
		}

		this._config.databases.push(db);

		this.saveConfigToFile();

		this._panel.webview.html = this.getHtml(this._config);
	}

	private removeDatabase(index: number): void {
		if (this._config.databases && this._config.databases[index]) {
			this._config.databases.splice(index, 1);
			this._panel.webview.html = this.getHtml(this._config);
		}
	}

	private addService(serviceConfig: any): void {
		const service = {
			type: serviceConfig.type,
			version: serviceConfig.version || this.getDefaultVersion(serviceConfig.type),
			port: serviceConfig.port || this.getDefaultServicePort(serviceConfig.type),
		};

		if (!this._config.services) {
			this._config.services = [];
		}
		this._config.services.push(service);
		this._panel.webview.html = this.getHtml(this._config);
	}

	private removeService(index: number): void {
		if (this._config.services && this._config.services[index]) {
			this._config.services.splice(index, 1);
			this._panel.webview.html = this.getHtml(this._config);
		}
	}

	private addMessageQueue(mqConfig: any): void {
		const mq = {
			type: mqConfig.type,
			version: mqConfig.version || this.getDefaultVersion(mqConfig.type),
			port: mqConfig.port || this.getDefaultServicePort(mqConfig.type),
		};

		if (!this._config.messageQueues) {
			this._config.messageQueues = [];
		}
		this._config.messageQueues.push(mq);
		this._panel.webview.html = this.getHtml(this._config);
	}

	private removeMessageQueue(index: number): void {
		if (this._config.messageQueues && this._config.messageQueues[index]) {
			this._config.messageQueues.splice(index, 1);
			this._panel.webview.html = this.getHtml(this._config);
		}
	}

	private addProfile(profileName: string): void {
		if (!this._config.profiles) {
			this._config.profiles = [];
		}
		this._config.profiles.push(profileName);
		this._panel.webview.html = this.getHtml(this._config);
	}

	private removeProfile(index: number): void {
		if (this._config.profiles && this._config.profiles[index]) {
			this._config.profiles.splice(index, 1);
			this._panel.webview.html = this.getHtml(this._config);
		}
	}

	private getDefaultPort(dbType: string): number {
		const ports: Record<string, number> = {
			postgresql: 5432,
			mysql: 3306,
			mariadb: 3306,
			mongodb: 27017,
			redis: 6379,
			cassandra: 9042,
			elasticsearch: 9200,
			neo4j: 7687,
			h2: 9092,
		};
		return ports[dbType] || 5432;
	}

	private getDefaultServicePort(serviceType: string): number {
		const ports: Record<string, number> = {
			kafka: 9092,
			rabbitmq: 5672,
			activemq: 61616,
			nginx: 80,
			grafana: 3000,
			prometheus: 9090,
			keycloak: 8080,
			minio: 9000,
		};
		return ports[serviceType] || 8080;
	}

	private getDefaultVersion(type: string): string {
		const versions: Record<string, string> = {
			postgresql: "16",
			mysql: "8.4",
			mariadb: "11",
			mongodb: "7",
			redis: "7",
			cassandra: "5",
			elasticsearch: "8",
			neo4j: "5",
			h2: "latest",
			kafka: "latest",
			rabbitmq: "3",
			activemq: "latest",
			nginx: "latest",
			grafana: "latest",
			prometheus: "latest",
			keycloak: "latest",
			minio: "latest",
		};
		return versions[type] || "latest";
	}

	public static show(config: any): void {
		const panel = vscode.window.createWebviewPanel("dockeryzenSettings", "Dockeryzen Settings", vscode.ViewColumn.One, {
			enableScripts: true,
			retainContextWhenHidden: true,
		});

		SettingsPanel.currentPanel = new SettingsPanel(panel, config);
	}

	private getHtml(config: any): string {
		const dbTypes = ["postgresql", "mysql", "mariadb", "mongodb", "redis", "cassandra", "elasticsearch", "neo4j"];
		const serviceTypes = ["kafka", "rabbitmq", "activemq", "nginx", "grafana", "prometheus", "keycloak", "minio"];
		const jdkVendors = ["eclipse-temurin", "amazon-corretto", "openjdk", "oracle-jdk", "graalvm", "liberica", "redhat-openjdk"];
		const frameworks = ["spring-boot", "jakarta-ee", "quarkus", "micronaut", "vertx", "none"];
		const outputTypes = ["jar", "war", "native"];
		const buildTools = ["maven", "gradle"];

		const databases = config?.databases || [];
		const services = config?.services || [];
		const messageQueues = config?.messageQueues || [];
		const profiles = config?.profiles || [];

		return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dockeryzen Settings</title>
  <style>
    :root {
      --bg: #1e1e2e;
      --surface: #2a2a3e;
      --surface-hover: #3a3a50;
      --text: #cdd6f4;
      --text-muted: #a6adc8;
      --accent: #89b4fa;
      --accent-hover: #b4befe;
      --border: #45475a;
      --danger: #f38ba8;
      --success: #a6e3a1;
      --warning: #f9e2af;
      --radius: 8px;
      --transition: 0.2s ease;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      padding: 20px;
      min-height: 100vh;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 16px;
      border-bottom: 2px solid var(--border);
    }

    .header h1 {
      font-size: 24px;
      font-weight: 600;
      background: linear-gradient(135deg, var(--accent), var(--success));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-actions {
      display: flex;
      gap: 10px;
    }

    .section {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      transition: var(--transition);
    }

    .section:hover {
      border-color: var(--accent);
    }

    .section-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title::before {
      content: '';
      width: 4px;
      height: 20px;
      background: var(--accent);
      border-radius: 2px;
    }

    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .form-group input,
    .form-group select {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 8px 12px;
      color: var(--text);
      font-size: 14px;
      transition: var(--transition);
      outline: none;
    }

    .form-group input:focus,
    .form-group select:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(137, 180, 250, 0.2);
    }

    .checkbox-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .checkbox-group input[type="checkbox"] {
      width: 18px;
      height: 18px;
      accent-color: var(--accent);
    }

    .checkbox-group label {
      font-size: 14px;
      color: var(--text);
      text-transform: none;
      letter-spacing: 0;
      cursor: pointer;
    }

    .list-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .list-item {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: var(--transition);
    }

    .list-item:hover {
      border-color: var(--accent);
      background: var(--surface-hover);
    }

    .list-item-info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 1;
    }

    .list-item-badge {
      background: var(--accent);
      color: var(--bg);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .list-item-details {
      flex: 1;
    }

    .list-item-details .db-name {
      font-weight: 600;
      font-size: 14px;
    }

    .list-item-details .db-connection {
      font-size: 12px;
      color: var(--text-muted);
    }

    .list-item-actions {
      display: flex;
      gap: 6px;
    }

    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: var(--transition);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn-primary {
      background: var(--accent);
      color: var(--bg);
    }

    .btn-primary:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }

    .btn-success {
      background: var(--success);
      color: var(--bg);
    }

    .btn-success:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .btn-danger {
      background: transparent;
      color: var(--danger);
      border: 1px solid var(--danger);
    }

    .btn-danger:hover {
      background: var(--danger);
      color: var(--bg);
    }

    .btn-sm {
      padding: 6px 12px;
      font-size: 12px;
    }

    .add-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .add-btn {
      background: var(--surface-hover);
      color: var(--text);
      border: 1px dashed var(--border);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      cursor: pointer;
      transition: var(--transition);
    }

    .add-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: var(--surface);
    }

    .footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding-top: 16px;
      border-top: 2px solid var(--border);
    }

    .empty-state {
      text-align: center;
      padding: 30px;
      color: var(--text-muted);
      font-size: 14px;
    }

    .modal-overlay {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }

    .modal-overlay.active {
      display: flex;
    }

    .modal {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      width: 400px;
      max-width: 90%;
    }

    .modal h2 {
      margin-bottom: 16px;
      font-size: 18px;
    }

    .modal .form-group {
      margin-bottom: 12px;
    }

    .modal .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🧢 Dockeryzen Settings</h1>
      <div class="header-actions">
        <button class="btn btn-primary" onclick="saveAndGenerate()">🚀 Generate</button>
        <button class="btn btn-success" onclick="saveConfig()">💾 Save</button>
      </div>
    </div>

    <!-- Project Section -->
    <div class="section">
      <div class="section-title">Project</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Project Name</label>
          <input type="text" id="projectName" value="${config?.project?.name || ""}">
        </div>
        <div class="form-group">
          <label>Build Tool</label>
          <select id="buildTool">
            ${buildTools.map((t) => `<option value="${t}" ${config?.project?.type === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Framework</label>
          <select id="framework" onchange="updateOutputType()">
            ${frameworks.map((f) => `<option value="${f}" ${config?.project?.framework === f ? "selected" : ""}>${f}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>JDK Version</label>
          <input type="text" id="jdkVersion" value="${config?.project?.jdkVersion || "17"}">
        </div>
        <div class="form-group">
          <label>JDK Vendor</label>
          <select id="jdkVendor">
            ${jdkVendors.map((v) => `<option value="${v}" ${config?.project?.jdkVendor === v ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Port</label>
          <input type="number" id="port" value="${config?.project?.port || 8080}">
        </div>
        <div class="form-group">
          <label>Output Type</label>
          <select id="outputType">
            ${outputTypes.map((o) => `<option value="${o}" ${config?.project?.outputType === o ? "selected" : ""}>${o.toUpperCase()}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>

    <!-- Docker Section -->
    <div class="section">
      <div class="section-title">Docker</div>
      <div class="form-grid">
        <div class="form-group">
          <label>JVM Options</label>
          <input type="text" id="jvmOptions" value="${config?.docker?.jvmOptions || "-Xmx512m -Xms256m"}">
        </div>
        <div class="form-group">
          <label>Health Check Endpoint</label>
          <input type="text" id="healthEndpoint" value="${config?.docker?.healthCheckEndpoint || "/actuator/health"}">
        </div>
        <div class="form-group">
          <label>Debug Port</label>
          <input type="number" id="debugPort" value="${config?.docker?.debugPort || 5005}">
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="useAlpine" ${config?.docker?.useAlpine ? "checked" : ""}>
          <label for="useAlpine">Use Alpine</label>
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="enableDebug" ${config?.docker?.enableDebug ? "checked" : ""}>
          <label for="enableDebug">Enable Debug</label>
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="enableHealthCheck" ${config?.docker?.enableHealthCheck !== false ? "checked" : ""}>
          <label for="enableHealthCheck">Enable Health Check</label>
        </div>
      </div>
    </div>

    <!-- Databases Section -->
    <div class="section">
      <div class="section-title">Databases</div>
      <div class="list-container" id="databases-list">
        ${
			databases.length > 0
				? databases
						.map(
							(db: any, index: number) => `
          <div class="list-item">
            <div class="list-item-info">
              <span class="list-item-badge">${db.type}</span>
              <div class="list-item-details">
                <div class="db-name">${db.name} v${db.version}</div>
                <div class="db-connection">${db.username}:${db.password}@${db.host || db.type}:${db.port}</div>
              </div>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-danger btn-sm" onclick="removeDatabase(${index})">✕</button>
            </div>
          </div>
        `,
						)
						.join("")
				: '<div class="empty-state">No databases configured</div>'
		}
      </div>
      <div class="add-buttons">
        ${dbTypes.map((db) => `<button class="add-btn" onclick="showDatabaseModal('${db}')">+ ${db}</button>`).join("")}
      </div>
    </div>

    <!-- Message Queues Section -->
    <div class="section">
      <div class="section-title">Message Queues</div>
      <div class="list-container" id="messagequeues-list">
        ${
			messageQueues.length > 0
				? messageQueues
						.map(
							(mq: any, index: number) => `
          <div class="list-item">
            <div class="list-item-info">
              <span class="list-item-badge">${mq.type}</span>
              <div class="list-item-details">
                <div class="db-name">${mq.type} v${mq.version}</div>
                <div class="db-connection">Port: ${mq.port}</div>
              </div>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-danger btn-sm" onclick="removeMessageQueue(${index})">✕</button>
            </div>
          </div>
        `,
						)
						.join("")
				: '<div class="empty-state">No message queues configured</div>'
		}
      </div>
      <div class="add-buttons">
        <button class="add-btn" onclick="addMessageQueue('kafka')">+ kafka</button>
        <button class="add-btn" onclick="addMessageQueue('rabbitmq')">+ rabbitmq</button>
        <button class="add-btn" onclick="addMessageQueue('activemq')">+ activemq</button>
      </div>
    </div>

    <!-- Services Section -->
    <div class="section">
      <div class="section-title">Additional Services</div>
      <div class="list-container" id="services-list">
        ${
			services.length > 0
				? services
						.map(
							(svc: any, index: number) => `
          <div class="list-item">
            <div class="list-item-info">
              <span class="list-item-badge">${svc.type}</span>
              <div class="list-item-details">
                <div class="db-name">${svc.type} v${svc.version}</div>
                <div class="db-connection">Port: ${svc.port}</div>
              </div>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-danger btn-sm" onclick="removeService(${index})">✕</button>
            </div>
          </div>
        `,
						)
						.join("")
				: '<div class="empty-state">No additional services</div>'
		}
      </div>
      <div class="add-buttons">
        ${serviceTypes.map((svc) => `<button class="add-btn" onclick="addService('${svc}')">+ ${svc}</button>`).join("")}
      </div>
    </div>

    <!-- Profiles Section -->
    <div class="section">
      <div class="section-title">Spring Profiles</div>
      <div class="list-container">
        ${
			profiles.length > 0
				? profiles
						.map(
							(profile: string, index: number) => `
          <div class="list-item">
            <div class="list-item-info">
              <span class="list-item-badge">${profile}</span>
            </div>
            <div class="list-item-actions">
              <button class="btn btn-danger btn-sm" onclick="removeProfile(${index})">✕</button>
            </div>
          </div>
        `,
						)
						.join("")
				: '<div class="empty-state">No profiles configured</div>'
		}
      </div>
      <div class="add-buttons">
        <button class="add-btn" onclick="showProfileModal()">+ Add Profile</button>
      </div>
    </div>

    <!-- Advanced Section -->
    <div class="section">
      <div class="section-title">Advanced</div>
      <div class="form-grid">
        <div class="form-group checkbox-group">
          <input type="checkbox" id="envFile" ${config?.envFile !== false ? "checked" : ""}>
          <label for="envFile">Generate .env file</label>
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="githubCi" ${config?.ciCd?.github ? "checked" : ""}>
          <label for="githubCi">GitHub Actions</label>
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="gitlabCi" ${config?.ciCd?.gitlab ? "checked" : ""}>
          <label for="gitlabCi">GitLab CI</label>
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="k8sEnabled" ${config?.kubernetes?.enabled ? "checked" : ""}>
          <label for="k8sEnabled">Kubernetes</label>
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="devContainerEnabled" ${config?.devContainer?.enabled ? "checked" : ""}>
          <label for="devContainerEnabled">Dev Container</label>
        </div>
      </div>
    </div>

    <div class="footer">
      <button class="btn btn-primary" onclick="saveAndGenerate()">🚀 Generate Docker Files</button>
    </div>
  </div>

  <!-- Database Modal -->
  <div class="modal-overlay" id="databaseModal">
    <div class="modal">
      <h2>Add Database</h2>
      <div class="form-group">
        <label>Database Type</label>
        <input type="text" id="dbType" readonly>
      </div>
      <div class="form-group">
        <label>Database Name</label>
        <input type="text" id="dbName" value="appdb">
      </div>
      <div class="form-group">
        <label>Username</label>
        <input type="text" id="dbUsername" value="admin">
      </div>
      <div class="form-group">
        <label>Password</label>
        <input type="password" id="dbPassword" value="password">
      </div>
      <div class="form-group">
        <label>Port</label>
        <input type="number" id="dbPort">
      </div>
      <div class="form-group">
        <label>Version</label>
        <input type="text" id="dbVersion" value="latest">
      </div>
      <div class="modal-actions">
        <button class="btn btn-danger" onclick="closeDatabaseModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmAddDatabase()">Add Database</button>
      </div>
    </div>
  </div>

  <!-- Profile Modal -->
  <div class="modal-overlay" id="profileModal">
    <div class="modal">
      <h2>Add Profile</h2>
      <div class="form-group">
        <label>Profile Name</label>
        <input type="text" id="profileName" placeholder="e.g., dev, prod">
      </div>
      <div class="modal-actions">
        <button class="btn btn-danger" onclick="closeProfileModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmAddProfile()">Add Profile</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentDbType = '';

    function updateOutputType() {
      const framework = document.getElementById('framework').value;
      const outputTypeSelect = document.getElementById('outputType');
      
      // Auto-set output type based on framework
      if (framework === 'jakarta-ee' || framework === 'java-ee' || framework === 'spring-mvc') {
        outputTypeSelect.value = 'war';
      }
    }

    function collectConfig() {
      return {
        version: "1.0.0",
        project: {
          name: document.getElementById('projectName').value,
          type: document.getElementById('buildTool').value,
          framework: document.getElementById('framework').value,
          jdkVersion: document.getElementById('jdkVersion').value,
          jdkVendor: document.getElementById('jdkVendor').value,
          port: parseInt(document.getElementById('port').value),
          outputType: document.getElementById('outputType').value
        },
        docker: {
          baseImage: document.getElementById('jdkVendor').value,
          useAlpine: document.getElementById('useAlpine').checked,
          jvmOptions: document.getElementById('jvmOptions').value,
          enableDebug: document.getElementById('enableDebug').checked,
          debugPort: parseInt(document.getElementById('debugPort').value),
          enableHealthCheck: document.getElementById('enableHealthCheck').checked,
          healthCheckEndpoint: document.getElementById('healthEndpoint').value
        },
        databases: ${JSON.stringify(databases)},
        messageQueues: ${JSON.stringify(messageQueues)},
        services: ${JSON.stringify(services)},
        envFile: document.getElementById('envFile').checked,
        profiles: ${JSON.stringify(profiles)},
        ciCd: {
          github: document.getElementById('githubCi').checked,
          gitlab: document.getElementById('gitlabCi').checked
        },
        kubernetes: {
          enabled: document.getElementById('k8sEnabled').checked,
          replicas: 3
        },
        devContainer: {
          enabled: document.getElementById('devContainerEnabled').checked
        }
      };
    }

    function saveConfig() {
      const config = collectConfig();
      vscode.postMessage({ command: 'save', config: config });
    }

    function saveAndGenerate() {
      const config = collectConfig();
      vscode.postMessage({ command: 'generate', config: config });
    }

    function showDatabaseModal(type) {
      currentDbType = type;
      document.getElementById('dbType').value = type;
      document.getElementById('dbPort').value = getDefaultPort(type);
      document.getElementById('dbVersion').value = getDefaultVersion(type);
      document.getElementById('databaseModal').classList.add('active');
    }

    function closeDatabaseModal() {
      document.getElementById('databaseModal').classList.remove('active');
    }

    function confirmAddDatabase() {
      const dbConfig = {
        type: currentDbType,
        name: document.getElementById('dbName').value,
        username: document.getElementById('dbUsername').value,
        password: document.getElementById('dbPassword').value,
        port: parseInt(document.getElementById('dbPort').value),
        version: document.getElementById('dbVersion').value
      };
      
      vscode.postMessage({ 
        command: 'addDatabase', 
        dbConfig: dbConfig
      });
      
      closeDatabaseModal();
    }

    function removeDatabase(index) {
      vscode.postMessage({ command: 'removeDatabase', index: index });
    }

    function addService(type) {
      vscode.postMessage({ 
        command: 'addService', 
        serviceConfig: { type: type }
      });
    }

    function removeService(index) {
      vscode.postMessage({ command: 'removeService', index: index });
    }

    function addMessageQueue(type) {
      vscode.postMessage({ 
        command: 'addMessageQueue', 
        mqConfig: { type: type }
      });
    }

    function removeMessageQueue(index) {
      vscode.postMessage({ command: 'removeMessageQueue', index: index });
    }

    function showProfileModal() {
      document.getElementById('profileModal').classList.add('active');
    }

    function closeProfileModal() {
      document.getElementById('profileModal').classList.remove('active');
    }

    function confirmAddProfile() {
      const name = document.getElementById('profileName').value;
      if (name) {
        vscode.postMessage({ command: 'addProfile', profileName: name });
        closeProfileModal();
      }
    }

    function removeProfile(index) {
      vscode.postMessage({ command: 'removeProfile', index: index });
    }

    function getDefaultPort(type) {
      const ports = {
        postgresql: 5432,
        mysql: 3306,
        mariadb: 3306,
        mongodb: 27017,
        redis: 6379,
        cassandra: 9042,
        elasticsearch: 9200,
        neo4j: 7687,
        h2: 9092
      };
      return ports[type] || 5432;
    }

    function getDefaultVersion(type) {
      const versions = {
        postgresql: "16",
        mysql: "8.4",
        mariadb: "11",
        mongodb: "7",
        redis: "7",
        cassandra: "5",
        elasticsearch: "8",
        neo4j: "5",
        h2: "latest"
      };
      return versions[type] || "latest";
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
