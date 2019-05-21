# transaction-state-manager

Metamask txMeta status/state management

`npm i tx-state-manager`

```js
const TxStateManager = require('tx-state-manager')
const txStateManager = new TxStateManager({
  initState: {
    transactions: [],
  },
  txHistoryLimit: 40,
  getNetwork: () => currentNetworkId,
})
const tx = txStateManager.generateTxMeta(extraCustomKeys)
txStateManager.addTx(tx)
txStateManager.subscribe(tx.id)
txStateManager.setTxStatusApproved(tx.id)
```

[api docs!](./docs/index.md)