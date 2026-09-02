// Diccionario de tecnologías/skills conocidas. Se usa para extraer qué skills
// aparecen en el CV, y luego comparar esas mismas skills contra cada oferta.
// Agrega aquí cualquier tecnología tuya que no aparezca en la lista.
export const TECH_KEYWORDS: string[] = [
  // Lenguajes
  'javascript', 'typescript', 'java', 'python', 'php', 'c#', 'c++', 'go', 'golang',
  'ruby', 'kotlin', 'swift', 'rust', 'scala', 'dart',

  // Frontend
  'react', 'react native', 'angular', 'vue', 'nextjs', 'next.js', 'nuxt',
  'svelte', 'html', 'css', 'sass', 'tailwind', 'redux', 'jquery',

  // Backend / frameworks
  'node', 'nodejs', 'node.js', 'express', 'nestjs', 'nest.js', 'spring', 'spring boot',
  'django', 'flask', 'fastapi', 'laravel', 'symfony', '.net', 'asp.net', 'rails',

  // Bases de datos
  'sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'sqlite',
  'oracle', 'dynamodb', 'firebase', 'firestore', 'elasticsearch', 'cassandra',

  // Cloud / DevOps
  'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s',
  'terraform', 'jenkins', 'ci/cd', 'github actions', 'gitlab ci', 'nginx',
  'linux', 'bash', 'serverless', 'lambda',

  // APIs / arquitectura
  'rest', 'restful', 'graphql', 'grpc', 'microservices', 'microservicios',
  'websocket', 'soap', 'api',

  // Testing
  'jest', 'mocha', 'cypress', 'selenium', 'testing', 'tdd', 'junit',

  // Otros / metodologías
  'git', 'agile', 'scrum', 'kanban', 'figma', 'jira',
  'fullstack', 'full stack', 'backend', 'frontend', 'devops', 'qa',
];
