import { ProjectConfig } from "../types/index.js";

/**
 * GitHubWorkflowGenerator class - Generates GitHub Actions workflow
 */
export class GitHubWorkflowGenerator {
	constructor(private config: ProjectConfig) {}

	generate(): string {
		const projectName = this.config.projectName;
		const jdkVersion = this.config.jdkVersion || "17";

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
    services:
${this.generateDatabaseServices()}
    steps:
      - uses: actions/checkout@v4
      - name: Set up JDK ${jdkVersion}
        uses: actions/setup-java@v4
        with:
          java-version: '${jdkVersion}'
          distribution: 'temurin'
          cache: maven
      - name: Run unit tests
        run: mvn test
      - name: Build Docker image
        run: docker build -t \${{ secrets.DOCKER_USERNAME }}/${projectName}:test .
      - name: Start services
        run: docker compose up -d
      - name: Wait for services
        run: sleep 30
      - name: Run integration tests
        run: mvn verify
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

	private generateDatabaseServices(): string {
		const services: string[] = [];

		for (const db of this.config.databases) {
			if (db.type === "postgresql" || db.type === "timescaledb") {
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
			} else if (db.type === "mysql" || db.type === "mariadb") {
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
			} else if (db.type === "mongodb") {
				services.push(`      mongodb:
        image: mongo:${db.version || "8"}
        env:
          MONGO_INITDB_ROOT_USERNAME: ${db.username || "root"}
          MONGO_INITDB_ROOT_PASSWORD: ${db.password || "root"}
        ports:
          - ${db.internalPort || 27017}:27017
        options: >-
          --health-cmd "mongosh --eval 'db.adminCommand(\"ping\")'"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5`);
			} else if (db.type === "redis") {
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
		}

		if (this.config.enableRedis && !this.config.databases.some((d) => d.type === "redis")) {
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

		return services.join("\n");
	}
}
