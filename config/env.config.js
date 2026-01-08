/**
 * OLOPA Environment Configuration
 * Validates required environment variables
 */

const { logger } = require('../utils/logger');

/**
 * Validate that all required environment variables are present
 * @throws {Error} If required variables are missing
 */
function validateEnvVars() {
  const required = [];
  const optional = [
    'PORT',
    'NODE_ENV',
    'XRPL_NETWORK',
    'XRPL_SERVER_URL',
    'ALLOWED_ORIGINS',
    'LOG_LEVEL'
  ];

  const missing = required.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Log configuration (without sensitive data)
  logger.info('Environment configuration loaded', {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3000,
    xrplNetwork: process.env.XRPL_NETWORK || 'testnet',
    logLevel: process.env.LOG_LEVEL || 'info'
  });
}

module.exports = { validateEnvVars };
