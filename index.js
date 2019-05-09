const extend = require('xtend')
const clone = require('clone')
const EventEmitter = require('safe-event-emitter')
const ObservableStore = require('obs-store')
const o = require('observable')
const ethUtil = require('ethereumjs-util')
const log = require('loglevel')
const txStateHistoryHelper = require('./lib/tx-state-history-helper')
const createId = require('./lib/random-id')
const { getFinalStates, validateTxParams } = require('./lib/util')
const STATUS_DEFAULTS = [
  'unapproved',
  'approved',
  'signed',
  'submitted',
  'confirmed',
  'dropped',
]
const TEST_ENV = process.env.TEST_ENV
/**
  TransactionStateManager is responsible for the state of a transaction and
  storing the transaction
  it also has some convenience methods for finding subsets of transactions
  and a `subscribe` method to subscribe
  *
  * DEFAULT STATUS METHODS
  <br>statuses:
  <br>   - `'unapproved'` the user has not responded
  <br>   - `'rejected'` the user has responded no!
  <br>   - `'approved'` the user has approved the tx
  <br>   - `'signed'` the tx is signed
  <br>   - `'submitted'` the tx is sent to a server
  <br>   - `'confirmed'` the tx has been included in a block.
  <br>   - `'failed'` the tx failed for some reason, included on tx data.
  <br>   - `'dropped'` the tx nonce was already used
  @param opts {object}
  @param {object} [opts.initState={ transactions: [] }] initial transactions list with the key transaction {array}
  @param {number} [opts.txHistoryLimit] limit for how many finished
  transactions can hang around in state
  @param {function} opts.getNetwork return network number
  @class
*/
class TransactionStateManager {
  constructor ({ initState, txHistoryLimit, getNetwork, customStatusList = STATUS_DEFAULTS }) {
    if (customStatusList) {
      customStatusList.forEach((status) => {
        const cStatus = status.charAt(0).toUpperCase() + status.slice(1)
        this[`setTxStatus${cStatus}`] = (txId) => this._setTxStatus(txId, status)
      })
    }
    this.store = new ObservableStore(
      extend({
        transactions: [],
    }, initState))
    const txList = this.getFullTxList()
    this._txStates = {}
    if (txList.length) {
      txLst.forEach((tx) => {
        this._txStates[tx.id] = o(tx.status)
      })
    }
    this._txStates['*'] = o({})
    this.txHistoryLimit = txHistoryLimit
    this.getNetwork = getNetwork
  }

  /**
    @param opts {object} - the object to use when overwriting defaults
    @returns {txMeta} the default txMeta object
  */
  generateTxMeta (opts) {
    const netId = this.getNetwork()
    if (netId === 'loading') throw new Error('MetaMask is having trouble connecting to the network')
    return extend({
      id: createId(),
      time: (new Date()).getTime(),
      status: 'unapproved',
      metamaskNetworkId: netId,
      loadingDefaults: true,
    }, opts)
  }

  /**
    @returns {array} of txMetas that have been filtered for only the current network
  */
  getTxList () {
    const network = this.getNetwork()
    const fullTxList = this.getFullTxList()
    return fullTxList.filter((txMeta) => txMeta.metamaskNetworkId === network)
  }

  /**
    @returns {array} of all the txMetas in store
  */
  getFullTxList () {
    return this.store.getState().transactions
  }

  /**
    @returns {array} the tx list whos status is unapproved
  */
  getUnapprovedTxList () {
    const txList = this.getTxsByMetaData('status', 'unapproved')
    return txList.reduce((result, tx) => {
      result[tx.id] = tx
      return result
    }, {})
  }

  /**
    @param [address] {string} - hex prefixed address to sort the txMetas for [optional]
    @returns {array} the tx list whos status is approved if no address is provide
    returns all txMetas who's status is approved for the current network
  */
  getApprovedTransactions (address) {
    const opts = { status: 'approved' }
    if (address) opts.from = address
    return this.getFilteredTxList(opts)
  }

  /**
    @param [address] {string} - hex prefixed address to sort the txMetas for [optional]
    @returns {array} the tx list whos status is submitted if no address is provide
    returns all txMetas who's status is submitted for the current network
  */
  getPendingTransactions (address) {
    const opts = { status: 'submitted' }
    if (address) opts.from = address
    return this.getFilteredTxList(opts)
  }

  /**
    @param [address] {string} - hex prefixed address to sort the txMetas for [optional]
    @returns {array} the tx list whos status is confirmed if no address is provide
    returns all txMetas who's status is confirmed for the current network
  */
  getConfirmedTransactions (address) {
    const opts = { status: 'confirmed' }
    if (address) opts.from = address
    return this.getFilteredTxList(opts)
  }

  /**
    Adds the txMeta to the list of transactions in the store.
    if the list is over txHistoryLimit it will remove a transaction that
    is in its final state
    it will allso add the key `history` to the txMeta with the snap shot of the original
    object
    @param txMeta {Object}
    @returns {object} the txMeta
  */
  addTx (tx) {
    const txMeta = clone(tx)
    // initialize history
    txMeta.history = []
    // capture initial snapshot of txMeta for history
    const snapshot = txStateHistoryHelper.snapshotFromTxMeta(txMeta)
    txMeta.history.push(snapshot)

    const transactions = this.getFullTxList()
    const txCount = transactions.length
    const txHistoryLimit = this.txHistoryLimit

    // checks if the length of the tx history is
    // longer then desired persistence limit
    // and then if it is removes only confirmed
    // or rejected tx's.
    // not tx's that are pending or unapproved
    if (txCount > txHistoryLimit - 1) {
      const index = transactions.findIndex((metaTx) => {
        return getFinalStates().includes(metaTx.status)
      })
      if (index !== -1) {
        transactions.splice(index, 1)
      }
    }
    transactions.push(txMeta)
    this._txStates[txMeta.id] = o(txMeta.status)
    this._txStates['*']({txId: txMeta.id, status: txMeta.status})
    this._saveTxList(transactions)
    return txMeta
  }
  /**
    @param txId {number}
    @returns {object} the txMeta who matches the given id if none found
    for the network returns undefined
  */
  getTx (txId) {
    const txMeta = this.getTxsByMetaData('id', txId)[0]
    return clone(txMeta)
  }

  /**
    updates the txMeta in the list and adds a history entry
    @param txMeta {Object} - the txMeta to update
    @param [note] {string} - a note about the update for history
  */
  updateTx (txMeta, note) {
    // validate txParams
    if (txMeta.txParams) {
      if (typeof txMeta.txParams.data === 'undefined') {
        delete txMeta.txParams.data
      }

      validateTxParams(txMeta.txParams)
    }

    // create txMeta snapshot for history
    const currentState = txStateHistoryHelper.snapshotFromTxMeta(txMeta)
    // recover previous tx state obj
    const previousState = txStateHistoryHelper.replayHistory(txMeta.history)
    // generate history entry and add to history
    const entry = txStateHistoryHelper.generateHistoryEntry(previousState, currentState, note)
    txMeta.history.push(entry)

    // commit txMeta to state
    const txId = txMeta.id
    const txList = this.getFullTxList()
    const index = txList.findIndex(txData => txData.id === txId)
    const previousStatus = this.getTxStatus(txId)
    const newStatus = txMeta.status
    txList[index] = txMeta

    this._saveTxList(txList)
    if (previousStatus !== newStatus) {
      this._txStates[txId](newStatus)
      this._txStates['*']({txId: txMeta.id, status: txMeta.status})
    }
  }


  /**
    merges txParams obj onto txMeta.txParams
    use extend to ensure that all fields are filled
    @param txId {number} - the id of the txMeta
    @param txParams {object} - the updated txParams
  */
  updateTxParams (txId, txParams) {
    const txMeta = this.getTx(txId)
    txMeta.txParams = extend(txMeta.txParams, txParams)
    this.updateTx(txMeta, `txStateManager#updateTxParams`)
  }

/**
  @param opts {object} -  an object of fields to search for eg:<br>
  let <code>thingsToLookFor = {<br>
    to: '0x0..',<br>
    from: '0x0..',<br>
    status: 'signed',<br>
    err: undefined,<br>
  }<br></code>
  @param [initialList=this.getTxList()]
  @returns a {array} of txMeta with all
  options matching
  */
  /*
  ****************HINT****************
  | `err: undefined` is like looking |
  | for a tx with no err             |
  | so you can also search txs that  |
  | dont have something as well by   |
  | setting the value as undefined   |
  ************************************

  this is for things like filtering a the tx list
  for only tx's from 1 account
  or for filltering for all txs from one account
  and that have been 'confirmed'
  */
  getFilteredTxList (opts, initialList) {
    let filteredTxList = initialList
    Object.keys(opts).forEach((key) => {
      filteredTxList = this.getTxsByMetaData(key, opts[key], filteredTxList)
    })
    return filteredTxList
  }
  /**

    @param key {string} - the key to check
    @param value - the value your looking for
    @param [txList=this.getTxList()] {array} - the list to search. default is the txList
    from txStateManager#getTxList
    @returns {array} a list of txMetas who matches the search params
  */
  getTxsByMetaData (key, value, txList = this.getTxList()) {
    return txList.filter((txMeta) => {
      if (key in txMeta.txParams) {
        return txMeta.txParams[key] === value
      } else {
        return txMeta[key] === value
      }
    })
  }
  /**
    subscribe to status changes of a particular tx
    @param txId {number} - the txMeta Id
    @param listener {function} - the listener
    @param status {string} - the desired status for the listener to be triggered. if undefined applies to all status changes and will be immediately triggered
    @return {boolean} weather the listener was applied. Returns false if tx does not exist
  */

  subscribe (txId, listener, status) {
    if (!this._txStates[txId]) return false

    if (!this._txStates[txId][status]) this._txStates[txId][status] = []

    //all status updates
    if (txId === '*') {
      this._txStates[txId]((newStatusObj) => {
        try {
          if(!newStatusObj.txId || !newStatusObj.status) return
          listener(newStatusObj.txId, newStatusObj.status)
        } catch (e) {
          // ignore expected test errors so console is free of clutter
          if (TEST_ENV && e.message === 'test error - ignore') return
          log.error(e)
        }
      })
    } else if (status) {
      this._txStates[txId]((newStatus) => {
        try {

          if (newStatus === status) listener(txId)
        } catch (e) {
          // ignore expected test errors so console is free of clutter
          if (TEST_ENV && e.message === 'test error - ignore') return
          log.error(e)
        }
      })
    } else {
      this._txStates[txId]((newStatus) => {
        try {
          listener(txId, newStatus)
        } catch (e) {
          // ignore expected test errors so console is free of clutter
          if (TEST_ENV && e.message === 'test error - ignore') return
          log.error(e)
        }
      })
    }

    return true
  }

  // get::set status

  /**
    @param txId {number} - the txMeta Id
    @return {string} the status of the tx.
  */
  getTxStatus (txId) {
    const txMeta = this.getTx(txId)
    return txMeta.status
  }

  /**
    should update the status of the tx to 'rejected'.
    @param txId {number} - the txMeta Id
  */
  setTxStatusRejected (txId) {
    this._setTxStatus(txId, 'rejected')
    this._removeTx(txId)
  }

  /**
    should update the status of the tx to 'failed'.
    and put the error on the txMeta
    @param txId {number} - the txMeta Id
    @param err {erroObject} - error object
  */
  setTxStatusFailed (txId, err) {
    const error = !err ? new Error('Internal metamask failure') : err

    const txMeta = this.getTx(txId)
    txMeta.err = {
      message: error.toString(),
      rpc: error.value,
      stack: error.stack,
    }
    this.updateTx(txMeta, 'transactions:tx-state-manager#fail - add error')
    this._setTxStatus(txId, 'failed')
  }

  /**
    Removes transaction from the given address for the current network
    from the txList
    @param address {string} - hex string of the from address on the txParams to remove
  */
  wipeTransactions (address) {
    // network only tx
    const txs = this.getFullTxList()
    const network = this.getNetwork()

    // Filter out the ones from the current account and network
    const otherAccountTxs = txs.filter((txMeta) => !(txMeta.txParams.from === address && txMeta.metamaskNetworkId === network))

    // Update state
    this._saveTxList(otherAccountTxs)
  }
//
//           PRIVATE METHODS
//

  // STATUS METHODS
  // statuses:
  //    - `'unapproved'` the user has not responded
  //    - `'rejected'` the user has responded no!
  //    - `'approved'` the user has approved the tx
  //    - `'signed'` the tx is signed
  //    - `'submitted'` the tx is sent to a server
  //    - `'confirmed'` the tx has been included in a block.
  //    - `'failed'` the tx failed for some reason, included on tx data.
  //    - `'dropped'` the tx nonce was already used

  /**
    @param txId {number} - the txMeta Id
    @param status {string} - the status to set on the txMeta
    @emits tx:status-update - passes txId and status
    @emits ${txMeta.id}:finished - if it is a finished state. Passes the txMeta
    @emits update:badge
  */
  _setTxStatus (txId, status) {
    const txMeta = this.getTx(txId)
    if (!txMeta) {
      return
    }

    txMeta.status = status
    this.updateTx(txMeta, `txStateManager: setting status to ${status}`)
  }

  /**
    Saves the new/updated txList.
    @param transactions {array} - the list of transactions to save
  */
  // Function is intended only for internal use
  _saveTxList (transactions) {
    this.store.updateState({ transactions })
  }

  _removeTx (txId) {
    delete this._txStates[txId]
    const transactionList = this.getFullTxList()
    this._saveTxList(transactionList.filter((txMeta) => txMeta.id !== txId))
  }
}

module.exports = TransactionStateManager
