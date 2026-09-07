import * as vscode from "vscode";
import { ConfigLoader } from "../config/ConfigLoader.js";

export class SettingsPanel {
	public static currentPanel: SettingsPanel | undefined;
	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];
	private _config: any;
	private _configFormat: "json" = "json";
	private _isDirty: boolean = false;

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
						this._isDirty = false;
						vscode.window.showInformationMessage("✅ Configuration saved!");
						break;
					case "generate":
						this._config = message.config;
						await this.saveConfigToFile();
						this._isDirty = false;
						vscode.commands.executeCommand("dockeryzen.generateFromConfig");
						break;
					case "markDirty":
						this._isDirty = true;
						break;
					case "addDatabase":
						this.addDatabase(message.dbConfig);
						break;
					case "removeDatabase":
						this.removeDatabase(message.index);
						break;
					case "addService":
						this.addService(message.serviceConfig);
						break;
					case "removeService":
						this.removeService(message.index);
						break;
					case "addMessageQueue":
						this.addMessageQueue(message.mqConfig);
						break;
					case "removeMessageQueue":
						this.removeMessageQueue(message.index);
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
		if (!this._config.databases) {
			this._config.databases = [];
		}
		this._config.databases.push(dbConfig);
		this._isDirty = true;

		this._panel.webview.postMessage({
			command: "databaseAdded",
			dbConfig: dbConfig,
			index: this._config.databases.length - 1,
		});
	}

	private removeDatabase(index: number): void {
		if (this._config.databases && this._config.databases[index]) {
			this._config.databases.splice(index, 1);
			this._isDirty = true;

			this._panel.webview.postMessage({
				command: "databaseRemoved",
				index: index,
			});
		}
	}

	private addService(serviceConfig: any): void {
		if (!this._config.services) {
			this._config.services = [];
		}
		this._config.services.push(serviceConfig);
		this._isDirty = true;

		this._panel.webview.postMessage({
			command: "serviceAdded",
			serviceConfig: serviceConfig,
			index: this._config.services.length - 1,
		});
	}

	private removeService(index: number): void {
		if (this._config.services && this._config.services[index]) {
			this._config.services.splice(index, 1);
			this._isDirty = true;

			this._panel.webview.postMessage({
				command: "serviceRemoved",
				index: index,
			});
		}
	}

	private addMessageQueue(mqConfig: any): void {
		if (!this._config.messageQueues) {
			this._config.messageQueues = [];
		}
		this._config.messageQueues.push(mqConfig);
		this._isDirty = true;

		this._panel.webview.postMessage({
			command: "messageQueueAdded",
			mqConfig: mqConfig,
			index: this._config.messageQueues.length - 1,
		});
	}

	private removeMessageQueue(index: number): void {
		if (this._config.messageQueues && this._config.messageQueues[index]) {
			this._config.messageQueues.splice(index, 1);
			this._isDirty = true;

			this._panel.webview.postMessage({
				command: "messageQueueRemoved",
				index: index,
			});
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
			kafka: "7.7.0",
			rabbitmq: "3.13",
			activemq: "6.1.2",
			nginx: "1.27",
			grafana: "11.2.0",
			prometheus: "v2.54.1",
			keycloak: "25.0.4",
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
		const serviceTypes = ["nginx", "grafana", "prometheus", "keycloak", "minio"];
		const mqTypes = ["kafka", "rabbitmq", "activemq"];
		const jdkVendors = ["eclipse-temurin", "amazon-corretto", "openjdk", "oracle-jdk", "graalvm", "liberica", "redhat-openjdk"];
		const frameworks = ["spring-boot", "jakarta-ee", "quarkus", "micronaut", "vertx", "none"];
		const outputTypes = ["jar", "war", "native"];
		const buildTools = ["maven", "gradle"];

		const databases = config?.databases || [];
		const services = config?.services || [];
		const messageQueues = config?.messageQueues || [];

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
      padding-top: 80px;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }

    .floating-header {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: var(--surface);
      border-bottom: 2px solid var(--border);
      padding: 12px 20px;
      z-index: 100;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    }

    .floating-header h1 {
      font-size: 20px;
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
      width: 100%;
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

    .config-item {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 12px;
    }

    .config-item-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .config-item-title {
      font-weight: 600;
      font-size: 14px;
    }

    .config-item-actions {
      display: flex;
      gap: 6px;
    }

    .config-item-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
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

    .empty-state {
      text-align: center;
      padding: 30px;
      color: var(--text-muted);
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="floating-header">
    <h1>🧢 Dockeryzen Settings</h1>
    <div class="header-actions">
      <button class="btn btn-primary" onclick="saveAndGenerate()">🚀 Generate</button>
      <button class="btn btn-success" onclick="saveConfig()">💾 Save</button>
    </div>
  </div>

  <div class="container">
    <div class="section">
      <div class="section-title">Project</div>
      <div class="form-grid">
        <div class="form-group">
          <label>Project Name</label>
          <input type="text" id="projectName" value="${config?.project?.name || ""}" onchange="markDirty()">
        </div>
        <div class="form-group">
          <label>Build Tool</label>
          <select id="buildTool" onchange="markDirty()">
            ${buildTools.map((t) => `<option value="${t}" ${config?.project?.type === t ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Framework</label>
          <select id="framework" onchange="updateOutputType(); markDirty()">
            ${frameworks.map((f) => `<option value="${f}" ${config?.project?.framework === f ? "selected" : ""}>${f}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>JDK Version</label>
          <input type="text" id="jdkVersion" value="${config?.project?.jdkVersion || "17"}" onchange="markDirty()">
        </div>
        <div class="form-group">
          <label>JDK Vendor</label>
          <select id="jdkVendor" onchange="markDirty()">
            ${jdkVendors.map((v) => `<option value="${v}" ${config?.project?.jdkVendor === v ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Port</label>
          <input type="number" id="port" value="${config?.project?.port || 8080}" onchange="markDirty()">
        </div>
        <div class="form-group">
          <label>Output Type</label>
          <select id="outputType" onchange="markDirty()">
            ${outputTypes.map((o) => `<option value="${o}" ${config?.project?.outputType === o ? "selected" : ""}>${o.toUpperCase()}</option>`).join("")}
          </select>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Docker</div>
      <div class="form-grid">
        <div class="form-group">
          <label>JVM Options</label>
          <input type="text" id="jvmOptions" value="${config?.docker?.jvmOptions || "-Xmx512m -Xms256m"}" onchange="markDirty()">
        </div>
        <div class="form-group">
          <label>Health Check Endpoint</label>
          <input type="text" id="healthEndpoint" value="${config?.docker?.healthCheckEndpoint || "/actuator/health"}" onchange="markDirty()">
        </div>
        <div class="form-group">
          <label>Debug Port</label>
          <input type="number" id="debugPort" value="${config?.docker?.debugPort || 5005}" onchange="markDirty()">
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="useAlpine" ${config?.docker?.useAlpine ? "checked" : ""} onchange="markDirty()">
          <label for="useAlpine">Use Alpine (Smaller Image)</label>
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="enableDebug" ${config?.docker?.enableDebug ? "checked" : ""} onchange="markDirty()">
          <label for="enableDebug">Enable Debug</label>
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="enableHealthCheck" ${config?.docker?.enableHealthCheck !== false ? "checked" : ""} onchange="markDirty()">
          <label for="enableHealthCheck">Enable Health Check</label>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Databases</div>
      <div id="databases-container">
        ${databases.length > 0 ? databases.map((db: any, i: number) => this.generateDatabaseHtml(db, i)).join("") : '<div class="empty-state" id="databases-empty">No databases configured</div>'}
      </div>
      <div class="add-buttons">
        ${dbTypes.map((db) => `<button class="add-btn" onclick="addDatabase('${db}')">+ ${db}</button>`).join("")}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Message Queues</div>
      <div id="messagequeues-container">
        ${messageQueues.length > 0 ? messageQueues.map((mq: any, i: number) => this.generateMessageQueueHtml(mq, i)).join("") : '<div class="empty-state" id="messagequeues-empty">No message queues configured</div>'}
      </div>
      <div class="add-buttons">
        ${mqTypes.map((mq) => `<button class="add-btn" onclick="addMessageQueue('${mq}')">+ ${mq}</button>`).join("")}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Additional Services</div>
      <div id="services-container">
        ${services.length > 0 ? services.map((svc: any, i: number) => this.generateServiceHtml(svc, i)).join("") : '<div class="empty-state" id="services-empty">No additional services</div>'}
      </div>
      <div class="add-buttons">
        ${serviceTypes.map((svc) => `<button class="add-btn" onclick="addService('${svc}')">+ ${svc}</button>`).join("")}
      </div>
    </div>

    <div class="section">
      <div class="section-title">Advanced</div>
      <div class="form-grid">
        <div class="form-group checkbox-group">
          <input type="checkbox" id="envFile" ${config?.envFile !== false ? "checked" : ""} onchange="markDirty()">
          <label for="envFile">Generate .env file</label>
        </div>
        <div class="form-group checkbox-group">
          <input type="checkbox" id="devContainer" ${config?.devContainer?.enabled ? "checked" : ""} onchange="markDirty()">
          <label for="devContainer">Generate Dev Container</label>
        </div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();

    function markDirty() {
      vscode.postMessage({ command: 'markDirty' });
    }

    function updateOutputType() {
      const framework = document.getElementById('framework').value;
      const outputTypeSelect = document.getElementById('outputType');
      
      if (framework === 'jakarta-ee' || framework === 'java-ee' || framework === 'spring-mvc') {
        outputTypeSelect.value = 'war';
      }
      markDirty();
    }

    function toggleDbUrlMode(index) {
      const mode = document.getElementById('db-connection-mode-' + index).value;
      const urlGroup = document.getElementById('db-custom-url-group-' + index);
      
      if (mode === 'custom') {
        urlGroup.style.display = '';
      } else {
        urlGroup.style.display = 'none';
      }
    }

    function collectConfig() {
      const databases = [];
      const dbItems = document.querySelectorAll('[id^="db-version-"]');
      dbItems.forEach((el) => {
        const index = el.id.split('-').pop();
        const dbType = el.closest('.config-item').querySelector('.config-item-title').textContent.replace('🗄️ ', '').toLowerCase();
        const connectionMode = document.getElementById('db-connection-mode-' + index).value;
        const customUrl = document.getElementById('db-url-' + index).value;
        
        databases.push({
          type: dbType,
          version: document.getElementById('db-version-' + index).value || 'latest',
          port: parseInt(document.getElementById('db-internal-port-' + index).value) || 5432,
          externalPort: parseInt(document.getElementById('db-external-port-' + index).value) || undefined,
          name: document.getElementById('db-name-' + index).value || 'appdb',
          username: document.getElementById('db-username-' + index).value || 'admin',
          password: document.getElementById('db-password-' + index).value || 'password',
          useAlpine: document.getElementById('db-alpine-' + index).checked,
          connectionMode: connectionMode,
          customUrl: connectionMode === 'custom' ? customUrl : undefined
        });
      });

      const messageQueues = [];
      const mqItems = document.querySelectorAll('[id^="mq-version-"]');
      mqItems.forEach((el) => {
        const index = el.id.split('-').pop();
        const mqType = el.closest('.config-item').querySelector('.config-item-title').textContent.replace('📨 ', '').toLowerCase();
        
        const mqConfig = {
          type: mqType,
          version: document.getElementById('mq-version-' + index).value || 'latest',
          port: parseInt(document.getElementById('mq-internal-port-' + index).value) || undefined,
          externalPort: parseInt(document.getElementById('mq-external-port-' + index).value) || undefined,
          useAlpine: document.getElementById('mq-alpine-' + index).checked
        };
        
        if (mqType === 'rabbitmq') {
          mqConfig.username = document.getElementById('mq-username-' + index).value || 'guest';
          mqConfig.password = document.getElementById('mq-password-' + index).value || 'guest';
        }
        
        messageQueues.push(mqConfig);
      });

      const services = [];
      const svcItems = document.querySelectorAll('[id^="svc-version-"]');
      svcItems.forEach((el) => {
        const index = el.id.split('-').pop();
        const svcType = el.closest('.config-item').querySelector('.config-item-title').textContent.replace('🔧 ', '').toLowerCase();
        
        services.push({
          type: svcType,
          version: document.getElementById('svc-version-' + index).value || 'latest',
          port: parseInt(document.getElementById('svc-internal-port-' + index).value) || undefined,
          externalPort: parseInt(document.getElementById('svc-external-port-' + index).value) || undefined,
          useAlpine: document.getElementById('svc-alpine-' + index).checked
        });
      });

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
        databases: databases,
        messageQueues: messageQueues,
        services: services,
        envFile: document.getElementById('envFile').checked,
        devContainer: {
          enabled: document.getElementById('devContainer').checked
        },
        profiles: [],
        ciCd: {
          github: false,
          gitlab: false
        },
        kubernetes: {
          enabled: false,
          replicas: 3
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

    function addDatabase(type) {
      const dbConfig = {
        type: type,
        version: getDefaultVersion(type),
        port: getDefaultPort(type),
        externalPort: getDefaultPort(type),
        name: 'appdb',
        username: 'admin',
        password: 'password',
        useAlpine: false,
        connectionMode: 'standard'
      };
      vscode.postMessage({ command: 'addDatabase', dbConfig: dbConfig });
    }

    function removeDatabase(index) {
      vscode.postMessage({ command: 'removeDatabase', index: index });
    }

    function addService(type) {
      const serviceConfig = {
        type: type,
        version: getDefaultVersion(type),
        port: getDefaultServicePort(type),
        externalPort: getDefaultServicePort(type),
        useAlpine: false
      };
      vscode.postMessage({ command: 'addService', serviceConfig: serviceConfig });
    }

    function removeService(index) {
      vscode.postMessage({ command: 'removeService', index: index });
    }

    function addMessageQueue(type) {
      const mqConfig = {
        type: type,
        version: getDefaultVersion(type),
        port: getDefaultMQPort(type),
        externalPort: getDefaultMQPort(type),
        useAlpine: false,
        username: type === 'rabbitmq' ? 'guest' : undefined,
        password: type === 'rabbitmq' ? 'guest' : undefined
      };
      vscode.postMessage({ command: 'addMessageQueue', mqConfig: mqConfig });
    }

    function removeMessageQueue(index) {
      vscode.postMessage({ command: 'removeMessageQueue', index: index });
    }

    window.addEventListener('message', event => {
      const message = event.data;
      
      if (message.command === 'databaseAdded') {
        const container = document.getElementById('databases-container');
        const emptyState = document.getElementById('databases-empty');
        if (emptyState) emptyState.remove();
        
        const html = generateDatabaseHtml(message.dbConfig, message.index);
        container.insertAdjacentHTML('beforeend', html);
        markDirty();
      }
      else if (message.command === 'databaseRemoved') {
        const container = document.getElementById('databases-container');
        const items = container.querySelectorAll('.config-item');
        if (items[message.index]) {
          items[message.index].remove();
        }
        if (container.querySelectorAll('.config-item').length === 0) {
          container.innerHTML = '<div class="empty-state" id="databases-empty">No databases configured</div>';
        }
        markDirty();
      }
      else if (message.command === 'serviceAdded') {
        const container = document.getElementById('services-container');
        const emptyState = document.getElementById('services-empty');
        if (emptyState) emptyState.remove();
        
        const html = generateServiceHtml(message.serviceConfig, message.index);
        container.insertAdjacentHTML('beforeend', html);
        markDirty();
      }
      else if (message.command === 'serviceRemoved') {
        const container = document.getElementById('services-container');
        const items = container.querySelectorAll('.config-item');
        if (items[message.index]) {
          items[message.index].remove();
        }
        if (container.querySelectorAll('.config-item').length === 0) {
          container.innerHTML = '<div class="empty-state" id="services-empty">No additional services</div>';
        }
        markDirty();
      }
      else if (message.command === 'messageQueueAdded') {
        const container = document.getElementById('messagequeues-container');
        const emptyState = document.getElementById('messagequeues-empty');
        if (emptyState) emptyState.remove();
        
        const html = generateMessageQueueHtml(message.mqConfig, message.index);
        container.insertAdjacentHTML('beforeend', html);
        markDirty();
      }
      else if (message.command === 'messageQueueRemoved') {
        const container = document.getElementById('messagequeues-container');
        const items = container.querySelectorAll('.config-item');
        if (items[message.index]) {
          items[message.index].remove();
        }
        if (container.querySelectorAll('.config-item').length === 0) {
          container.innerHTML = '<div class="empty-state" id="messagequeues-empty">No message queues configured</div>';
        }
        markDirty();
      }
    });

    function generateDatabaseHtml(db, index) {
      return \`
      <div class="config-item" data-index="\${index}">
        <div class="config-item-header">
          <span class="config-item-title">🗄️ \${db.type.toUpperCase()}</span>
          <div class="config-item-actions">
            <button class="btn btn-danger btn-sm" onclick="removeDatabase(\${index})">✕ Remove</button>
          </div>
        </div>
        <div class="config-item-details">
          <div class="form-group">
            <label>Version</label>
            <input type="text" id="db-version-\${index}" value="\${db.version || 'latest'}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Internal Port</label>
            <input type="number" id="db-internal-port-\${index}" value="\${db.port || getDefaultPort(db.type)}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>External Port</label>
            <input type="number" id="db-external-port-\${index}" value="\${db.externalPort || db.port || getDefaultPort(db.type)}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Database Name</label>
            <input type="text" id="db-name-\${index}" value="\${db.name || 'appdb'}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="db-username-\${index}" value="\${db.username || 'admin'}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="db-password-\${index}" value="\${db.password || 'password'}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Connection Mode</label>
            <select id="db-connection-mode-\${index}" onchange="toggleDbUrlMode(\${index}); markDirty()">
              <option value="standard" \${!db.customUrl ? 'selected' : ''}>Standard (Local Docker)</option>
              <option value="custom" \${db.customUrl ? 'selected' : ''}>Custom URL (External Server)</option>
            </select>
          </div>
          <div class="form-group" id="db-custom-url-group-\${index}" style="\${db.customUrl ? '' : 'display: none;'}">
            <label>Custom URL</label>
            <input type="text" id="db-url-\${index}" value="\${db.customUrl || ''}" placeholder="jdbc:postgresql://host:port/db?user=admin&password=pass" onchange="markDirty()">
          </div>
          <div class="form-group checkbox-group">
            <input type="checkbox" id="db-alpine-\${index}" \${db.useAlpine ? 'checked' : ''} onchange="markDirty()">
            <label for="db-alpine-\${index}">Use Alpine</label>
          </div>
        </div>
      </div>\`;
    }

    function generateMessageQueueHtml(mq, index) {
      return \`
      <div class="config-item" data-index="\${index}">
        <div class="config-item-header">
          <span class="config-item-title">📨 \${mq.type.toUpperCase()}</span>
          <div class="config-item-actions">
            <button class="btn btn-danger btn-sm" onclick="removeMessageQueue(\${index})">✕ Remove</button>
          </div>
        </div>
        <div class="config-item-details">
          <div class="form-group">
            <label>Version</label>
            <input type="text" id="mq-version-\${index}" value="\${mq.version || 'latest'}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Internal Port</label>
            <input type="number" id="mq-internal-port-\${index}" value="\${mq.port || ''}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>External Port</label>
            <input type="number" id="mq-external-port-\${index}" value="\${mq.externalPort || mq.port || ''}" onchange="markDirty()">
          </div>
          <div class="form-group checkbox-group">
            <input type="checkbox" id="mq-alpine-\${index}" \${mq.useAlpine ? 'checked' : ''} onchange="markDirty()">
            <label for="mq-alpine-\${index}">Use Alpine</label>
          </div>
          \${mq.type === 'rabbitmq' ? \`
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="mq-username-\${index}" value="\${mq.username || 'guest'}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="mq-password-\${index}" value="\${mq.password || 'guest'}" onchange="markDirty()">
          </div>\` : ''}
        </div>
      </div>\`;
    }

    function generateServiceHtml(svc, index) {
      return \`
      <div class="config-item" data-index="\${index}">
        <div class="config-item-header">
          <span class="config-item-title">🔧 \${svc.type.toUpperCase()}</span>
          <div class="config-item-actions">
            <button class="btn btn-danger btn-sm" onclick="removeService(\${index})">✕ Remove</button>
          </div>
        </div>
        <div class="config-item-details">
          <div class="form-group">
            <label>Version</label>
            <input type="text" id="svc-version-\${index}" value="\${svc.version || 'latest'}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Internal Port</label>
            <input type="number" id="svc-internal-port-\${index}" value="\${svc.port || ''}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>External Port</label>
            <input type="number" id="svc-external-port-\${index}" value="\${svc.externalPort || svc.port || ''}" onchange="markDirty()">
          </div>
          <div class="form-group checkbox-group">
            <input type="checkbox" id="svc-alpine-\${index}" \${svc.useAlpine ? 'checked' : ''} onchange="markDirty()">
            <label for="svc-alpine-\${index}">Use Alpine</label>
          </div>
        </div>
      </div>\`;
    }

    function getDefaultPort(type) {
      const ports = {
        postgresql: 5432, mysql: 3306, mariadb: 3306, mongodb: 27017,
        redis: 6379, cassandra: 9042, elasticsearch: 9200, neo4j: 7687, h2: 9092
      };
      return ports[type] || 5432;
    }

    function getDefaultServicePort(type) {
      const ports = {
        nginx: 80, grafana: 3000, prometheus: 9090, keycloak: 8080, minio: 9000
      };
      return ports[type] || 8080;
    }

    function getDefaultMQPort(type) {
      const ports = {
        kafka: 9092, rabbitmq: 5672, activemq: 61616
      };
      return ports[type] || 5672;
    }

    function getDefaultVersion(type) {
      const versions = {
        postgresql: "16", mysql: "8.4", mariadb: "11", mongodb: "7",
        redis: "7", cassandra: "5", elasticsearch: "8", neo4j: "5",
        kafka: "7.7.0", rabbitmq: "3.13", activemq: "6.1.2",
        nginx: "1.27", grafana: "11.2.0", prometheus: "v2.54.1",
        keycloak: "25.0.4", minio: "latest"
      };
      return versions[type] || "latest";
    }
  </script>
</body>
</html>`;
	}

	private generateDatabaseHtml(db: any, index: number): string {
		return `
      <div class="config-item" data-index="${index}">
        <div class="config-item-header">
          <span class="config-item-title">🗄️ ${db.type.toUpperCase()}</span>
          <div class="config-item-actions">
            <button class="btn btn-danger btn-sm" onclick="removeDatabase(${index})">✕ Remove</button>
          </div>
        </div>
        <div class="config-item-details">
          <div class="form-group">
            <label>Version</label>
            <input type="text" id="db-version-${index}" value="${db.version || "latest"}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Internal Port</label>
            <input type="number" id="db-internal-port-${index}" value="${db.port || this.getDefaultPort(db.type)}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>External Port</label>
            <input type="number" id="db-external-port-${index}" value="${db.externalPort || db.port || this.getDefaultPort(db.type)}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Database Name</label>
            <input type="text" id="db-name-${index}" value="${db.name || "appdb"}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="db-username-${index}" value="${db.username || "admin"}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="db-password-${index}" value="${db.password || "password"}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Connection Mode</label>
            <select id="db-connection-mode-${index}" onchange="toggleDbUrlMode(${index}); markDirty()">
              <option value="standard" ${!db.customUrl ? "selected" : ""}>Standard (Local Docker)</option>
              <option value="custom" ${db.customUrl ? "selected" : ""}>Custom URL (External Server)</option>
            </select>
          </div>
          <div class="form-group" id="db-custom-url-group-${index}" style="${db.customUrl ? "" : "display: none;"}">
            <label>Custom URL</label>
            <input type="text" id="db-url-${index}" value="${db.customUrl || ""}" placeholder="jdbc:postgresql://host:port/db?user=admin&password=pass" onchange="markDirty()">
          </div>
          <div class="form-group checkbox-group">
            <input type="checkbox" id="db-alpine-${index}" ${db.useAlpine ? "checked" : ""} onchange="markDirty()">
            <label for="db-alpine-${index}">Use Alpine</label>
          </div>
        </div>
      </div>`;
	}

	private generateMessageQueueHtml(mq: any, index: number): string {
		return `
      <div class="config-item" data-index="${index}">
        <div class="config-item-header">
          <span class="config-item-title">📨 ${mq.type.toUpperCase()}</span>
          <div class="config-item-actions">
            <button class="btn btn-danger btn-sm" onclick="removeMessageQueue(${index})">✕ Remove</button>
          </div>
        </div>
        <div class="config-item-details">
          <div class="form-group">
            <label>Version</label>
            <input type="text" id="mq-version-${index}" value="${mq.version || "latest"}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Internal Port</label>
            <input type="number" id="mq-internal-port-${index}" value="${mq.port || ""}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>External Port</label>
            <input type="number" id="mq-external-port-${index}" value="${mq.externalPort || mq.port || ""}" onchange="markDirty()">
          </div>
          <div class="form-group checkbox-group">
            <input type="checkbox" id="mq-alpine-${index}" ${mq.useAlpine ? "checked" : ""} onchange="markDirty()">
            <label for="mq-alpine-${index}">Use Alpine</label>
          </div>
          ${
				mq.type === "rabbitmq"
					? `
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="mq-username-${index}" value="${mq.username || "guest"}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="mq-password-${index}" value="${mq.password || "guest"}" onchange="markDirty()">
          </div>`
					: ""
			}
        </div>
      </div>`;
	}

	private generateServiceHtml(svc: any, index: number): string {
		return `
      <div class="config-item" data-index="${index}">
        <div class="config-item-header">
          <span class="config-item-title">🔧 ${svc.type.toUpperCase()}</span>
          <div class="config-item-actions">
            <button class="btn btn-danger btn-sm" onclick="removeService(${index})">✕ Remove</button>
          </div>
        </div>
        <div class="config-item-details">
          <div class="form-group">
            <label>Version</label>
            <input type="text" id="svc-version-${index}" value="${svc.version || "latest"}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>Internal Port</label>
            <input type="number" id="svc-internal-port-${index}" value="${svc.port || ""}" onchange="markDirty()">
          </div>
          <div class="form-group">
            <label>External Port</label>
            <input type="number" id="svc-external-port-${index}" value="${svc.externalPort || svc.port || ""}" onchange="markDirty()">
          </div>
          <div class="form-group checkbox-group">
            <input type="checkbox" id="svc-alpine-${index}" ${svc.useAlpine ? "checked" : ""} onchange="markDirty()">
            <label for="svc-alpine-${index}">Use Alpine</label>
          </div>
        </div>
      </div>`;
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
