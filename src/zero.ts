import {
  applyParamsToScript,
  Data,
  MintingPolicy,
  mintingPolicyToId,
  TxSignBuilder,
  UTxO,
} from "@lucid-evolution/lucid";
import { Command } from "commander";
import { Problem } from "ts-handling";
import { loadLucid } from "wallet";
import { Address, Config, logThenExit, TokenName, validate } from "./inputs";
import { loadPlutus } from "./script";
import { loadWallet } from "./wallet";

const program = new Command()
  .name("zero")
  .description("Creates a token that doesn't exist")
  .argument("<address>", "The address of the wallet performing the mint")
  .argument("[name]", "The name of the token to mint")
  .action(async ($address, $name) => {
    const address = validate(Address, $address);
    const name = validate(TokenName, $name || "");
    const config = validate(Config, process.env);

    const projectId = config.BLOCKFROST_API_KEY;
    const wallet = await loadWallet(projectId, address);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutus = (await loadPlutus()).unwrap();
    if (plutus instanceof Problem) return logThenExit(plutus.error);

    const txs: TxSignBuilder[] = [];
    const lucid = await loadLucid(projectId);
    lucid.selectWallet.fromAddress(wallet.address, wallet.utxos);

    const ref = wallet.utxos[0];
    const script = createScript(plutus, ref);
    const policy = mintingPolicyToId(script);
    const token = policy + name;

    const [utxos, , mintTx] = await lucid
      .newTx()
      .mintAssets({ [token]: 1n }, Data.void())
      .attach.MintingPolicy(script)
      .collectFrom([ref])
      .chain();
    lucid.overrideUTxOs(utxos);
    txs.push(mintTx);

    const [, , burnTx] = await lucid
      .newTx()
      .mintAssets({ [token]: -1n }, Data.void())
      .attach.MintingPolicy(script)
      .chain();
    txs.push(burnTx);

    for (const tx of txs) console.log((await tx.complete()).toCBOR());

    console.log(`\nCreated token: ${token}`);
  });

const createScript = (plutus: string, ref: UTxO): MintingPolicy => {
  return {
    type: "PlutusV2",
    script: applyParamsToScript(plutus, [ref.txHash, BigInt(ref.outputIndex)]),
  };
};

program.parseAsync(process.argv);
