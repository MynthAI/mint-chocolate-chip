import { PlutusV3 } from "@evolution-sdk/evolution/PlutusV3";
import { calculateMinimumUtxoLovelace } from "@evolution-sdk/evolution/sdk/builders/TxBuilderImpl";
import {
  Address,
  Assets,
  createClient,
  Effect,
  ScriptHash,
  TransactionHash,
} from "@evolution-sdk/evolution";
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
import { createScript, loadPlutus } from "./script";
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
    const { coinsPerUtxoByte } = await client.getProtocolParameters();
    // The Babbage/Conway min UTxO formula is: coinsPerUtxoByte * (160 + |output|).
    // The SDK's calculateMinimumUtxoLovelace omits the 160-byte UTxO entry overhead,
    // so we pass coinsPerUtxoByte: 1n to get the raw CBOR byte count and apply the
    // formula ourselves. We also use a 1 ADA placeholder instead of Assets.zero so
    // that the lovelace field uses the same 5-byte CBOR encoding as the final value
    // (any lovelace >= 65536 encodes as 5 bytes; 0 encodes as 1 byte).
    const cborSize = await Effect.runPromise(
      calculateMinimumUtxoLovelace({
        address: blackholeAddr,
        assets: Assets.fromLovelace(1_000_000n),
        scriptRef: script,
        coinsPerUtxoByte: 1n,
      })
    );
    const minLovelace = (cborSize + 160n) * coinsPerUtxoByte;
    const deployResult = await client
      .newTx()
      .payToAddress({
        address: blackholeAddr,
        assets: Assets.fromLovelace(minLovelace),
        script,
      })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ changeAddress, availableUtxos: deployUtxos });

    const deployChain = await buildAndChain(deployResult, setupUtxos);
    const refScript = deployChain.outputs.find((u) => u.scriptRef);
    if (!refScript?.scriptRef) return logThenExit("Script didn't deploy");
    cborTxs.push(deployChain.cbor);

    // Mint transaction: mint token using the deployed reference script.
    // Pass deployChain.available as availableUtxos so coin selection only uses
    // off-chain UTxOs; this prevents on-chain UTxOs from being included in the
    // additionalUtxoSet passed to the evaluator, which would cause an
    // OverlappingAdditionalUtxo error.
    const mintResult = await client
      .newTx()
      .mintAssets({
        assets: Assets.fromRecord({ [token]: amount }),
      })
      .readFrom({ referenceInputs: [refScript] })
      .collectFrom({ inputs: [ref] })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({
        changeAddress,
        availableUtxos: deployChain.available,
        passAdditionalUtxos: true,
      });

    const mintChain = await buildAndChain(mintResult, deployChain.available);
    cborTxs.push(mintChain.cbor);

    for (const cbor of cborTxs) console.log(cbor);

    console.log(
      `\nReference: ${TransactionHash.toHex(refScript.transactionId)}`
    );
  });

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
