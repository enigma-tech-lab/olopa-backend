/**
 * OLOPA Escrow Service
 * Core business logic for XRPL escrow operations with multisig support
 */

const xrpl = require('xrpl');
const { logger } = require('../utils/logger');
const { getXRPLClient } = require('../config/xrpl.config');

class EscrowService {
  constructor() {
    this.client = null;
  }

  /**
   * Initialize XRPL client connection
   */
  async initialize() {
    if (!this.client || !this.client.isConnected()) {
      this.client = await getXRPLClient();
    }
    return this.client;
  }

  /**
   * Create an escrow transaction (EscrowCreate)
   * Locks funds from client to be released to freelancer
   * 
   * @param {Object} params - Escrow parameters
   * @param {string} params.sourceAddress - Client's XRPL address
   * @param {string} params.destinationAddress - Freelancer's XRPL address
   * @param {string} params.amount - Amount in drops (1 XRP = 1,000,000 drops) or issued currency object
   * @param {number} params.finishAfter - Unix timestamp when escrow can be finished
   * @param {number} params.cancelAfter - Optional: Unix timestamp when escrow can be cancelled
   * @param {string} params.condition - Optional: Crypto-condition for release
   * @param {Object} params.memo - Optional: Memo data for the escrow
   * @returns {Object} Prepared transaction ready for signing
   */
  async prepareEscrowCreate(params) {
    try {
      await this.initialize();

      const {
        sourceAddress,
        destinationAddress,
        amount,
        finishAfter,
        cancelAfter,
        condition,
        memo
      } = params;

      // Validate addresses
      if (!xrpl.isValidAddress(sourceAddress)) {
        throw new Error('Invalid source address');
      }
      if (!xrpl.isValidAddress(destinationAddress)) {
        throw new Error('Invalid destination address');
      }

      // Build escrow create transaction
      const escrowTx = {
        TransactionType: 'EscrowCreate',
        Account: sourceAddress,
        Destination: destinationAddress,
        Amount: amount,
      };

      // Add finish time (when escrow can be executed)
      if (finishAfter) {
        escrowTx.FinishAfter = this._toRippleTime(finishAfter);
      }

      // Add cancel time (when escrow can be cancelled)
      if (cancelAfter) {
        escrowTx.CancelAfter = this._toRippleTime(cancelAfter);
      }

      // Add condition if provided (for conditional escrow)
      if (condition) {
        escrowTx.Condition = condition;
      }

      // Add memo if provided
      if (memo) {
        escrowTx.Memos = [{
          Memo: {
            MemoType: this._toHex(memo.type || 'escrow'),
            MemoData: this._toHex(memo.data || '')
          }
        }];
      }

      // Autofill transaction (adds Fee, Sequence, LastLedgerSequence)
      const prepared = await this.client.autofill(escrowTx);

      logger.info('Escrow create transaction prepared', {
        sourceAddress,
        destinationAddress,
        amount
      });

      return {
        success: true,
        transaction: prepared,
        instructions: {
          message: 'Transaction prepared. Sign this transaction with your private key and submit via /api/escrow/submit',
          signingRequired: true
        }
      };

    } catch (error) {
      logger.error('Error preparing escrow create:', error);
      throw error;
    }
  }

  /**
   * Prepare EscrowFinish transaction
   * Releases funds to the freelancer
   * 
   * @param {Object} params - Finish parameters
   * @param {string} params.finisherAddress - Address executing the finish (usually freelancer)
   * @param {string} params.ownerAddress - Original escrow creator (client)
   * @param {number} params.offerSequence - Sequence number of the EscrowCreate transaction
   * @param {string} params.fulfillment - Optional: Crypto-condition fulfillment
   * @returns {Object} Prepared transaction or multisig data
   */
  async prepareEscrowFinish(params) {
    try {
      await this.initialize();

      const {
        finisherAddress,
        ownerAddress,
        offerSequence,
        fulfillment
      } = params;

      // Validate addresses
      if (!xrpl.isValidAddress(finisherAddress)) {
        throw new Error('Invalid finisher address');
      }
      if (!xrpl.isValidAddress(ownerAddress)) {
        throw new Error('Invalid owner address');
      }

      // Build escrow finish transaction
      const finishTx = {
        TransactionType: 'EscrowFinish',
        Account: finisherAddress,
        Owner: ownerAddress,
        OfferSequence: offerSequence
      };

      // Add fulfillment if condition was used
      if (fulfillment) {
        finishTx.Fulfillment = fulfillment;
      }

      // Check if account requires multisig
      const accountInfo = await this.client.request({
        command: 'account_info',
        account: finisherAddress,
        ledger_index: 'validated'
      });

      const signerList = accountInfo.result.account_data.signer_lists;
      const isMultisig = signerList && signerList.length > 0;

      // Autofill transaction
      const prepared = await this.client.autofill(finishTx);

      if (isMultisig) {
        return {
          success: true,
          transaction: prepared,
          requiresMultisig: true,
          signerList: signerList[0],
          instructions: {
            message: 'This account requires multisignature. Collect signatures from required signers and submit via /api/escrow/submit-multisig',
            signingRequired: true,
            multisigRequired: true
          }
        };
      }

      logger.info('Escrow finish transaction prepared', {
        finisherAddress,
        ownerAddress,
        offerSequence
      });

      return {
        success: true,
        transaction: prepared,
        requiresMultisig: false,
        instructions: {
          message: 'Transaction prepared. Sign and submit via /api/escrow/submit',
          signingRequired: true
        }
      };

    } catch (error) {
      logger.error('Error preparing escrow finish:', error);
      throw error;
    }
  }

  /**
   * Prepare EscrowCancel transaction
   * Cancels escrow and returns funds to client
   * 
   * @param {Object} params - Cancel parameters
   * @param {string} params.cancellerAddress - Address executing the cancel
   * @param {string} params.ownerAddress - Original escrow creator
   * @param {number} params.offerSequence - Sequence number of the EscrowCreate transaction
   * @returns {Object} Prepared transaction
   */
  async prepareEscrowCancel(params) {
    try {
      await this.initialize();

      const {
        cancellerAddress,
        ownerAddress,
        offerSequence
      } = params;

      // Validate addresses
      if (!xrpl.isValidAddress(cancellerAddress)) {
        throw new Error('Invalid canceller address');
      }
      if (!xrpl.isValidAddress(ownerAddress)) {
        throw new Error('Invalid owner address');
      }

      // Build escrow cancel transaction
      const cancelTx = {
        TransactionType: 'EscrowCancel',
        Account: cancellerAddress,
        Owner: ownerAddress,
        OfferSequence: offerSequence
      };

      // Autofill transaction
      const prepared = await this.client.autofill(cancelTx);

      logger.info('Escrow cancel transaction prepared', {
        cancellerAddress,
        ownerAddress,
        offerSequence
      });

      return {
        success: true,
        transaction: prepared,
        instructions: {
          message: 'Transaction prepared. Sign and submit via /api/escrow/submit',
          signingRequired: true
        }
      };

    } catch (error) {
      logger.error('Error preparing escrow cancel:', error);
      throw error;
    }
  }

  /**
   * Submit a signed transaction to the XRPL
   * 
   * @param {string} signedTxBlob - Signed transaction blob
   * @returns {Object} Transaction result with hash
   */
  async submitTransaction(signedTxBlob) {
    try {
      await this.initialize();

      const result = await this.client.submit(signedTxBlob);

      logger.info('Transaction submitted', {
        hash: result.result.tx_json.hash,
        resultCode: result.result.engine_result
      });

      return {
        success: result.result.engine_result === 'tesSUCCESS',
        txHash: result.result.tx_json.hash,
        resultCode: result.result.engine_result,
        resultMessage: result.result.engine_result_message,
        validated: result.result.validated || false
      };

    } catch (error) {
      logger.error('Error submitting transaction:', error);
      throw error;
    }
  }

  /**
   * Combine multiple signatures and submit multisig transaction
   * 
   * @param {Object} params - Multisig parameters
   * @param {Object} params.transaction - Prepared transaction object
   * @param {Array} params.signatures - Array of {signer, signature} objects
   * @returns {Object} Transaction result
   */
  async submitMultisigTransaction(params) {
    try {
      await this.initialize();

      const { transaction, signatures } = params;

      // Build signers array for multisig
      const signers = signatures.map(sig => ({
        Signer: {
          Account: sig.signer,
          TxnSignature: sig.signature,
          SigningPubKey: sig.publicKey || ''
        }
      }));

      // Create multisigned transaction
      const multisignedTx = {
        ...transaction,
        Signers: signers,
        SigningPubKey: '' // Must be empty for multisig
      };

      // Encode and submit
      const encoded = xrpl.encode(multisignedTx);
      const result = await this.client.submit(encoded);

      logger.info('Multisig transaction submitted', {
        hash: result.result.tx_json.hash,
        signerCount: signatures.length,
        resultCode: result.result.engine_result
      });

      return {
        success: result.result.engine_result === 'tesSUCCESS',
        txHash: result.result.tx_json.hash,
        resultCode: result.result.engine_result,
        resultMessage: result.result.engine_result_message,
        signerCount: signatures.length,
        signers: signatures.map(s => s.signer),
        validated: result.result.validated || false
      };

    } catch (error) {
      logger.error('Error submitting multisig transaction:', error);
      throw error;
    }
  }

  /**
   * Get escrow status and details
   * 
   * @param {string} ownerAddress - Escrow owner address
   * @param {number} offerSequence - Escrow sequence number
   * @returns {Object} Escrow details
   */
  async getEscrowStatus(ownerAddress, offerSequence) {
    try {
      await this.initialize();

      // Query ledger for escrow object
      const response = await this.client.request({
        command: 'ledger_entry',
        escrow: {
          owner: ownerAddress,
          seq: offerSequence
        },
        ledger_index: 'validated'
      });

      const escrow = response.result.node;

      logger.info('Escrow status retrieved', {
        ownerAddress,
        offerSequence
      });

      return {
        success: true,
        escrow: {
          owner: escrow.Account,
          destination: escrow.Destination,
          amount: escrow.Amount,
          finishAfter: this._fromRippleTime(escrow.FinishAfter),
          cancelAfter: escrow.CancelAfter ? this._fromRippleTime(escrow.CancelAfter) : null,
          condition: escrow.Condition || null,
          sourceTag: escrow.SourceTag || null,
          destinationTag: escrow.DestinationTag || null,
          previousTxnID: escrow.PreviousTxnID
        },
        status: 'active'
      };

    } catch (error) {
      if (error.data && error.data.error === 'entryNotFound') {
        return {
          success: true,
          status: 'not_found',
          message: 'Escrow not found. It may have been finished or cancelled.'
        };
      }
      logger.error('Error getting escrow status:', error);
      throw error;
    }
  }

  /**
   * Get transaction details by hash
   * 
   * @param {string} txHash - Transaction hash
   * @returns {Object} Transaction details
   */
  async getTransactionDetails(txHash) {
    try {
      await this.initialize();

      const response = await this.client.request({
        command: 'tx',
        transaction: txHash,
        binary: false
      });

      return {
        success: true,
        transaction: response.result,
        validated: response.result.validated
      };

    } catch (error) {
      logger.error('Error getting transaction details:', error);
      throw error;
    }
  }

  /**
   * Convert Unix timestamp to Ripple timestamp
   */
  _toRippleTime(unixTimestamp) {
    return unixTimestamp - 946684800; // Ripple epoch is Jan 1, 2000
  }

  /**
   * Convert Ripple timestamp to Unix timestamp
   */
  _fromRippleTime(rippleTime) {
    return rippleTime + 946684800;
  }

  /**
   * Convert string to hex
   */
  _toHex(str) {
    return Buffer.from(str, 'utf8').toString('hex').toUpperCase();
  }

  /**
   * Close XRPL client connection
   */
  async disconnect() {
    if (this.client && this.client.isConnected()) {
      await this.client.disconnect();
      logger.info('XRPL client disconnected');
    }
  }
}

module.exports = new EscrowService();
