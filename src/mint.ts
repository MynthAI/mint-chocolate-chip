import { PlutusV2 } from "@evolution-sdk/evolution/PlutusV2";
import {
  Address,
  Assets,
  createClient,
  Data,
  InlineDatum,
  ScriptHash,
  TransactionHash,
  UPLC,
  UTxO,
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
      .newTx(wallet.utxos)
      .payToAddress({
        address: changeAddress,
        assets: Assets.fromLovelace(2000000n),
      })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ changeAddress });

    const setupChain = await buildAndChain(setupResult, wallet.utxos);
    cborTxs.push(setupChain.cbor);

    // The first new output is the UTxO used to parameterize the script
    const ref = setupChain.outputs[0];
    const setupUtxos = setupChain.available;

    const blackholeAddr = createBlackholeAddress(network);
    const script = createScript(plutus, ref);
    const policy = ScriptHash.toHex(ScriptHash.fromScript(script));
    const token = policy + name;

    // Deploy transaction: deploy script as reference to blackhole address
    const deployResult = await client
      .newTx(setupUtxos)
      .payToAddress({
        address: blackholeAddr,
        assets: Assets.fromLovelace(2000000n),
        datum: new InlineDatum.InlineDatum({
          data: new Data.Constr({ index: 0n, fields: [] }),
        }),
        script,
      })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ changeAddress });

    const deployChain = await buildAndChain(deployResult, setupUtxos);
    const refScript = deployChain.outputs.find((u) => u.scriptRef);
    if (!refScript?.scriptRef) return logThenExit("Script didn't deploy");
    cborTxs.push(deployChain.cbor);

    // Mint transaction: mint token using the deployed reference script
    const mintResult = await client
      .newTx(deployChain.available)
      .mintAssets({
        assets: Assets.fromRecord({ [token]: amount }),
        redeemer: new Data.Constr({ index: 0n, fields: [] }),
      })
      .readFrom({ referenceInputs: [refScript] })
      .collectFrom({ inputs: [ref] })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ changeAddress });

    const mintChain = await buildAndChain(mintResult, deployChain.available);
    cborTxs.push(mintChain.cbor);

    for (const cbor of cborTxs) console.log(cbor);

    console.log(
      `\nReference: ${TransactionHash.toHex(refScript.transactionId)}`
    );
  });

const createScript = (plutus: string, ref: UTxO.UTxO): PlutusV2 => {
  const scriptHex = UPLC.applyParamsToScript(plutus, [
    TransactionHash.toBytes(ref.transactionId),
    ref.index,
  ]);

  return new PlutusV2({ bytes: hexToBytes(scriptHex) });
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
  const script = new PlutusV2({ bytes: hexToBytes(scriptHex) });
  const scriptHash = ScriptHash.fromScript(script);
  return new Address.Address({
    networkId: network === "Mainnet" ? 1 : 0,
    paymentCredential: scriptHash,
  });
};

program.parseAsync(process.argv);
