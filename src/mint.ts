import {
  applyParamsToScript,
  Data,
  MintingPolicy,
  mintingPolicyToId,
  Network,
  TxSignBuilder,
  UTxO,
  validatorToAddress,
} from "@lucid-evolution/lucid";
import { Command } from "commander";
import { Problem } from "ts-handling";
import { loadLucid } from "wallet";
import {
  Address,
  Amount,
  Config,
  logThenExit,
  TokenName,
  validate,
} from "./inputs";
import { loadPlutus } from "./script";
import { getNetwork, loadWallet } from "./wallet";

const program = new Command()
  .name("mint")
  .description("Mint a new token")
  .argument("<address>", "The address of the wallet performing the mint")
  .argument("<name>", "The name of the token to mint")
  .argument("<amount>", "The amount of token to mint")
  .action(async ($address, $name, $amount) => {
    const address = validate(Address, $address);
    const name = validate(TokenName, $name);
    const amount = validate(Amount, $amount);
    const config = validate(Config, process.env);

    const projectId = config.BLOCKFROST_API_KEY;
    const wallet = await loadWallet(projectId, address);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutus = (await loadPlutus()).unwrap();
    if (plutus instanceof Problem) return logThenExit(plutus.error);

    const network = getNetwork(projectId);
    const txs: TxSignBuilder[] = [];
    const lucid = await loadLucid(projectId);
    lucid.selectWallet.fromAddress(wallet.address, wallet.utxos);

    const setup = lucid
      .newTx()
      .pay.ToAddress(wallet.address, { lovelace: 2000000n });
    const [[ref, ...setupUtxos], , setupTx] = await setup.chain();
    lucid.selectWallet.fromAddress(wallet.address, setupUtxos);
    txs.push(setupTx);

    const blackhole = createBlackholeAddress(network);
    const script = createScript(plutus, ref);
    const policy = mintingPolicyToId(script);
    const token = policy + name;
    const deploy = lucid
      .newTx()
      .pay.ToContract(
        blackhole,
        { kind: "inline", value: Data.void() },
        undefined,
        script
      );
    const [deployUtxos, [refScript], deployTx] = await deploy.chain();
    if (!refScript.scriptRef) return logThenExit("Script didn't deploy");
    lucid.selectWallet.fromAddress(wallet.address, deployUtxos);
    txs.push(deployTx);

    const tx = lucid
      .newTx()
      .mintAssets({ [token]: amount }, Data.void())
      .readFrom([refScript])
      .collectFrom([ref]);
    const [, , mintTx] = await tx.chain();
    txs.push(mintTx);

    for (const tx of txs) console.log((await tx.complete()).toCBOR());

    console.log(`\nReference: ${refScript.txHash}`);
  });

const createScript = (plutus: string, ref: UTxO): MintingPolicy => {
  return {
    type: "PlutusV2",
    script: applyParamsToScript(plutus, [ref.txHash, BigInt(ref.outputIndex)]),
  };
};

const createBlackholeAddress = (network: Network) => {
  const header = "5839010000322253330033371e9101203";
  const body = Array.from({ length: 63 }, () =>
    Math.floor(Math.random() * 10)
  ).join("");
  const footer = "0048810014984d9595cd01";

  return validatorToAddress(network, {
    type: "PlutusV2",
    script: `${header}${body}${footer}`,
  });
};

program.parseAsync(process.argv);
