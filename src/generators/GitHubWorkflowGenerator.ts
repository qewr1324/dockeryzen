import { ProjectConfig } from "../types/index.js";

export class GitHubWorkflowGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const projectName = this.config.projectName;
		const lang = this.config.language;
		const setupSteps = this.generateSetupSteps();
		const testCommand = this.generateTestCommand();
		const databaseServices = this.generateDatabaseServices();

		return `name: Docker Build & Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  DOCKER_IMAGE: \${{ secrets.DOCKER_USERNAME }}/${projectName}

jobs:
  test:
    runs-on: ubuntu-latest
${databaseServices ? `    services:\n${databaseServices}` : ""}
    steps:
      - uses: actions/checkout@v4
${setupSteps}
      - name: Run unit tests
        run: ${testCommand}
      - name: Build Docker image
        run: docker build -t \${{ secrets.DOCKER_USERNAME }}/${projectName}:test .
      - name: Start services
        run: docker compose up -d
      - name: Wait for services
        run: sleep 30
      - name: Run integration tests
        run: ${testCommand}
      - name: Stop services
        run: docker compose down
      - name: Run Hadolint
        uses: hadolint/hadolint-action@v3
        with:
          dockerfile: Dockerfile
      - name: Run Trivy vulnerability scanner
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: \${{ secrets.DOCKER_USERNAME }}/${projectName}:test
          format: table
          exit-code: 1
          severity: CRITICAL,HIGH

  build-and-push:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: \${{ secrets.DOCKER_USERNAME }}
          password: \${{ secrets.DOCKER_PASSWORD }}
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            \${{ secrets.DOCKER_USERNAME }}/${projectName}:latest
            \${{ secrets.DOCKER_USERNAME }}/${projectName}:\${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max`;
	}

	private generateSetupSteps(): string {
		const lang = this.config.language;
		const buildTool = this.config.buildTool || "maven";
		const jdkVersion = this.config.jdkVersion || "17";
		const nodeVersion = this.config.nodeVersion || "18";
		const pythonVersion = this.config.pythonVersion || "3.11";
		const goVersion = this.config.goVersion || "1.21";
		const dotnetVersion = this.config.dotnetVersion || "8.0";
		const phpVersion = this.config.phpVersion || "8.3";
		const rubyVersion = this.config.rubyVersion || "3.3";
		const rustVersion = this.config.rustVersion || "stable";

		if (lang.startsWith("java")) {
			const cache = buildTool === "gradle" ? "gradle" : "maven";
			return `      - name: Set up JDK ${jdkVersion}
        uses: actions/setup-java@v4
        with:
          java-version: '${jdkVersion}'
          distribution: 'temurin'
          cache: ${cache}`;
		} else if (lang.startsWith("js")) {
			const pm = this.config.packageManager || "npm";
			return `      - name: Set up Node.js ${nodeVersion}
        uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'
          cache: '${pm}'`;
		} else if (lang === "python") {
			return `      - name: Set up Python ${pythonVersion}
        uses: actions/setup-python@v5
        with:
          python-version: '${pythonVersion}'
          cache: 'pip'`;
		} else if (lang === "go") {
			return `      - name: Set up Go ${goVersion}
        uses: actions/setup-go@v5
        with:
          go-version: '${goVersion}'`;
		} else if (lang === "dotnet") {
			return `      - name: Set up .NET ${dotnetVersion}
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '${dotnetVersion}'`;
		} else if (lang === "rust") {
			// باگ 585: actions-rs deprecated، از dtolnay/rust-toolchain استفاده میکنیم
			return `      - name: Set up Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          toolchain: ${rustVersion}`;
		} else if (lang === "laravel") {
			// باگ 667: PHP version از config
			return `      - name: Set up PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '${phpVersion}'
          tools: composer:v2`;
		} else if (lang === "rails") {
			return `      - name: Set up Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: '${rubyVersion}'
          bundler-cache: true`;
		}
		return "";
	}

	private generateTestCommand(): string {
		const lang = this.config.language;
		const buildTool = this.config.buildTool || "maven";

		if (lang.startsWith("java")) {
			// باگ 584: استفاده از gradlew اگه وجود داشته باشه
			if (buildTool === "gradle") {
				return "if [ -f gradlew ]; then ./gradlew test; else gradle test; fi";
			}
			return "if [ -f mvnw ]; then ./mvnw test; else mvn test; fi";
		} else if (lang.startsWith("js")) {
			const pm = this.config.packageManager || "npm";
			switch (pm) {
				case "yarn":
					return "yarn test";
				case "pnpm":
					return "pnpm test";
				case "bun":
					return "bun test";
				default:
					return "npm test";
			}
		} else if (lang === "python") {
			return "pytest || python -m pytest";
		} else if (lang === "go") {
			return "go test ./...";
		} else if (lang === "dotnet") {
			return "dotnet test";
		} else if (lang === "rust") {
			return "cargo test";
		} else if (lang === "laravel") {
			return "php artisan test";
		} else if (lang === "rails") {
			return "bundle exec rspec";
		}
		// باگ 628: اگر test وجود نداشته باشه
		return "echo 'No test command defined'";
	}

	private generateDatabaseServices(): string {
		const services: string[] = [];
		const usedNames = new Set<string>();

		for (const db of this.config.databases) {
			if (db.useExternalUrl) continue;

			if (db.type === "postgresql") {
				if (!usedNames.has("postgres")) {
					usedNames.add("postgres");
					services.push(`      postgres:
        image: postgres:${db.version || "17"}
        env:
          POSTGRES_DB: ${db.databaseName || "postgres"}
          POSTGRES_USER: ${db.username || "postgres"}
          POSTGRES_PASSWORD: ${db.password || "root"}
        ports:
          - ${db.internalPort || 5432}:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5`);
				}
			} else if (db.type === "timescaledb") {
				if (!usedNames.has("timescaledb")) {
					usedNames.add("timescaledb");
					services.push(`      timescaledb:
        image: timescale/timescaledb:${db.version || "latest-pg17"}
        env:
          POSTGRES_DB: ${db.databaseName || "postgres"}
          POSTGRES_USER: ${db.username || "postgres"}
          POSTGRES_PASSWORD: ${db.password || "root"}
        ports:
          - ${db.internalPort || 5432}:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5`);
				}
			} else if (db.type === "mysql") {
				if (!usedNames.has("mysql")) {
					usedNames.add("mysql");
					services.push(`      mysql:
        image: mysql:${db.version || "8"}
        env:
          MYSQL_DATABASE: ${db.databaseName || "mysql"}
          MYSQL_USER: ${db.username || "root"}
          MYSQL_PASSWORD: ${db.password || "root"}
          MYSQL_ROOT_PASSWORD: ${db.password || "root"}
        ports:
          - ${db.internalPort || 3306}:3306
        options: >-
          --health-cmd "mysqladmin ping -h localhost"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5`);
				}
			} else if (db.type === "mariadb") {
				if (!usedNames.has("mariadb")) {
					usedNames.add("mariadb");
					services.push(`      mariadb:
        image: mariadb:${db.version || "11"}
        env:
          MYSQL_DATABASE: ${db.databaseName || "mysql"}
          MYSQL_USER: ${db.username || "root"}
          MYSQL_PASSWORD: ${db.password || "root"}
          MYSQL_ROOT_PASSWORD: ${db.password || "root"}
        ports:
          - ${db.internalPort || 3306}:3306
        options: >-
          --health-cmd "mysqladmin ping -h localhost"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5`);
				}
			} else if (db.type === "mongodb") {
				if (!usedNames.has("mongodb")) {
					usedNames.add("mongodb");
					// باگ 629: MongoDB health check escaping اصلاح شد
					services.push(`      mongodb:
        image: mongo:${db.version || "8"}
        env:
          MONGO_INITDB_ROOT_USERNAME: ${db.username || "root"}
          MONGO_INITDB_ROOT_PASSWORD: ${db.password || "root"}
        ports:
          - ${db.internalPort || 27017}:27017
        options: >-
          --health-cmd "mongosh --quiet --eval 'db.adminCommand({ping: 1})' || exit 1"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5`);
				}
			} else if (db.type === "redis") {
				if (!usedNames.has("redis")) {
					usedNames.add("redis");
					services.push(`      redis:
        image: redis:${db.version || "8"}-alpine
        ports:
          - ${db.internalPort || 6379}:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5`);
				}
			} else if (db.type === "cockroachdb") {
				if (!usedNames.has("cockroachdb")) {
					usedNames.add("cockroachdb");
					// باگ 582: پورت اصلاح شد
					services.push(`      cockroachdb:
        image: cockroachdb/cockroach:${db.version || "v24.3"}
        ports:
          - ${db.internalPort || 26257}:26257
        options: >-
          --health-cmd "curl -f http://localhost:26257/health || exit 1"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5`);
				}
			}
		}

		if (this.config.enableRedis && !usedNames.has("redis")) {
			services.push(`      redis:
        image: redis:8-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5`);
		}

		// باگ 586: indent اصلاح شد
		return services.join("\n");
	}
}
