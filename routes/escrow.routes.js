/**
 * OLOPA Escrow Routes
 */

const express = require('express');
const router = express.Router();
const path = require('path');

// Use absolute paths
const escrowService = require(path.join(__dirname, '..', 'services', 'escrow.service'));
const { validateRequest } = require(path.join(__dirname, '..', 'middleware', 'validation.middleware'));
const { 
  escrowCreateSchema, 
  escrowFinishSchema, 
  escrowCancelSchema, 
  submitTxSchema, 
  multisigSubmitSchema 
} = require(path.join(__dirname, '..', 'validators', 'escrow.validators'));

// Health check for this router
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Escrow routes are working',
    timestamp: new Date().toISOString()
  });
});

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
