import { PlutusV3 } from "@evolution-sdk/evolution/PlutusV3";
import {
  Address,
  Assets,
  createClient,
  Data,
  Effect,
  InlineDatum,
  ScriptHash,
  Transaction,
  TransactionHash,
  UPLC,
  UTxO,
} from "@evolution-sdk/evolution";
import { EvaluationError } from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder";
import { Command } from "commander";
import { isProblem } from "ts-handling";
import {
  Address as AddressInput,
  Amount,
  Config,
  logThenExit,
  TokenName,
  validate,
} from "./inputs";
import { loadPlutus } from "./script";
import {
  expiresIn,
  getNetwork,
  loadWallet,
  makeBlockfrostConfig,
  parseNetwork,
} from "./wallet";
import { buildAndChain } from "./chain";
import { hexToBytes } from "./utils";

const program = new Command()
  .name("mint")
  .description("Mint a new token")
  .argument("<address>", "The address of the wallet performing the mint")
  .argument("<name>", "The name of the token to mint")
  .argument("<amount>", "The amount of token to mint")
  .action(async ($address, $name, $amount) => {
    const address = validate(AddressInput, $address);
    const name = validate(TokenName, $name);
    const amount = validate(Amount, $amount);
    const config = validate(Config, process.env);

    const projectId = config.BLOCKFROST_API_KEY;
    const wallet = await loadWallet(projectId, address);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutus = (await loadPlutus()).unwrap();
    if (isProblem(plutus)) return logThenExit(plutus.error);

    const network = getNetwork(projectId);
    const cborTxs: string[] = [];
    const changeAddress = Address.fromBech32(wallet.address);

    const client = createClient({
      network: parseNetwork(projectId),
      provider: makeBlockfrostConfig(projectId),
      wallet: { type: "read-only", address: wallet.address },
    });

    // Setup transaction: pay 2 ADA to self to create a unique UTxO as script parameter
    const setupResult = await client
      .newTx()
      .payToAddress({
        address: changeAddress,
        assets: Assets.fromLovelace(2000000n),
      })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ changeAddress, availableUtxos: wallet.utxos });

    const setupChain = await buildAndChain(setupResult, wallet.utxos);
    cborTxs.push(setupChain.cbor);

    // The first new output is the UTxO used to parameterize the script
    const ref = setupChain.outputs[0];
    const setupUtxos = setupChain.available;

    const blackholeAddr = createBlackholeAddress(network);
    const script = createScript(plutus, ref);
    const policy = ScriptHash.toHex(ScriptHash.fromScript(script));
    const token = policy + name;

    // Deploy transaction: deploy script as reference to blackhole address.
    // Exclude ref from available UTxOs to ensure it is not consumed by this tx
    // (ref must remain available for the mint transaction).
    const deployUtxos = setupUtxos.filter(
      (u) =>
        TransactionHash.toHex(u.transactionId) !==
          TransactionHash.toHex(ref.transactionId) || u.index !== ref.index
    );
    const deployResult = await client
      .newTx()
      .payToAddress({
        address: blackholeAddr,
        assets: Assets.fromLovelace(2000000n),
        datum: new InlineDatum.InlineDatum({
          data: new Data.Constr({ index: 0n, fields: [] }),
        }),
        script,
      })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ changeAddress, availableUtxos: deployUtxos });

    const deployChain = await buildAndChain(deployResult, setupUtxos);
    const refScript = deployChain.outputs.find((u) => u.scriptRef);
    if (!refScript?.scriptRef) return logThenExit("Script didn't deploy");
    cborTxs.push(deployChain.cbor);

    // Custom evaluator: calls Blockfrost but only passes off-chain UTxOs.
    // provider-based evaluation (Blockfrost) receives all additional UTxOs by
    // default, which includes on-chain wallet UTxOs still in deployChain.available
    // and triggers an OverlappingAdditionalUtxo error. By filtering to only the
    // UTxOs not present in wallet.utxos we avoid that error while still giving
    // Blockfrost the off-chain inputs it needs to evaluate the script.
    const evaluator = {
      evaluate: (
        tx: Transaction.Transaction,
        additionalUtxos: ReadonlyArray<UTxO.UTxO> | undefined,
        _context: unknown
      ) =>
        Effect.tryPromise({
          try: () => {
            const offChainUtxos = (additionalUtxos ?? []).filter(
              (u) =>
                !wallet.utxos.some(
                  (w) =>
                    TransactionHash.toHex(w.transactionId) ===
                      TransactionHash.toHex(u.transactionId) &&
                    w.index === u.index
                )
            );
            return client.evaluateTx(tx, offChainUtxos as UTxO.UTxO[]);
          },
          catch: (error) =>
            new EvaluationError({ message: String(error), cause: error }),
        }),
    };

    // Mint transaction: mint token using the deployed reference script.
    const mintResult = await client
      .newTx()
      .mintAssets({
        assets: Assets.fromRecord({ [token]: amount }),
        redeemer: new Data.Constr({ index: 0n, fields: [] }),
      })
      .readFrom({ referenceInputs: [refScript] })
      .collectFrom({ inputs: [ref] })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({
        changeAddress,
        availableUtxos: deployChain.available,
        evaluator,
      });

    const mintChain = await buildAndChain(mintResult, deployChain.available);
    cborTxs.push(mintChain.cbor);

    for (const cbor of cborTxs) console.log(cbor);

    console.log(
      `\nReference: ${TransactionHash.toHex(refScript.transactionId)}`
    );
  });

const createScript = (plutus: string, ref: UTxO.UTxO): PlutusV3 => {
  const scriptHex = UPLC.applyParamsToScript(plutus, [
    TransactionHash.toBytes(ref.transactionId),
    ref.index,
  ]);

  return new PlutusV3({ bytes: hexToBytes(scriptHex) });
};

const createBlackholeAddress = (
  network: "Mainnet" | "Preprod" | "Preview"
): Address.Address => {
  const header = "5839010000322253330033371e9101203";
  const body = Array.from({ length: 63 }, () =>
    Math.floor(Math.random() * 10)
  ).join("");
  const footer = "0048810014984d9595cd01";

  const scriptHex = `${header}${body}${footer}`;
  const script = new PlutusV3({ bytes: hexToBytes(scriptHex) });
  const scriptHash = ScriptHash.fromScript(script);
  return new Address.Address({
    networkId: network === "Mainnet" ? 1 : 0,
    paymentCredential: scriptHash,
  });
};

program.parseAsync(process.argv);
