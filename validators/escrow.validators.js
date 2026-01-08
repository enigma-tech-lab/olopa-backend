/**
 * OLOPA Request Validators
 * Joi schemas for input validation
 */

const Joi = require('joi');

// Custom XRPL address validator
const xrplAddress = Joi.string().pattern(/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/).required();

// Escrow Create validation schema
const escrowCreateSchema = Joi.object({
  sourceAddress: xrplAddress.description('Client XRPL address'),
  destinationAddress: xrplAddress.description('Freelancer XRPL address'),
  amount: Joi.alternatives()
    .try(
      Joi.string().pattern(/^\d+$/).description('Amount in drops (for XRP)'),
      Joi.object({
        currency: Joi.string().length(3).required(),
        value: Joi.string().required(),
        issuer: xrplAddress
      }).description('Issued currency amount')
    )
    .required(),
  finishAfter: Joi.number().integer().min(Math.floor(Date.now() / 1000)).required()
    .description('Unix timestamp when escrow can be finished'),
  cancelAfter: Joi.number().integer().min(Joi.ref('finishAfter')).optional()
    .description('Unix timestamp when escrow can be cancelled'),
  condition: Joi.string().optional()
    .description('Crypto-condition hash'),
  memo: Joi.object({
    type: Joi.string().max(100).optional(),
    data: Joi.string().max(1000).optional()
  }).optional()
});

// Escrow Finish validation schema
const escrowFinishSchema = Joi.object({
  finisherAddress: xrplAddress.description('Address executing the finish'),
  ownerAddress: xrplAddress.description('Original escrow creator address'),
  offerSequence: Joi.number().integer().positive().required()
    .description('Sequence number of EscrowCreate transaction'),
  fulfillment: Joi.string().optional()
    .description('Crypto-condition fulfillment')
});

// Escrow Cancel validation schema
const escrowCancelSchema = Joi.object({
  cancellerAddress: xrplAddress.description('Address executing the cancel'),
  ownerAddress: xrplAddress.description('Original escrow creator address'),
  offerSequence: Joi.number().integer().positive().required()
    .description('Sequence number of EscrowCreate transaction')
});

// Submit Transaction validation schema
const submitTxSchema = Joi.object({
  signedTxBlob: Joi.string().hex().required()
    .description('Hex-encoded signed transaction blob')
});

// Multisig Submit validation schema
const multisigSubmitSchema = Joi.object({
  transaction: Joi.object().required()
    .description('Prepared transaction object'),
  signatures: Joi.array().items(
    Joi.object({
      signer: xrplAddress,
      signature: Joi.string().required(),
      publicKey: Joi.string().optional()
    })
  ).min(1).required()
    .description('Array of signatures from signers')
});

module.exports = {
  escrowCreateSchema,
  escrowFinishSchema,
  escrowCancelSchema,
  submitTxSchema,
  multisigSubmitSchema
};
