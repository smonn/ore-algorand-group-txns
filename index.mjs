import algosdk from "algosdk";
import { OreId } from "oreid-js";

class Services {
  constructor() {
    this.ore = new OreId({
      appName: "Example App",
      apiKey: process.env.ORE_API_KEY,
      appId: process.env.ORE_APP_ID,
      oreIdUrl: process.env.ORE_URL,
      serviceKey: process.env.ORE_SERVICE_KEY,
    });

    this.algod = new algosdk.Algodv2(
      {
        [process.env.ALGO_HEADER]: process.env.ALGO_TOKEN,
      },
      process.env.ALGO_SERVER,
      process.env.ALGO_PORT
    );
  }

  async waitForConfirmation(txId, timeout = 5) {
    let status = await this.algod.status().do();
    if (status == undefined) throw new Error("Unable to get node status");
    let startRound = status["last-round"] + 1;
    let currentRound = startRound;

    while (currentRound < startRound + timeout) {
      let pendingInfo = await this.algod
        .pendingTransactionInformation(txId)
        .do();
      if (pendingInfo != undefined) {
        if (
          pendingInfo["confirmed-round"] !== null &&
          pendingInfo["confirmed-round"] > 0
        ) {
          return pendingInfo;
        } else {
          if (
            pendingInfo["pool-error"] != null &&
            pendingInfo["pool-error"].length > 0
          ) {
            throw new Error(
              "Transaction Rejected" + " pool error" + pendingInfo["pool-error"]
            );
          }
        }
      }
      await this.algod.statusAfterBlock(currentRound).do();
      currentRound++;
    }

    throw new Error(
      "Pending tx not found in timeout rounds, timeout value = " + timeout
    );
  }
}

function unwrapSignedTransaction(signResponse) {
  const txn = new algosdk.Transaction(
    signResponse.signedTransaction.actions[0]
  );
  return new Uint8Array(
    algosdk.encodeObj({
      txn: txn.get_obj_for_encoding(),
      sig: Buffer.from(signResponse.signedTransaction.signatures[0], "hex"),
    })
  );
}

async function main(fromAccountName, fromPIN, toAccountName, toPIN) {
  const services = new Services();

  const fromAccount = await services.ore.getUser(fromAccountName);
  const toAccount = await services.ore.getUser(toAccountName);

  const fromAddress = fromAccount.permissions[0].chainAccount;
  const toAddress = toAccount.permissions[0].chainAccount;
  const chainNetwork = fromAccount.permissions[0].chainNetwork;

  const assetCreateTxn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject(
    {
      from: fromAddress,
      assetName: "My Asset",
      total: 1,
      decimals: 0,
      defaultFrozen: false,
      assetURL: "",
      clawback: fromAddress,
      freeze: fromAddress,
      manager: fromAddress,
      reserve: fromAddress,
      unitName: "",
      suggestedParams: await services.algod.getTransactionParams().do(),
    }
  );

  const signedAssetCreateTxn = unwrapSignedTransaction(
    await services.ore.custodialSignWithOreId({
      account: fromAccountName,
      chainAccount: fromAddress,
      chainNetwork: chainNetwork,
      broadcast: false,
      returnSignedTransaction: true,
      transaction: assetCreateTxn,
      userPassword: fromPIN,
    })
  );

  const { txId: createAssetTxId } = await services.algod
    .sendRawTransaction(signedAssetCreateTxn)
    .do();

  await services.waitForConfirmation(createAssetTxId);

  const createAssetResult = await services.algod
    .pendingTransactionInformation(createAssetTxId)
    .do();
  const assetIndex = createAssetResult["asset-index"];

  console.log("created asset", assetIndex);

  // So far so good, the next step, not so much. I guess part of this can be solved with ORE Vault?
  // And obviously both of these transactions would either need to be auto-signed or signed individually by each account.
  // Not sure yet how to enable auto-sign though...

  const optInTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    amount: 0,
    assetIndex: assetIndex,
    from: toAddress,
    to: toAddress,
    suggestedParams: await services.algod.getTransactionParams().do(),
  });

  const transferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject(
    {
      amount: 1,
      assetIndex: assetIndex,
      from: fromAddress,
      to: toAddress,
      suggestedParams: await services.algod.getTransactionParams().do(),
    }
  );

  algosdk.assignGroupID([optInTxn, transferTxn]);

  const signedOptInTx = unwrapSignedTransaction(
    await services.ore.custodialSignWithOreId({
      account: toAccountName,
      chainAccount: toAddress,
      chainNetwork: chainNetwork,
      broadcast: false,
      returnSignedTransaction: true,
      transaction: optInTxn,
      userPassword: toPIN,
    })
  );

  const signedTransferTxn = unwrapSignedTransaction(
    await services.ore.custodialSignWithOreId({
      account: fromAccountName,
      chainAccount: fromAddress,
      chainNetwork: chainNetwork,
      broadcast: false,
      returnSignedTransaction: true,
      transaction: transferTxn,
      userPassword: fromPIN,
    })
  );

  const { txId: transferTxId } = await services.algod
    .sendRawTransaction([signedOptInTx, signedTransferTxn])
    .do();

  await services.waitForConfirmation(transferTxId);

  const transferResult = await services.algod
    .pendingTransactionByAddress(transferTxId)
    .do();

  console.log(transferResult);
}

main(process.argv[2], process.argv[3], process.argv[4], process.argv[5]).catch(
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
