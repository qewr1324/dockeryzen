import { BaseDockerfileGenerator } from "./BaseDockerfileGenerator.js";

export class LaravelDockerfileGenerator extends BaseDockerfileGenerator {
	generate(): string {
		const phpVersion = this.config.phpVersion || "8.3";
		const debugExpose = this.getDebugExpose();
		const healthCheck = this.getHealthCheck();
		const healthCheckInstall = this.getHealthCheckInstall();
		const ociLabels = this.getOciLabels();
		const port = this.config.port;
		const internalPort = 9000;

		let phpImage = `php:${phpVersion}-fpm`;
		if (this.langConfig?.versions) {
			const versionConfig = this.langConfig.versions.find((v: any) => v.value === phpVersion);
			if (versionConfig?.images) {
				phpImage = this.config.useAlpine ? versionConfig.images.fpmAlpine || versionConfig.images.fpm : versionConfig.images.fpm;
			}
		}

		const laravelDirs = `RUN mkdir -p /var/www/html/storage/framework/views \\
	/var/www/html/storage/framework/cache \\
	/var/www/html/storage/framework/sessions \\
	/var/www/html/storage/logs \\
	/var/www/html/bootstrap/cache && \\
	chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache && \\
	chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache`;

		const dbTypes = this.config.databases.map((d) => d.type);
		const needsPdoMysql = dbTypes.some((t) => ["mysql", "mariadb"].includes(t));
		const needsPdoPgsql = dbTypes.some((t) => ["postgresql", "timescaledb"].includes(t));
		const needsPdoSqlite = dbTypes.includes("sqlite");

		const phpExts: string[] = ["bcmath", "pcntl", "exif"];
		if (needsPdoMysql) phpExts.push("pdo_mysql");
		if (needsPdoPgsql) phpExts.push("pdo_pgsql");
		if (needsPdoSqlite) phpExts.push("pdo_sqlite");
		phpExts.push("gd", "mbstring", "zip", "opcache");

		const uniqueExts = [...new Set(phpExts)];

		const installCmd = this.config.useAlpine
			? `RUN apk add --no-cache git curl libpng-dev oniguruma-dev libxml2-dev zip unzip libzip-dev supervisor postgresql-dev icu-dev freetype-dev libjpeg-turbo-dev`
			: `RUN apt-get update && apt-get install -y --no-install-recommends git curl libpng-dev libonig-dev libxml2-dev zip unzip libzip-dev supervisor libpq-dev libicu-dev libfreetype6-dev libjpeg62-turbo-dev && rm -rf /var/lib/apt/lists/*`;

		const extInstall = `RUN docker-php-ext-configure gd --with-freetype --with-jpeg 2>/dev/null || true && \\
    docker-php-ext-install -j$(nproc) ${uniqueExts.join(" ")}`;

		const hasQueueWorker = this.config.enableQueueWorker;
		const supervisorConfig = hasQueueWorker
			? `
# Create supervisor config for queue worker
RUN mkdir -p /etc/supervisor/conf.d /var/log/supervisor && \\
    cat > /etc/supervisor/conf.d/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid

[program:php-fpm]
command=php-fpm -F
autostart=true
autorestart=true
priority=5
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:queue-worker]
command=php /var/www/html/artisan queue:work --sleep=3 --tries=3 --max-time=3600
directory=/var/www/html
user=www-data
autostart=true
autorestart=true
stopasgroup=true
killasgroup=true
numprocs=1
redirect_stderr=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF
`
			: "";

		const finalCmd = hasQueueWorker ? `CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]` : `USER www-data\nCMD ["php-fpm"]`;

		return `# syntax=docker/dockerfile:1.4

${this.getHeader()}

FROM ${phpImage}
WORKDIR /var/www/html

${installCmd}
${extInstall}

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY composer.json composer.lock* ./

RUN --mount=type=cache,target=/root/.composer/cache \\
    if [ -f composer.json ]; then \\
        composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction; \\
    fi

COPY . .

RUN if [ -f composer.json ]; then \\
        composer dump-autoload --optimize --no-dev --classmap-authoritative --no-interaction; \\
    fi && \\
    if [ -f .env.example ] && [ ! -f .env ]; then cp .env.example .env; fi && \\
    if [ -f artisan ]; then \\
        php artisan key:generate --force 2>/dev/null || true; \\
        php artisan package:discover --ansi 2>/dev/null || true; \\
    fi

${laravelDirs}
${supervisorConfig}
${ociLabels}
EXPOSE ${internalPort}${debugExpose}${healthCheck}
${finalCmd}`;
	}
}
