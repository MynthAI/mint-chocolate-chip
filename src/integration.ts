import { PlutusV3 } from "@evolution-sdk/evolution/PlutusV3";
import {
  Address,
  Assets,
  createClient,
  ScriptHash,
  Text,
  TransactionHash,
  UPLC,
  UTxO,
} from "@evolution-sdk/evolution";
import { isProblem } from "ts-handling";
import { IntegrationConfig, logThenExit, validate } from "./inputs";
import { loadPlutus } from "./script";
import {
  expiresIn,
  loadWalletFromSeed,
  makeBlockfrostConfig,
  parseNetwork,
} from "./wallet";
import { hexToBytes } from "./utils";

const tokenName = "test";
const tokenAmount = 1n;

const run = async () => {
  const config = validate(IntegrationConfig, process.env);
  const projectId = config.BLOCKFROST_API_KEY;
  const seed = config.SEED_PHRASE;

  const wallet = await loadWalletFromSeed(projectId, seed);
  if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

  const plutus = (await loadPlutus()).unwrap();
  if (isProblem(plutus)) return logThenExit(plutus.error);

  const changeAddress = Address.fromBech32(wallet.address);

  const client = createClient({
    network: parseNetwork(projectId),
    provider: makeBlockfrostConfig(projectId),
    wallet: { type: "seed", mnemonic: seed },
  });

  // Use the first wallet UTxO as the script parameter
  const ref = wallet.utxos[0];

  const script = createScript(plutus, ref);
  const policy = ScriptHash.toHex(ScriptHash.fromScript(script));
  const tokenHex = Text.toHex(tokenName);
  const token = policy + tokenHex;

  // Mint transaction: attach script directly instead of using a reference script
  const mintResult = await client
    .newTx()
    .mintAssets({
      assets: Assets.fromRecord({ [token]: tokenAmount }),
    })
    .attachScript({ script })
    .collectFrom({ inputs: [ref] })
    .setValidity({ to: BigInt(Date.now() + expiresIn) })
    .build({ changeAddress, availableUtxos: wallet.utxos });

  const mintSubmit = await mintResult.sign();
  const mintTxHash = TransactionHash.toHex(await mintSubmit.submit());
  console.log(`Mint tx:   ${mintTxHash}`);
  console.log(`Explorer:  ${explorerUrl(projectId, mintTxHash)}`);

  console.log(`\nPolicy ID: ${policy}`);
  console.log(`Token:     ${tokenName} (${tokenHex})`);
  console.log(`Amount:    ${tokenAmount}`);
  console.log(`Asset:     ${token}`);
};

const explorerUrl = (projectId: string, txHash: string): string => {
  const network = parseNetwork(projectId);
  if (network === "mainnet")
    return `https://cardanoscan.io/transaction/${txHash}`;
  return `https://${network}.cardanoscan.io/transaction/${txHash}`;
};

const createScript = (plutus: string, ref: UTxO.UTxO): PlutusV3 => {
  const scriptHex = UPLC.applySingleCborEncoding(
    UPLC.applyParamsToScript(plutus, [
      TransactionHash.toBytes(ref.transactionId),
      ref.index,
    ])
  );

  return new PlutusV3({ bytes: hexToBytes(scriptHex) });
};

run();
