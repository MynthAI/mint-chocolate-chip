import {
  Address,
  Assets,
  createClient,
  Data,
  ScriptHash,
  Transaction,
  TransactionHash,
  TransactionInput,
} from "@evolution-sdk/evolution";
import { Command } from "commander";
import { isProblem } from "ts-handling";
import {
  Address as AddressInput,
  Amount,
  Config,
  logThenExit,
  TxId,
  validate,
} from "./inputs";
import { loadPlutus } from "./script";
import {
  expiresIn,
  loadWallet,
  makeBlockfrostConfig,
  parseNetwork,
} from "./wallet";

const program = new Command()
  .name("burns")
  .description("Burns a token")
  .argument("<address>", "The address of the wallet performing the burn")
  .argument("<reference>", "The reference given during the mint")
  .argument("<amount>", "The amount of token to burn")
  .action(async ($address, $reference, $amount) => {
    const address = validate(AddressInput, $address);
    const reference = validate(TxId, $reference);
    const amount = validate(Amount, $amount);
    const config = validate(Config, process.env);

    const projectId = config.BLOCKFROST_API_KEY;
    const wallet = await loadWallet(projectId, address);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutus = (await loadPlutus()).unwrap();
    if (isProblem(plutus)) return logThenExit(plutus.error);

    const provider = createClient({
      network: parseNetwork(projectId),
      provider: makeBlockfrostConfig(projectId),
    });

    const refScripts = await provider.getUtxosByOutRef([
      new TransactionInput.TransactionInput({
        transactionId: TransactionHash.fromHex(reference),
        index: 0n,
      }),
    ]);
    if (!refScripts.length) return logThenExit("Could not find script");
    const [refScript] = refScripts;
    if (!refScript.scriptRef) return logThenExit("Script not deployed");

    const policy = ScriptHash.toHex(ScriptHash.fromScript(refScript.scriptRef));
    const token = wallet.utxos
      .flatMap((utxo) => Assets.getUnits(utxo.assets))
      .find((asset) => asset.startsWith(policy));
    if (!token) return logThenExit("Token isn't in your wallet");

    const client = createClient({
      network: parseNetwork(projectId),
      provider: makeBlockfrostConfig(projectId),
      wallet: { type: "read-only", address: wallet.address },
    });

    const txResult = await client
      .newTx(wallet.utxos)
      .mintAssets({
        assets: Assets.fromRecord({ [token]: amount * -1n }),
        redeemer: new Data.Constr({ index: 0n, fields: [] }),
      })
      .readFrom({ referenceInputs: [refScript] })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ changeAddress: Address.fromBech32(wallet.address) });

    const tx = await txResult.toTransaction();
    console.log(Transaction.toCBORHex(tx));
  });

program.parseAsync(process.argv);
