/**
 * OLOPA Escrow Routes
 * REST API endpoints for escrow operations
 */

const express = require('express');
const router = express.Router();
const escrowService = require('../services/escrow.service');
const { validateRequest } = require('../middleware/validation.middleware');
const { escrowCreateSchema, escrowFinishSchema, escrowCancelSchema, submitTxSchema, multisigSubmitSchema } = require('../validators/escrow.validators');

/**
 * POST /api/escrow/create
 * Prepare an escrow creation transaction
 * 
 * Body:
 * - sourceAddress: string (client's XRPL address)
 * - destinationAddress: string (freelancer's XRPL address)
 * - amount: string (amount in drops or issued currency)
 * - finishAfter: number (Unix timestamp)
 * - cancelAfter: number (optional, Unix timestamp)
 * - condition: string (optional, crypto-condition)
 * - memo: object (optional, {type, data})
 */
router.post('/create', validateRequest(escrowCreateSchema), async (req, res) => {
  try {
    const result = await escrowService.prepareEscrowCreate(req.body);
    
    res.json({
      success: true,
      data: result,
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

/**
 * POST /api/escrow/finish
 * Prepare an escrow finish transaction (with multisig detection)
 * 
 * Body:
 * - finisherAddress: string (address executing finish)
 * - ownerAddress: string (original escrow creator)
 * - offerSequence: number (sequence of EscrowCreate tx)
 * - fulfillment: string (optional, crypto-condition fulfillment)
 */
router.post('/finish', validateRequest(escrowFinishSchema), async (req, res) => {
  try {
    const result = await escrowService.prepareEscrowFinish(req.body);
    
    res.json({
      success: true,
      data: result,
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

/**
 * POST /api/escrow/cancel
 * Prepare an escrow cancel transaction
 * 
 * Body:
 * - cancellerAddress: string (address executing cancel)
 * - ownerAddress: string (original escrow creator)
 * - offerSequence: number (sequence of EscrowCreate tx)
 */
router.post('/cancel', validateRequest(escrowCancelSchema), async (req, res) => {
  try {
    const result = await escrowService.prepareEscrowCancel(req.body);
    
    res.json({
      success: true,
      data: result,
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

/**
 * POST /api/escrow/submit
 * Submit a signed transaction to XRPL
 * 
 * Body:
 * - signedTxBlob: string (hex-encoded signed transaction)
 */
router.post('/submit', validateRequest(submitTxSchema), async (req, res) => {
  try {
    const result = await escrowService.submitTransaction(req.body.signedTxBlob);
    
    res.json({
      success: true,
      data: result,
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

/**
 * POST /api/escrow/submit-multisig
 * Submit a multisigned transaction to XRPL
 * 
 * Body:
 * - transaction: object (prepared transaction)
 * - signatures: array of {signer, signature, publicKey} objects
 */
router.post('/submit-multisig', validateRequest(multisigSubmitSchema), async (req, res) => {
  try {
    const result = await escrowService.submitMultisigTransaction(req.body);
    
    res.json({
      success: true,
      data: result,
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

/**
 * GET /api/escrow/status/:ownerAddress/:offerSequence
 * Get escrow status and details
 * 
 * Params:
 * - ownerAddress: XRPL address of escrow creator
 * - offerSequence: Sequence number of EscrowCreate transaction
 */
router.get('/status/:ownerAddress/:offerSequence', async (req, res) => {
  try {
    const { ownerAddress, offerSequence } = req.params;
    const result = await escrowService.getEscrowStatus(
      ownerAddress,
      parseInt(offerSequence)
    );
    
    res.json({
      success: true,
      data: result,
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

/**
 * GET /api/escrow/transaction/:txHash
 * Get transaction details by hash
 * 
 * Params:
 * - txHash: Transaction hash
 */
router.get('/transaction/:txHash', async (req, res) => {
  try {
    const { txHash } = req.params;
    const result = await escrowService.getTransactionDetails(txHash);
    
    res.json({
      success: true,
      data: result,
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

module.exports = router;
