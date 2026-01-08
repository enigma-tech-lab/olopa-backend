/**
 * OLOPA XRPL Configuration
 * Manages XRPL client connections for Testnet and Mainnet
 */

const xrpl = require('xrpl');
const { logger } = require('../utils/logger');

// Network configurations
const NETWORKS = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  mainnet: 'wss://xrplcluster.com',
  devnet: 'wss://s.devnet.rippletest.net:51233'
};

/**
 * Get XRPL client based on environment configuration
 * @returns {Promise<xrpl.Client>} Connected XRPL client
 */
async function getXRPLClient() {
  const network = process.env.XRPL_NETWORK || 'testnet';
  const serverUrl = process.env.XRPL_SERVER_URL || NETWORKS[network];

  if (!serverUrl) {
    throw new Error(`Invalid network: ${network}`);
  }

  const client = new xrpl.Client(serverUrl, {
    connectionTimeout: 10000,
    requestTimeout: 5000
  });

  try {
    await client.connect();
    logger.info(`Connected to XRPL ${network}`, { serverUrl });
    
    // Log connection info
    const serverInfo = await client.request({ command: 'server_info' });
    logger.info('XRPL server info', {
      networkId: serverInfo.result.info.network_id,
      ledgerIndex: serverInfo.result.info.validated_ledger.seq,
      serverState: serverInfo.result.info.server_state
    });

    return client;
  } catch (error) {
    logger.error('Failed to connect to XRPL', { error: error.message, serverUrl });
    throw new Error(`XRPL connection failed: ${error.message}`);
  }
}

/**
 * Create a new XRPL wallet (for testing purposes only)
 * WARNING: Never use this in production for real funds
 * @returns {Object} Wallet object with address and seed
 */
async function createTestWallet() {
  const network = process.env.XRPL_NETWORK || 'testnet';
  
  if (network === 'mainnet') {
    throw new Error('Cannot create test wallets on mainnet');
  }

  const client = await getXRPLClient();
  
  try {
    const wallet = xrpl.Wallet.generate();
    
    // Fund wallet on testnet
    await client.fundWallet(wallet);
    
    logger.info('Test wallet created', { address: wallet.address });
    
    await client.disconnect();
    
    return {
      address: wallet.address,
      seed: wallet.seed,
      publicKey: wallet.publicKey,
      privateKey: wallet.privateKey
    };
  } catch (error) {
    logger.error('Failed to create test wallet', error);
    throw error;
  }
}

module.exports = {
  getXRPLClient,
  createTestWallet,
  NETWORKS
};
