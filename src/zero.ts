import { PlutusV2 } from "@evolution-sdk/evolution/PlutusV2";
import {
  Address,
  Assets,
  createClient,
  Data,
  ScriptHash,
  TransactionHash,
  UPLC,
  UTxO,
} from "@evolution-sdk/evolution";
import { Command } from "commander";
import { isProblem } from "ts-handling";
import {
  Address as AddressInput,
  Config,
  logThenExit,
  TokenName,
  validate,
} from "./inputs";
import { loadPlutus } from "./script";
import {
  expiresIn,
  loadWallet,
  makeBlockfrostConfig,
  parseNetwork,
} from "./wallet";
import { buildAndChain } from "./chain";
import { hexToBytes } from "./utils";

const program = new Command()
  .name("zero")
  .description("Creates a token that doesn't exist")
  .argument("<address>", "The address of the wallet performing the mint")
  .argument("[name]", "The name of the token to mint")
  .action(async ($address, $name) => {
    const address = validate(AddressInput, $address);
    const name = validate(TokenName, $name || "");
    const config = validate(Config, process.env);

    const projectId = config.BLOCKFROST_API_KEY;
    const wallet = await loadWallet(projectId, address);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutus = (await loadPlutus()).unwrap();
    if (isProblem(plutus)) return logThenExit(plutus.error);

    const cborTxs: string[] = [];
    const changeAddress = Address.fromBech32(wallet.address);

    const client = createClient({
      network: parseNetwork(projectId),
      provider: makeBlockfrostConfig(projectId),
      wallet: { type: "read-only", address: wallet.address },
    });

    const ref = wallet.utxos[0];
    const script = createScript(plutus, ref);
    const policy = ScriptHash.toHex(ScriptHash.fromScript(script));
    const token = policy + name;

    // Mint transaction: mint 1 token consuming the ref UTxO
    const mintResult = await client
      .newTx(wallet.utxos)
      .mintAssets({
        assets: Assets.fromRecord({ [token]: 1n }),
        redeemer: new Data.Constr({ index: 0n, fields: [] }),
      })
      .attachScript({ script })
      .collectFrom({ inputs: [ref] })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ changeAddress });

    const mintChain = await buildAndChain(mintResult, wallet.utxos);
    cborTxs.push(mintChain.cbor);

    // Burn transaction: burn the 1 token just minted
    const burnResult = await client
      .newTx(mintChain.available)
      .mintAssets({
        assets: Assets.fromRecord({ [token]: -1n }),
        redeemer: new Data.Constr({ index: 0n, fields: [] }),
      })
      .attachScript({ script })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ changeAddress });

    const burnChain = await buildAndChain(burnResult, mintChain.available);
    cborTxs.push(burnChain.cbor);

    for (const cbor of cborTxs) console.log(cbor);

    console.log(`\nCreated token: ${token}`);
  });

const createScript = (plutus: string, ref: UTxO.UTxO): PlutusV2 => {
  const scriptHex = UPLC.applyParamsToScript(plutus, [
    TransactionHash.toBytes(ref.transactionId),
    ref.index,
  ]);

  return new PlutusV2({ bytes: hexToBytes(scriptHex) });
};

program.parseAsync(process.argv);
