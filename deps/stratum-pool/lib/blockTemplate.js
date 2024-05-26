var merkleTree = require('./merkleTree.js');
var transactions = require('./transactions.js');
var util = require('./util.js');

// The BlockTemplate class holds a single job and provides several methods to validate and submit it to the daemon coin
var BlockTemplate = module.exports = function BlockTemplate(jobId, rpcData, poolAddressScript, extraNoncePlaceholder, reward, txMessages, recipients) {
// Private members
	var submits = [];
	function getMerkleHashes(steps) {
		return steps.map(function(step) {return step.toString('hex');});
	}
	function getTransactionBuffers(txs) {
		var txHashes = txs.map(function(tx) {
			if (tx.txid !== undefined)
				return util.uint256BufferFromHash(tx.txid);
			return util.uint256BufferFromHash(tx.hash);
		});
		return [null].concat(txHashes);
	}

// Public members
	this.rpcData = rpcData;
	this.jobId = jobId;
	this.prevHashReversed = util.reverseByteOrder(Buffer.from(rpcData.previousblockhash, 'hex')).toString('hex');
	this.transactionData = Buffer.concat(rpcData.transactions.map(function(tx) {
		return Buffer.from(tx.data, 'hex');
	}));
	this.merkleTree = new merkleTree(getTransactionBuffers(rpcData.transactions));
	this.merkleBranch = getMerkleHashes(this.merkleTree.steps);
	this.generationTransaction = transactions.CreateGeneration(rpcData, poolAddressScript, extraNoncePlaceholder, reward, txMessages, recipients);
	this.serializeCoinbase = function(extraNonce1, extraNonce2) {
		return Buffer.concat([this.generationTransaction[0], extraNonce1, extraNonce2, this.generationTransaction[1]]);
	};
	this.serializeHeader = function(merkleRoot, nTime, nOffset) {
		var header =  Buffer.alloc(112);
		var position = 0;
		header.write(nOffset, position, 32, 'hex');
		header.write(rpcData.bits, position += 32, 4, 'hex');
		header.write(nTime, position += 4, 8, 'hex');
		header.write(merkleRoot, position += 8, 32, 'hex');
		header.write(rpcData.previousblockhash, position += 32, 32, 'hex');
		header.writeUInt32BE(rpcData.version, position + 32);
		var header = util.reverseBuffer(header);
		return header;
	};
	this.serializeBlock = function(header, coinbase) {
		return Buffer.concat([header, util.varIntBuffer(this.rpcData.transactions.length + 1), coinbase, this.transactionData]);
	};
	this.registerSubmit = function(extraNonce1, extraNonce2, nTime, nonce) {
		var submission = extraNonce1 + extraNonce2 + nTime + nonce;
		if (submits.indexOf(submission) === -1){
			submits.push(submission);
			return true;
		}
		return false;
	};
	this.getJobParams = function() {
		if (!this.jobParams){
			this.jobParams = [
				this.jobId,
				this.prevHashReversed,
				this.generationTransaction[0].toString('hex'),
				this.generationTransaction[1].toString('hex'),
				this.merkleBranch,
				util.packInt32BE(this.rpcData.version).toString('hex'),
				this.rpcData.bits,
				util.packUInt32BE(this.rpcData.curtime).toString('hex'),
				true,
				this.rpcData.powversion,
				this.rpcData.patterns
			];
		}
		return this.jobParams;
	};
};