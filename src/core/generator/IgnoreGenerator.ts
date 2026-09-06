/**
 * .dockerignore generator
 */
export class IgnoreGenerator {
	/**
	 * Generate .dockerignore content
	 */
	public generate(): string {
		return `# Version control
.git
.gitignore
.gitattributes

# Build artifacts
target/
build/
out/
dist/
*.jar
*.war
*.ear
*.class

# IDE files
.idea/
.vscode/
*.iml
*.ipr
*.iws
.project
.classpath
.settings/

# Logs
*.log
*.tmp
*.temp
logs/

# OS files
.DS_Store
Thumbs.db
Desktop.ini

# Node modules (for hybrid projects)
node_modules/
npm-debug.log
yarn-error.log

# Docker files
Dockerfile
.dockerignore
docker-compose.yml
docker-compose.*.yml
.docker/

# Documentation
docs/
README.md
LICENSE

# Testing
coverage/
.nyc_output/
test-results/

# CI/CD
.github/
.gitlab/
.ci/
.jenkins/

# Temporary files
*.swp
*.swo
*~
.cache/
.tmp/

# Environment files
.env
.env.local
.env.*.local

# Secrets
*.key
*.pem
*.crt
secrets/

# Generated files
src/generated/
generated/
*.generated.*

# Package manager files
package-lock.json
yarn.lock
pnpm-lock.yaml

# Other
*.bak
*.old
*.orig
`;
	}
}
