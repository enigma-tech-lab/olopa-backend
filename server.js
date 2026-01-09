/**
 * OLOPA Backend - Complete Self-Contained Version
 * No external dependencies on config files
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const xrpl = require('xrpl');
const Joi = require('joi');

const app = express();
const PORT = process.env.PORT || 10000;

// ====================
// CONFIGURATION
// ====================

const XRPL_NETWORKS = {
  testnet: 'wss://s.altnet.rippletest.net:51233',
  mainnet: 'wss://xrplcluster.com',
  devnet: 'wss://s.devnet.rippletest.net:51233'
};

const NETWORK = process.env.XRPL_NETWORK || 'testnet';
const XRPL_SERVER = process.env.XRPL_SERVER_URL || XRPL_NETWORKS[NETWORK];

let xrplClient = null;

// ====================
// XRPL CLIENT MANAGER
// ====================

async function getXRPLClient() {
  if (!xrplClient || !xrplClient.isConnected()) {
    xrplClient = new xrpl.Client(XRPL_SERVER, {
      connectionTimeout: 10000,
      requestTimeout: 5000
    });
    await xrplClient.connect();
    console.log(`Connected to XRPL ${NETWORK}`);
  }
  return xrplClient;
}

// ====================
// VALIDATION SCHEMAS
// ====================

const xrplAddress = Joi.string().pattern(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/).required();

const escrowCreateSchema = Joi.object({
  sourceAddress: xrplAddress,
  destinationAddress: xrplAddress,
  amount: Joi.alternatives().try(
    Joi.string().pattern(/^\d+$/),
    Joi.object({
      currency: Joi.string().length(3).required(),
      value: Joi.string().required(),
      issuer: xrplAddress
    })
  ).required(),
  finishAfter: Joi.number().integer().min(Math.floor(Date.now() / 1000)).required(),
  cancelAfter: Joi.number().integer().min(Joi.ref('finishAfter')).optional(),
  condition: Joi.string().optional(),
  memo: Joi.object({
    type: Joi.string().max(100).optional(),
    data: Joi.string().max(1000).optional()
  }).optional()
});

const escrowFinishSchema = Joi.object({
  finisherAddress: xrplAddress,
  ownerAddress: xrplAddress,
  offerSequence: Joi.number().integer().positive().required(),
  fulfillment: Joi.string().optional()
});

const escrowCancelSchema = Joi.object({
  cancellerAddress: xrplAddress,
  ownerAddress: xrplAddress,
  offerSequence: Joi.number().integer().positive().required()
});

const submitTxSchema = Joi.object({
  signedTxBlob: Joi.string().hex().required()
});

const multisigSubmitSchema = Joi.object({
  transaction: Joi.object().required(),
  signatures: Joi.array().items(
    Joi.object({
      signer: xrplAddress,
      signature: Joi.string().required(),
      publicKey: Joi.string().optional()
    })
  ).min(1).required()
});

// ====================
// MIDDLEWARE
// ====================

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests'
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Validation middleware
const validateRequest = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors,
        timestamp: new Date().toISOString()
      });
    }

    req.body = value;
    next();
  };
};

// ====================
// HELPER FUNCTIONS
// ====================

function toRippleTime(unixTimestamp) {
  return unixTimestamp - 946684800;
}

function fromRippleTime(rippleTime) {
  return rippleTime + 946684800;
}

function toHex(str) {
  return Buffer.from(str, 'utf8').toString('hex').toUpperCase();
}

// ====================
// ROUTES
// ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    network: NETWORK,
    version: '1.0.0'
  });
});

app.get('/', (req, res) => {
  res.json({
    message: 'OLOPA Backend API',
    status: 'running',
    network: NETWORK,
    endpoints: {
      health: '/health',
      createEscrow: 'POST /api/escrow/create',
      finishEscrow: 'POST /api/escrow/finish',
      cancelEscrow: 'POST /api/escrow/cancel',
      submitTx: 'POST /api/escrow/submit',
      submitMultisig: 'POST /api/escrow/submit-multisig',
      getStatus: 'GET /api/escrow/status/:owner/:sequence',
      getTx: 'GET /api/escrow/transaction/:hash'
    }
  });
});

// Create Escrow
app.post('/api/escrow/create', validateRequest(escrowCreateSchema), async (req, res) => {
  try {
    const client = await getXRPLClient();
    const { sourceAddress, destinationAddress, amount, finishAfter, cancelAfter, condition, memo } = req.body;

    const escrowTx = {
      TransactionType: 'EscrowCreate',
      Account: sourceAddress,
      Destination: destinationAddress,
      Amount: amount
    };

    if (finishAfter) escrowTx.FinishAfter = toRippleTime(finishAfter);
    if (cancelAfter) escrowTx.CancelAfter = toRippleTime(cancelAfter);
    if (condition) escrowTx.Condition = condition;
    
    if (memo) {
      escrowTx.Memos = [{
        Memo: {
          MemoType: toHex(memo.type || 'escrow'),
          MemoData: toHex(memo.data || '')
        }
      }];
    }

    const prepared = await client.autofill(escrowTx);

    res.json({
      success: true,
      data: {
        transaction: prepared,
        instructions: {
          message: 'Transaction prepared. Sign and submit via /api/escrow/submit',
          signingRequired: true
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error preparing escrow create:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Finish Escrow
app.post('/api/escrow/finish', validateRequest(escrowFinishSchema), async (req, res) => {
  try {
    const client = await getXRPLClient();
    const { finisherAddress, ownerAddress, offerSequence, fulfillment } = req.body;

    const finishTx = {
      TransactionType: 'EscrowFinish',
      Account: finisherAddress,
      Owner: ownerAddress,
      OfferSequence: offerSequence
    };

    if (fulfillment) finishTx.Fulfillment = fulfillment;

    // Check for multisig
    const accountInfo = await client.request({
      command: 'account_info',
      account: finisherAddress,
      ledger_index: 'validated'
    });

    const signerList = accountInfo.result.account_data.signer_lists;
    const isMultisig = signerList && signerList.length > 0;

    const prepared = await client.autofill(finishTx);

    res.json({
      success: true,
      data: {
        transaction: prepared,
        requiresMultisig: isMultisig,
        ...(isMultisig && { signerList: signerList[0] }),
        instructions: {
          message: isMultisig 
            ? 'Multisig required. Collect signatures and submit via /api/escrow/submit-multisig'
            : 'Sign and submit via /api/escrow/submit',
          signingRequired: true,
          multisigRequired: isMultisig
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error preparing escrow finish:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Cancel Escrow
app.post('/api/escrow/cancel', validateRequest(escrowCancelSchema), async (req, res) => {
  try {
    const client = await getXRPLClient();
    const { cancellerAddress, ownerAddress, offerSequence } = req.body;

    const cancelTx = {
      TransactionType: 'EscrowCancel',
      Account: cancellerAddress,
      Owner: ownerAddress,
      OfferSequence: offerSequence
    };

    const prepared = await client.autofill(cancelTx);

    res.json({
      success: true,
      data: {
        transaction: prepared,
        instructions: {
          message: 'Sign and submit via /api/escrow/submit',
          signingRequired: true
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error preparing escrow cancel:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Submit Transaction
app.post('/api/escrow/submit', validateRequest(submitTxSchema), async (req, res) => {
  try {
    const client = await getXRPLClient();
    const result = await client.submit(req.body.signedTxBlob);

    res.json({
      success: true,
      data: {
        success: result.result.engine_result === 'tesSUCCESS',
        txHash: result.result.tx_json.hash,
        resultCode: result.result.engine_result,
        resultMessage: result.result.engine_result_message,
        validated: result.result.validated || false
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error submitting transaction:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Submit Multisig Transaction
app.post('/api/escrow/submit-multisig', validateRequest(multisigSubmitSchema), async (req, res) => {
  try {
    const client = await getXRPLClient();
    const { transaction, signatures } = req.body;

    const signers = signatures.map(sig => ({
      Signer: {
        Account: sig.signer,
        TxnSignature: sig.signature,
        SigningPubKey: sig.publicKey || ''
      }
    }));

    const multisignedTx = {
      ...transaction,
      Signers: signers,
      SigningPubKey: ''
    };

    const encoded = xrpl.encode(multisignedTx);
    const result = await client.submit(encoded);

    res.json({
      success: true,
      data: {
        success: result.result.engine_result === 'tesSUCCESS',
        txHash: result.result.tx_json.hash,
        resultCode: result.result.engine_result,
        resultMessage: result.result.engine_result_message,
        signerCount: signatures.length,
        signers: signatures.map(s => s.signer),
        validated: result.result.validated || false
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error submitting multisig transaction:', error);
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get Escrow Status
app.get('/api/escrow/status/:ownerAddress/:offerSequence', async (req, res) => {
  try {
    const client = await getXRPLClient();
    const { ownerAddress, offerSequence } = req.params;

    const response = await client.request({
      command: 'ledger_entry',
      escrow: {
        owner: ownerAddress,
        seq: parseInt(offerSequence)
      },
      ledger_index: 'validated'
    });

    const escrow = response.result.node;

    res.json({
      success: true,
      data: {
        escrow: {
          owner: escrow.Account,
          destination: escrow.Destination,
          amount: escrow.Amount,
          finishAfter: fromRippleTime(escrow.FinishAfter),
          cancelAfter: escrow.CancelAfter ? fromRippleTime(escrow.CancelAfter) : null,
          condition: escrow.Condition || null,
          previousTxnID: escrow.PreviousTxnID
        },
        status: 'active'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (error.data && error.data.error === 'entryNotFound') {
      return res.json({
        success: true,
        data: {
          status: 'not_found',
          message: 'Escrow not found. It may have been finished or cancelled.'
        },
        timestamp: new Date().toISOString()
      });
    }
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get Transaction Details
app.get('/api/escrow/transaction/:txHash', async (req, res) => {
  try {
    const client = await getXRPLClient();
    const response = await client.request({
      command: 'tx',
      transaction: req.params.txHash,
      binary: false
    });

    res.json({
      success: true,
      data: {
        transaction: response.result,
        validated: response.result.validated
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ OLOPA Backend started on port ${PORT}`);
  console.log(`📡 Network: ${NETWORK}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (xrplClient) xrplClient.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
