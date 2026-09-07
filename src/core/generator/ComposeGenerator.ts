import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import type { ProjectAnalysis, DockerConfig, ComposeService, Volume, Network, MessageQueueConfig, AdditionalServiceConfig } from "../../types/interfaces.js";
import { DatabaseType } from "../../types/interfaces.js";

export class ComposeGenerator {
  public generate(analysis: ProjectAnalysis, config: DockerConfig): string {
    const services: ComposeService[] = [];
    const volumes: Volume[] = [];
    const networks: Network[] = [];
    const usedServiceNames = new Set<string>();

    const useEnvFile = config.generateEnvFile !== false;

    const appService = this.generateAppService(analysis, config, useEnvFile);
    services.push(appService);
    usedServiceNames.add("app");

    if (config.databases && config.databases.length > 0) {
      for (const db of config.databases) {
        if (!usedServiceNames.has(db.type)) {
          services.push(this.generateDatabaseService(db));
          volumes.push({ name: `${db.type}-data` });
          usedServiceNames.add(db.type);
        }
      }
    } else if (config.database && config.database.type !== DatabaseType.NONE) {
      if (!usedServiceNames.has(config.database.type)) {
        services.push(this.generateDatabaseService(config.database));
        volumes.push({ name: `${config.database.type}-data` });
        usedServiceNames.add(config.database.type);
      }
    }

    if (config.messageQueues && config.messageQueues.length > 0) {
      for (const mq of config.messageQueues) {
        if (!usedServiceNames.has(mq.type)) {
          services.push(this.generateMessageQueueService(mq));
          volumes.push({ name: `${mq.type}-data` });
          usedServiceNames.add(mq.type);
        }
      }
    }

    if (config.additionalServices && config.additionalServices.length > 0) {
      for (const svc of config.additionalServices) {
        const realServices = ["nginx", "grafana", "prometheus", "keycloak", "minio"];
        if (realServices.includes(svc.type) && !usedServiceNames.has(svc.type)) {
          services.push(this.generateAdditionalService(svc));
          volumes.push({ name: `${svc.type}-data` });
          usedServiceNames.add(svc.type);
        }
      }
    }

    networks.push({ name: "dockeryzen-network", driver: "bridge" });

    return this.buildComposeFile(services, volumes, networks);
  }

  private generateAppService(analysis: ProjectAnalysis, config: DockerConfig, useEnvFile: boolean): ComposeService {
    const service: ComposeService = {
      name: "app",
      build: { context: ".", dockerfile: "Dockerfile" },
      ports: [`${config.port}:${config.port}`],
      environment: {},
      volumes: [],
      depends_on: [],
      restart: "unless-stopped",
      networks: ["dockeryzen-network"],
    };

    if (config.enableDebug) {
      service.ports.push(`${config.debugPort || 5005}:${config.debugPort || 5005}`);
    }

    if (!useEnvFile) {
      if (config.envVariables) {
        service.environment = { ...config.envVariables };
      }
      if (config.databases && config.databases.length > 0) {
        for (const db of config.databases) {
          if (db.type !== DatabaseType.NONE) {
            service.environment[`SPRING_DATASOURCE_URL`] = `jdbc:${db.type}://${db.type}:${db.port}/${db.name}`;
            service.environment[`SPRING_DATASOURCE_USERNAME`] = db.username;
            service.environment[`SPRING_DATASOURCE_PASSWORD`] = db.password;
          }
        }
      }
    } else {
      service.env_file = [".env"];
    }

    if (config.databases && config.databases.length > 0) {
      for (const db of config.databases) {
        if (db.type !== DatabaseType.NONE) {
          service.depends_on.push(db.type);
        }
      }
    }

    if (config.messageQueues) {
      for (const mq of config.messageQueues) {
        service.depends_on.push(mq.type);
      }
    }

    if (config.enableHealthCheck) {
      const healthEndpoint = analysis.outputType === "war" ? `http://localhost:${config.port}/` : `http://localhost:${config.port}${config.healthCheckEndpoint || "/actuator/health"}`;
      service.healthcheck = {
        test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", healthEndpoint],
        interval: "30s",
        timeout: "3s",
        retries: 3,
      };
    }

    return service;
  }

  private generateDatabaseService(dbConfig: any): ComposeService {
    const service: ComposeService = {
      name: dbConfig.type,
      image: this.getDatabaseImage(dbConfig),
      ports: [`${dbConfig.externalPort || dbConfig.port}:${dbConfig.port}`],
      environment: {},
      volumes: [`${dbConfig.type}-data:${this.getDatabaseVolumePath(dbConfig.type)}`],
      depends_on: [],
      restart: "unless-stopped",
      networks: ["dockeryzen-network"],
    };

    switch (dbConfig.type) {
      case "postgresql":
        service.environment = {
          POSTGRES_DB: dbConfig.name,
          POSTGRES_USER: dbConfig.username,
          POSTGRES_PASSWORD: dbConfig.password,
        };
        break;
      case "mysql":
        service.environment = {
          MYSQL_DATABASE: dbConfig.name,
          MYSQL_USER: dbConfig.username,
          MYSQL_PASSWORD: dbConfig.password,
          MYSQL_ROOT_PASSWORD: dbConfig.password,
        };
        break;
      case "mariadb":
        service.environment = {
          MARIADB_DATABASE: dbConfig.name,
          MARIADB_USER: dbConfig.username,
          MARIADB_PASSWORD: dbConfig.password,
          MARIADB_ROOT_PASSWORD: dbConfig.password,
        };
        break;
      case "mongodb":
        service.environment = {
          MONGO_INITDB_DATABASE: dbConfig.name,
          MONGO_INITDB_ROOT_USERNAME: dbConfig.username,
          MONGO_INITDB_ROOT_PASSWORD: dbConfig.password,
        };
        break;
    }

    service.healthcheck = {
      test: this.getDatabaseHealthCheck(dbConfig.type),
      interval: "30s",
      timeout: "3s",
      retries: 5,
    };

    return service;
  }

  private generateMessageQueueService(mqConfig: any): ComposeService {
    const service: ComposeService = {
      name: mqConfig.type,
      image: this.getMessageQueueImage(mqConfig),
      ports: [`${mqConfig.externalPort || mqConfig.port}:${mqConfig.port}`],
      environment: {},
      volumes: [`${mqConfig.type}-data:${this.getMessageQueueVolumePath(mqConfig.type)}`],
      depends_on: [],
      restart: "unless-stopped",
      networks: ["dockeryzen-network"],
    };

    if (mqConfig.type === "kafka") {
      service.environment = {
        KAFKA_ADVERTISED_LISTENERS: `PLAINTEXT://kafka:${mqConfig.port}`,
        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1",
      };
    } else if (mqConfig.type === "rabbitmq") {
      service.environment = {
        RABBITMQ_DEFAULT_USER: mqConfig.username || "guest",
        RABBITMQ_DEFAULT_PASS: mqConfig.password || "guest",
      };
    }

    service.healthcheck = {
      test: this.getMessageQueueHealthCheck(mqConfig.type),
      interval: "30s",
      timeout: "3s",
      retries: 5,
    };

    return service;
  }

  private generateAdditionalService(svcConfig: any): ComposeService {
    const service: ComposeService = {
      name: svcConfig.type,
      image: this.getAdditionalServiceImage(svcConfig),
      ports: [`${svcConfig.externalPort || svcConfig.port}:${svcConfig.port}`],
      environment: {},
      volumes: [`${svcConfig.type}-data:/data`],
      depends_on: [],
      restart: "unless-stopped",
      networks: ["dockeryzen-network"],
    };

    return service;
  }

  private getDatabaseImage(dbConfig: any): string {
    const type = dbConfig.type.toLowerCase();
    const version = dbConfig.version || "latest";
    const useAlpine = dbConfig.useAlpine || false;

    const images: Record<string, string> = {
      postgresql: "postgres",
      mysql: "mysql",
      mariadb: "mariadb",
      mongodb: "mongo",
      redis: "redis",
      cassandra: "cassandra",
      elasticsearch: "docker.elastic.co/elasticsearch/elasticsearch",
      neo4j: "neo4j",
    };

    const baseImage = images[type] || "postgres";

    if (useAlpine && !version.includes("-alpine")) {
      return `${baseImage}:${version}-alpine`;
    }

    return `${baseImage}:${version}`;
  }

  private getMessageQueueImage(mqConfig: any): string {
    const type = mqConfig.type;
    const version = mqConfig.version || "latest";
    const useAlpine = mqConfig.useAlpine || false;

    const images: Record<string, string> = {
      kafka: "confluentinc/cp-kafka",
      rabbitmq: "rabbitmq",
      activemq: "apache/activemq-classic",
    };

    const baseImage = images[type] || "rabbitmq";

    if (useAlpine && type !== "kafka" && !version.includes("-alpine")) {
      return `${baseImage}:${version}-alpine`;
    }

    return `${baseImage}:${version}`;
  }

  private getAdditionalServiceImage(svcConfig: any): string {
    const type = svcConfig.type;
    const version = svcConfig.version || "latest";
    const useAlpine = svcConfig.useAlpine || false;

    const images: Record<string, string> = {
      nginx: "nginx",
      grafana: "grafana/grafana",
      prometheus: "prom/prometheus",
      keycloak: "quay.io/keycloak/keycloak",
      minio: "minio/minio",
    };

    const baseImage = images[type] || "nginx";

    if (useAlpine && !version.includes("-alpine")) {
      return `${baseImage}:${version}-alpine`;
    }

    return `${baseImage}:${version}`;
  }

  private getDatabaseVolumePath(dbType: string): string {
    const paths: Record<string, string> = {
      postgresql: "/var/lib/postgresql/data",
      mysql: "/var/lib/mysql",
      mariadb: "/var/lib/mysql",
      mongodb: "/data/db",
      redis: "/data",
      cassandra: "/var/lib/cassandra",
      elasticsearch: "/usr/share/elasticsearch/data",
      neo4j: "/data",
    };
    return paths[dbType] || "/data";
  }

  private getMessageQueueVolumePath(mqType: string): string {
    const paths: Record<string, string> = {
      kafka: "/var/lib/kafka/data",
      rabbitmq: "/var/lib/rabbitmq",
      activemq: "/opt/activemq/data",
    };
    return paths[mqType] || "/data";
  }

  private getDatabaseHealthCheck(dbType: string): string[] {
    switch (dbType) {
      case "postgresql":
        return ["CMD-SHELL", "pg_isready -U admin"];
      case "mysql":
      case "mariadb":
        return ["CMD-SHELL", "mysqladmin ping -h localhost"];
      case "mongodb":
        return ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand({ ping: 1 })"];
      case "redis":
        return ["CMD", "redis-cli", "ping"];
      case "cassandra":
        return ["CMD-SHELL", "cqlsh -e 'DESCRIBE system'"];
      case "elasticsearch":
        return ["CMD-SHELL", "curl -f http://localhost:9200/_cluster/health || exit 1"];
      default:
        return ["CMD-SHELL", "echo 'healthy'"];
    }
  }

  private getMessageQueueHealthCheck(mqType: string): string[] {
    switch (mqType) {
      case "kafka":
        return ["CMD-SHELL", "kafka-topics --bootstrap-server localhost:9092 --list"];
      case "rabbitmq":
        return ["CMD", "rabbitmq-diagnostics", "ping"];
      case "activemq":
        return ["CMD-SHELL", "curl -f http://localhost:8161/ || exit 1"];
      default:
        return ["CMD-SHELL", "echo 'healthy'"];
    }
  }

  private buildComposeFile(services: ComposeService[], volumes: Volume[], networks: Network[]): string {
    let content = `version: '3.9'

services:
`;

    const uniqueVolumes = volumes.filter((vol, index, self) => index === self.findIndex((v) => v.name === vol.name));

    for (const service of services) {
      content += `  ${service.name}:
`;

      if (service.build) {
        content += `    build:
      context: ${service.build.context}
      dockerfile: ${service.build.dockerfile}
`;
      } else if (service.image) {
        content += `    image: ${service.image}
`;
      }

      if (service.ports && service.ports.length > 0) {
        content += `    ports:
`;
        for (const port of service.ports) {
          content += `      - "${port}"
`;
        }
      }

      if (service.env_file && service.env_file.length > 0) {
        content += `    env_file:
`;
        for (const envFile of service.env_file) {
          content += `      - ${envFile}
`;
        }
      } else if (service.environment && Object.keys(service.environment).length > 0) {
        content += `    environment:
`;
        for (const [key, value] of Object.entries(service.environment)) {
          content += `      ${key}: ${value}
`;
        }
      }

      if (service.volumes && service.volumes.length > 0) {
        content += `    volumes:
`;
        for (const volume of service.volumes) {
          content += `      - ${volume}
`;
        }
      }

      if (service.depends_on && service.depends_on.length > 0) {
        content += `    depends_on:
`;
        for (const dep of service.depends_on) {
          content += `      ${dep}:
        condition: service_healthy
`;
        }
      }

      if (service.healthcheck) {
        content += `    healthcheck:
      test: [${service.healthcheck.test.map((t) => `"${t}"`).join(", ")}]
      interval: ${service.healthcheck.interval}
      timeout: ${service.healthcheck.timeout}
      retries: ${service.healthcheck.retries}
`;
      }

      if (service.restart) {
        content += `    restart: ${service.restart}
`;
      }

      if (service.networks && service.networks.length > 0) {
        content += `    networks:
`;
        for (const network of service.networks) {
          content += `      - ${network}
`;
        }
      }

      content += "\n";
    }

    if (uniqueVolumes.length > 0) {
      content += `volumes:
`;
      for (const volume of uniqueVolumes) {
        content += `  ${volume.name}:
`;
      }
      content += "\n";
    }

    if (networks.length > 0) {
      content += `networks:
`;
      for (const network of networks) {
        content += `  ${network.name}:
    driver: ${network.driver}
`;
      }
    }

    return content;
  }
}