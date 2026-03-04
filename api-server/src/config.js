/**
 * Environment-based Configuration
 * PROJECT-CLAW API Server
 */

const path = require('path');

// Environment detection
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isDevelopment = NODE_ENV === 'development';

// Parse CORS origins from environment variable
function parseCorsOrigins() {
  const origins = process.env.CORS_ORIGIN || process.env.CORS_ORIGINS || '';

  if (!origins) {
    // Default origins based on environment
    if (isDevelopment) {
      return [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:80',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000'
      ];
    }
    return ['*']; // Production should explicitly set CORS_ORIGIN
  }

  return origins.split(',').map(o => o.trim()).filter(Boolean);
}

// Database configuration
function getDatabaseConfig() {
  const dbType = process.env.DB_TYPE || 'sqlite';

  if (dbType === 'postgresql' || process.env.DATABASE_URL) {
    return {
      type: 'postgresql',
      url: process.env.DATABASE_URL,
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'project_claw',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: isProduction ? { rejectUnauthorized: false } : false
    };
  }

  return {
    type: 'sqlite',
    path: process.env.DB_PATH || path.join(__dirname, '../data/project-claw.db')
  };
}

// Rate limiting configuration
function getRateLimitConfig() {
  return {
    max: parseInt(process.env.RATE_LIMIT_MAX || '10000'),
    window: process.env.RATE_LIMIT_WINDOW || '1 minute'
  };
}

// Logging configuration
function getLogConfig() {
  const levels = ['debug', 'info', 'warn', 'error'];
  const level = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

  return {
    level: levels.includes(level) ? level : 'info',
    pretty: isDevelopment
  };
}

// Security configuration
function getSecurityConfig() {
  return {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiry: process.env.JWT_EXPIRY || '24h',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '1mb'
  };
}

// Build and export config object
const rateLimitConfig = getRateLimitConfig();
const dbConfig = getDatabaseConfig();
const logConfig = getLogConfig();
const securityConfig = getSecurityConfig();

const config = {
  // Environment
  NODE_ENV,
  isProduction,
  isDevelopment,

  // Server
  PORT: parseInt(process.env.PORT || '3001'),
  HOST: process.env.HOST || '0.0.0.0',

  // CORS
  CORS_ORIGINS: parseCorsOrigins(),

  // Database
  DB_TYPE: dbConfig.type,
  DB_PATH: dbConfig.path,
  DATABASE_URL: dbConfig.url,
  DB_HOST: dbConfig.host,
  DB_PORT: dbConfig.port,
  DB_NAME: dbConfig.database,
  DB_USER: dbConfig.user,
  DB_PASSWORD: dbConfig.password,
  DB_SSL: dbConfig.ssl,

  // Rate Limiting
  RATE_LIMIT_MAX: rateLimitConfig.max,
  RATE_LIMIT_WINDOW: rateLimitConfig.window,

  // Logging
  LOG_LEVEL: logConfig.level,
  LOG_PRETTY: logConfig.pretty,

  // Security
  ...securityConfig,

  // Monitoring (future)
  SENTRY_DSN: process.env.SENTRY_DSN,

  // Feature flags
  features: {
    enableWebSockets: process.env.ENABLE_WEBSOCKETS !== 'false',
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false'
  }
};

// Validate critical configuration
function validateConfig() {
  const errors = [];

  if (isProduction) {
    // In production, ensure CORS is properly configured
    if (config.CORS_ORIGINS.includes('*')) {
      console.warn('⚠️  WARNING: CORS_ORIGIN is set to "*" in production. This is insecure.');
    }

    // Warn if JWT_SECRET is not set
    if (!config.jwtSecret) {
      console.warn('⚠️  WARNING: JWT_SECRET is not set. Authentication features are disabled.');
    }
  }

  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    process.exit(1);
  }
}

// Run validation
validateConfig();

module.exports = config;