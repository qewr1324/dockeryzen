// lib/shared/versions.ts

export interface VersionInfo {
	id: string;
	displayName: string;
	description: string;
	minJavaVersion: string;
	schema: string;
	namespace: string;
	dependencies?: Record<string, string>;
}

export const MAVEN_VERSIONS: Record<string, VersionInfo> = {
	"3.9": {
		id: "3.9",
		displayName: "Maven 3.9.x",
		description: "Latest stable Maven version",
		minJavaVersion: "8",
		schema: "http://maven.apache.org/xsd/maven-4.0.0.xsd",
		namespace: "http://maven.apache.org/POM/4.0.0",
		dependencies: {
			"junit-jupiter": "5.10.2",
			"maven-compiler-plugin": "3.11.0",
			"maven-surefire-plugin": "3.2.5",
		},
	},
	"4.0": {
		id: "4.0",
		displayName: "Maven 4.0",
		description: "Next generation Maven (development)",
		minJavaVersion: "17",
		schema: "https://maven.apache.org/xsd/maven-4.0.0.xsd",
		namespace: "https://maven.apache.org/POM/4.0.0",
	},
};

export const JPA_VERSIONS: Record<string, VersionInfo> = {
	"3.0": {
		id: "3.0",
		displayName: "Jakarta Persistence 3.0",
		description: "JPA 3.0 (Jakarta EE 9+)",
		minJavaVersion: "11",
		schema: "https://jakarta.ee/xml/ns/persistence/persistence_3_0.xsd",
		namespace: "https://jakarta.ee/xml/ns/persistence",
		dependencies: {
			"hibernate-core": "6.0.0.Final",
			"mysql-connector": "8.2.0",
		},
	},
	"3.1": {
		id: "3.1",
		displayName: "Jakarta Persistence 3.1",
		description: "JPA 3.1 (Jakarta EE 10+) - Uses 3.0 schema",
		minJavaVersion: "17",
		schema: "https://jakarta.ee/xml/ns/persistence/persistence_3_0.xsd",
		namespace: "https://jakarta.ee/xml/ns/persistence",
		dependencies: {
			"hibernate-core": "6.4.0.Final",
			"mysql-connector": "8.2.0",
		},
	},
};

export const HIBERNATE_VERSIONS: Record<string, VersionInfo> = {
	"5.4": {
		id: "5.4",
		displayName: "Hibernate 5.4.x",
		description: "Hibernate ORM 5.4 (Java EE 8)",
		minJavaVersion: "8",
		schema: "http://www.hibernate.org/dtd/hibernate-configuration-3.0.dtd",
		namespace: "hibernate-configuration",
		dependencies: {
			"hibernate-core": "5.4.34.Final",
			"mysql-connector": "8.0.33",
		},
	},
	"6.0": {
		id: "6.0",
		displayName: "Hibernate 6.x",
		description: "Hibernate ORM 6.x (Jakarta EE 9+)",
		minJavaVersion: "17",
		schema: "http://www.hibernate.org/dtd/hibernate-configuration-3.0.dtd",
		namespace: "hibernate-configuration",
		dependencies: {
			"hibernate-core": "6.4.0.Final",
			"mysql-connector": "8.2.0",
		},
	},
};
