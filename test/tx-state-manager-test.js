const assert = require('assert')
const TxStateManager = require('../index.js')
const txStateHistoryHelper = require('../lib/tx-state-history-helper')

describe('TransactionStateManager', function () {
  let txStateManager
  const currentNetworkId = 42
  const otherNetworkId = 2
  const from = '0x32d44db61df0b10ccf0164df3d9cbee72e3df02c'
  beforeEach(function () {
    txStateManager = new TxStateManager({
      initState: {
        transactions: [],
      },
      txHistoryLimit: 10,
      getNetwork: () => currentNetworkId,
    })
  })

  describe('#setTxStatusSigned', function () {
    it('sets the tx status to signed', function () {
      const tx = { id: 1, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      txStateManager.addTx(tx)
      txStateManager.setTxStatusSigned(1)
      const result = txStateManager.getTxList()
      assert.ok(Array.isArray(result))
      assert.equal(result.length, 1)
      assert.equal(result[0].status, 'signed')
    })
  })

  describe('#setTxStatusRejected', function () {
     it('sets the tx status to rejected and removes it from history', function () {
      const tx = { id: 1, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      txStateManager.addTx(tx)
      txStateManager.setTxStatusRejected(1)
      const result = txStateManager.getTxList()
      assert.ok(Array.isArray(result))
      assert.equal(result.length, 0)
    })
   it('should remove status observable', function () {
      const tx = { id: 1, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      txStateManager.addTx(tx)
      assert(txStateManager._txStates[1], 'observable should be present')
      txStateManager.setTxStatusRejected(1)
      assert(!txStateManager._txStates[1], 'observable should be removed')
    })
  })

  describe('#getFullTxList', function () {
    it('when new should return empty array', function () {
      const result = txStateManager.getTxList()
      assert.ok(Array.isArray(result))
      assert.equal(result.length, 0)
    })
  })

  describe('#getTxList', function () {
    it('when new should return empty array', function () {
      const result = txStateManager.getTxList()
      assert.ok(Array.isArray(result))
      assert.equal(result.length, 0)
    })
  })

  describe('#subscribe', function () {
    it('should call listener on specific status update', function (done) {
      this.timeout(3000)
      const tx = { id: 1, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      txStateManager.addTx(tx)
      const didApply = txStateManager.subscribe(1, (txId) => {
        assert.equal(txId, 1)
        assert.equal(txStateManager.getTxStatus(1), 'approved')
        done()
      }, 'approved')

      assert(didApply, 'should be true if the listener was successfully applied')

      txStateManager.setTxStatusApproved(1)
    })

    it('should call listener on any status update for any tx', function (done) {
      this.timeout(3000)
      const tx1 = { id: 1, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      const tx2 = { id: 2, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      const tx3 = { id: 3, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      const tx4 = { id: 4, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      const tx5 = { id: 5, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      txStateManager.addTx(tx1)
      txStateManager.addTx(tx2)
      txStateManager.addTx(tx3)
      txStateManager.addTx(tx4)
      txStateManager.addTx(tx5)

      const statusCollection = []
      const didApply = txStateManager.subscribe('*', (txId, status) => {
        statusCollection.push(status)
        if (
          statusCollection[0] === 'unapproved' &&
          statusCollection[1] === 'approved' &&
          statusCollection[2] === 'signed' &&
          statusCollection[3] === 'submitted' &&
          statusCollection[4] === 'confirmed'
          ) done()
      })

      assert(didApply, 'should be true if the listener was successfully applied')
      txStateManager.setTxStatusApproved(1)
      txStateManager.setTxStatusSigned(2)
      txStateManager.setTxStatusSubmitted(3)
      txStateManager.setTxStatusConfirmed(4)
    })


    it('should isolate errors of a listener and still execute other listeners', function (done) {
      this.timeout(3000)
      const tx = { id: 1, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      txStateManager.addTx(tx)
      const didApplyError = txStateManager.subscribe(1, (txId) => {
        throw new Error('test error - ignore')
      }, 'approved')

      const didApply = txStateManager.subscribe(1, (txId) => {
        assert.equal(txId, 1)
        assert.equal(txStateManager.getTxStatus(1), 'approved')
        done()
      }, 'approved')

      assert(didApplyError, 'should be true if the listener was successfully applied')
      assert(didApply, 'should be true if the listener was successfully applied')

      txStateManager.setTxStatusApproved(1)
    })

    it('should isolate errors of a listener and still execute other listeners for any status', function (done) {
      this.timeout(3000)
      const tx = { id: 1, status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      txStateManager.addTx(tx)
      const didApplyError = txStateManager.subscribe(1, (txId) => {
        throw new Error('test error - ignore')
      })
      const statusCollection = []
      const didApply = txStateManager.subscribe(1, (txId, status) => {
        assert.equal(txId, 1)
        statusCollection.push(status)
        if (
          statusCollection[0] === 'unapproved' &&
          statusCollection[1] === 'approved' &&
          statusCollection[2] === 'signed' &&
          statusCollection[3] === 'submitted' &&
          statusCollection[4] === 'confirmed'
          ) done()
      })

      assert(didApplyError, 'should be true if the listener was successfully applied')
      assert(didApply, 'should be true if the listener was successfully applied')

      txStateManager.setTxStatusApproved(1)
      txStateManager.setTxStatusSigned(1)
      txStateManager.setTxStatusSubmitted(1)
      txStateManager.setTxStatusConfirmed(1)
    })
  })

  describe('#addTx', function () {
    it('adds a tx returned in getTxList', function () {
      const tx = { id: 1, status: 'confirmed', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      txStateManager.addTx(tx)
      const result = txStateManager.getTxList()
      assert.ok(Array.isArray(result))
      assert.equal(result.length, 1)
      assert.equal(result[0].id, 1)
    })

    it('does not override txs from other networks', function () {
      const tx = { id: 1, status: 'confirmed', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      const tx2 = { id: 2, status: 'confirmed', metamaskNetworkId: otherNetworkId, txParams: { from, } }
      txStateManager.addTx(tx)
      txStateManager.addTx(tx2)
      const result = txStateManager.getFullTxList()
      const result2 = txStateManager.getTxList()
      assert.equal(result.length, 2, 'txs were deleted')
      assert.equal(result2.length, 1, 'incorrect number of txs on network.')
    })

    it('cuts off early txs beyond a limit', function () {
      const limit = txStateManager.txHistoryLimit
      for (let i = 0; i < limit + 1; i++) {
        const tx = { id: i, time: new Date(), status: 'confirmed', metamaskNetworkId: currentNetworkId, txParams: { from, } }
        txStateManager.addTx(tx)
      }
      const result = txStateManager.getTxList()
      assert.equal(result.length, limit, `limit of ${limit} txs enforced`)
      assert.equal(result[0].id, 1, 'early txs truncted')
    })

    it('cuts off early txs beyond a limit whether or not it is confirmed or rejected', function () {
      const limit = txStateManager.txHistoryLimit
      for (let i = 0; i < limit + 1; i++) {
        const tx = { id: i, time: new Date(), status: 'rejected', metamaskNetworkId: currentNetworkId, txParams: { from, } }
        txStateManager.addTx(tx)
      }
      const result = txStateManager.getTxList()
      assert.equal(result.length, limit, `limit of ${limit} txs enforced`)
      assert.equal(result[0].id, 1, 'early txs truncted')
    })

    it('cuts off early txs beyond a limit but does not cut unapproved txs', function () {
      const unconfirmedTx = { id: 0, time: new Date(), status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } }
      txStateManager.addTx(unconfirmedTx)
      const limit = txStateManager.txHistoryLimit
      for (let i = 1; i < limit + 1; i++) {
        const tx = { id: i, time: new Date(), status: 'confirmed', metamaskNetworkId: currentNetworkId, txParams: { from, } }
        txStateManager.addTx(tx)
      }
      const result = txStateManager.getTxList()
      assert.equal(result.length, limit, `limit of ${limit} txs enforced`)
      assert.equal(result[0].id, 0, 'first tx should still be there')
      assert.equal(result[0].status, 'unapproved', 'first tx should be unapproved')
      assert.equal(result[1].id, 2, 'early txs truncted')
    })
  })

  describe('#updateTx', function () {
    it('replaces the tx with the same id', function () {
      txStateManager.addTx({ id: '1', status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } })
      txStateManager.addTx({ id: '2', status: 'confirmed', metamaskNetworkId: currentNetworkId, txParams: { from, } })
      const txMeta = txStateManager.getTx('1')
      txMeta.hash = 'foo'
      txStateManager.updateTx(txMeta)
      const result = txStateManager.getTx('1')
      assert.equal(result.hash, 'foo')
    })

    it('updates gas price and adds history items', function () {
      const originalGasPrice = '0x01'
      const desiredGasPrice = '0x02'

      const txMeta = {
        id: '1',
        status: 'unapproved',
        metamaskNetworkId: currentNetworkId,
        txParams: {
          gasPrice: originalGasPrice,
          from,
        },
      }

      txStateManager.addTx(txMeta)
      const updatedTx = txStateManager.getTx('1')
      // verify tx was initialized correctly
      assert.equal(updatedTx.history.length, 1, 'one history item (initial)')
      assert.equal(Array.isArray(updatedTx.history[0]), false, 'first history item is initial state')
      assert.deepEqual(updatedTx.history[0], txStateHistoryHelper.snapshotFromTxMeta(updatedTx), 'first history item is initial state')
      // modify value and updateTx
      updatedTx.txParams.gasPrice = desiredGasPrice
      const before = new Date().getTime()
      txStateManager.updateTx(updatedTx)
      const after = new Date().getTime()
      // check updated value
      const result = txStateManager.getTx('1')
      assert.equal(result.txParams.gasPrice, desiredGasPrice, 'gas price updated')
      // validate history was updated
      assert.equal(result.history.length, 2, 'two history items (initial + diff)')
      assert.equal(result.history[1].length, 1, 'two history state items (initial + diff)')

      const expectedEntry = { op: 'replace', path: '/txParams/gasPrice', value: desiredGasPrice }
      assert.deepEqual(result.history[1][0].op, expectedEntry.op, 'two history items (initial + diff) operation')
      assert.deepEqual(result.history[1][0].path, expectedEntry.path, 'two history items (initial + diff) path')
      assert.deepEqual(result.history[1][0].value, expectedEntry.value, 'two history items (initial + diff) value')
      assert.ok(result.history[1][0].timestamp >= before && result.history[1][0].timestamp <= after)
    })
  })

  describe('#getUnapprovedTxList', function () {
    it('returns unapproved txs in a hash', function () {
      txStateManager.addTx({ id: '1', status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } })
      txStateManager.addTx({ id: '2', status: 'confirmed', metamaskNetworkId: currentNetworkId, txParams: { from, } })
      const result = txStateManager.getUnapprovedTxList()
      assert.equal(typeof result, 'object')
      assert.equal(result['1'].status, 'unapproved')
      assert.equal(result['2'], undefined)
    })
  })

  describe('#getTx', function () {
    it('returns a tx with the requested id', function () {
      txStateManager.addTx({ id: '1', status: 'unapproved', metamaskNetworkId: currentNetworkId, txParams: { from, } })
      txStateManager.addTx({ id: '2', status: 'confirmed', metamaskNetworkId: currentNetworkId, txParams: { from, } })
      assert.equal(txStateManager.getTx('1').status, 'unapproved')
      assert.equal(txStateManager.getTx('2').status, 'confirmed')
    })
  })

  describe('#getFilteredTxList', function () {
    it('returns a tx with the requested data', function () {
      const txMetas = [
        { id: 0, status: 'unapproved', txParams: { from: '0xaa', to: '0xbb' }, metamaskNetworkId: currentNetworkId },
        { id: 1, status: 'unapproved', txParams: { from: '0xaa', to: '0xbb' }, metamaskNetworkId: currentNetworkId },
        { id: 2, status: 'unapproved', txParams: { from: '0xaa', to: '0xbb' }, metamaskNetworkId: currentNetworkId },
        { id: 3, status: 'unapproved', txParams: { from: '0xbb', to: '0xaa' }, metamaskNetworkId: currentNetworkId },
        { id: 4, status: 'unapproved', txParams: { from: '0xbb', to: '0xaa' }, metamaskNetworkId: currentNetworkId },
        { id: 5, status: 'confirmed', txParams: { from: '0xaa', to: '0xbb' }, metamaskNetworkId: currentNetworkId },
        { id: 6, status: 'confirmed', txParams: { from: '0xaa', to: '0xbb' }, metamaskNetworkId: currentNetworkId },
        { id: 7, status: 'confirmed', txParams: { from: '0xbb', to: '0xaa' }, metamaskNetworkId: currentNetworkId },
        { id: 8, status: 'confirmed', txParams: { from: '0xbb', to: '0xaa' }, metamaskNetworkId: currentNetworkId },
        { id: 9, status: 'confirmed', txParams: { from: '0xbb', to: '0xaa' }, metamaskNetworkId: currentNetworkId },
      ]
      txMetas.forEach((txMeta) => txStateManager.addTx(txMeta))
      let filterParams

      filterParams = { status: 'unapproved', from: '0xaa' }
      assert.equal(txStateManager.getFilteredTxList(filterParams).length, 3, `getFilteredTxList - ${JSON.stringify(filterParams)}`)
      filterParams = { status: 'unapproved', to: '0xaa' }
      assert.equal(txStateManager.getFilteredTxList(filterParams).length, 2, `getFilteredTxList - ${JSON.stringify(filterParams)}`)
      filterParams = { status: 'confirmed', from: '0xbb' }
      assert.equal(txStateManager.getFilteredTxList(filterParams).length, 3, `getFilteredTxList - ${JSON.stringify(filterParams)}`)
      filterParams = { status: 'confirmed' }
      assert.equal(txStateManager.getFilteredTxList(filterParams).length, 5, `getFilteredTxList - ${JSON.stringify(filterParams)}`)
      filterParams = { from: '0xaa' }
      assert.equal(txStateManager.getFilteredTxList(filterParams).length, 5, `getFilteredTxList - ${JSON.stringify(filterParams)}`)
      filterParams = { to: '0xaa' }
      assert.equal(txStateManager.getFilteredTxList(filterParams).length, 5, `getFilteredTxList - ${JSON.stringify(filterParams)}`)
    })
  })

  describe('#wipeTransactions', function () {

    const specificAddress = '0xaa'
    const otherAddress = '0xbb'

    it('should remove only the transactions from a specific address', function () {

      const txMetas = [
        { id: 0, status: 'unapproved', txParams: { from: specificAddress, to: otherAddress }, metamaskNetworkId: currentNetworkId },
        { id: 1, status: 'confirmed', txParams: { from: otherAddress, to: specificAddress }, metamaskNetworkId: currentNetworkId },
        { id: 2, status: 'confirmed', txParams: { from: otherAddress, to: specificAddress }, metamaskNetworkId: currentNetworkId },
      ]
      txMetas.forEach((txMeta) => txStateManager.addTx(txMeta))

      txStateManager.wipeTransactions(specificAddress)

      const transactionsFromCurrentAddress = txStateManager.getTxList().filter((txMeta) => txMeta.txParams.from === specificAddress)
      const transactionsFromOtherAddresses = txStateManager.getTxList().filter((txMeta) => txMeta.txParams.from !== specificAddress)

      assert.equal(transactionsFromCurrentAddress.length, 0)
      assert.equal(transactionsFromOtherAddresses.length, 2)
    })

    it('should not remove the transactions from other networks', function () {
      const txMetas = [
        { id: 0, status: 'unapproved', txParams: { from: specificAddress, to: otherAddress }, metamaskNetworkId: currentNetworkId },
        { id: 1, status: 'confirmed', txParams: { from: specificAddress, to: otherAddress }, metamaskNetworkId: otherNetworkId },
        { id: 2, status: 'confirmed', txParams: { from: specificAddress, to: otherAddress }, metamaskNetworkId: otherNetworkId },
      ]

      txMetas.forEach((txMeta) => txStateManager.addTx(txMeta))

      txStateManager.wipeTransactions(specificAddress)

      const txsFromCurrentNetworkAndAddress = txStateManager.getTxList().filter((txMeta) => txMeta.txParams.from === specificAddress)
      const txFromOtherNetworks = txStateManager.getFullTxList().filter((txMeta) => txMeta.metamaskNetworkId === otherNetworkId)

      assert.equal(txsFromCurrentNetworkAndAddress.length, 0)
      assert.equal(txFromOtherNetworks.length, 2)

    })
  })

  describe('#_removeTx', function () {
    it('should remove the transaction from the storage', () => {
      txStateManager._saveTxList([ {id: 1} ])
      txStateManager._removeTx(1)
      assert(!txStateManager.getFullTxList().length, 'txList should be empty')
    })

    it('should only remove the transaction with ID 1 from the storage', () => {
      txStateManager._saveTxList([ {id: 1}, {id: 2} ])
      txStateManager._removeTx(1)
      assert.equal(txStateManager.getFullTxList()[0].id, 2, 'txList should have a id of 2')
    })
  })
})
