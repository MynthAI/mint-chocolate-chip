import { password } from "@inquirer/prompts";
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
import { chunk } from "es-toolkit/array";
import { Problem } from "ts-handling";
import { loadLucid } from "wallet";
import { Amount, Config, logThenExit, validate } from "./inputs";
import { loadPlutus } from "./script";
import { getNetwork, loadWalletFromSeed } from "./wallet";

const amountPerTx = 50;

const program = new Command()
  .name("nft")
  .description("Mints NFTs. Each NFT will have a unique name.")
  .argument("<amount>", "The amount of tokens to mint")
  .action(async ($amount) => {
    const amount = validate(Amount, $amount);
    const config = validate(Config, process.env);

    const seed = await password({ message: "Enter your seed phrase" });
    if (!seed) return logThenExit("No seed phrase provided");

    const projectId = config.BLOCKFROST_API_KEY;
    const wallet = await loadWalletFromSeed(projectId, seed);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutus = (await loadPlutus("multiple.mint")).unwrap();
    if (plutus instanceof Problem) return logThenExit(plutus.error);

    const network = getNetwork(projectId);
    const txs: TxSignBuilder[] = [];
    const lucid = await loadLucid(projectId);
    lucid.selectWallet.fromAddress(wallet.address, wallet.utxos);

    const chunks = chunk(Array.from({ length: Number(amount) }), amountPerTx);
    const setup = lucid.newTx();
    chunks.forEach(() =>
      setup.pay.ToAddress(wallet.address, { lovelace: 2000000n })
    );
    const [[ref, ...setupUtxos], , setupTx] = await setup.chain();
    lucid.selectWallet.fromAddress(wallet.address, setupUtxos);
    txs.push(setupTx);

    const blackhole = createBlackholeAddress(network);
    const script = createScript(plutus, ref);
    const policy = mintingPolicyToId(script);
    const tokenChunks = chunk(generateTokens(policy, amount), amountPerTx);

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

    for (const tokens of tokenChunks) {
      const tx = lucid.newTx().readFrom([refScript]).collectFrom([ref]);

      for (const token of tokens) tx.mintAssets({ [token]: 1n }, Data.void());

      const [, , mintTx] = await tx.chain();
      txs.push(mintTx);
    }

    for (const tx of txs) console.log((await tx.complete()).toCBOR());

    console.log(`\nReference: ${refScript.txHash}`);
  });

const createScript = (plutus: string, ref: UTxO): MintingPolicy => {
  return {
    type: "PlutusV2",
    script: applyParamsToScript(plutus, [ref.txHash]),
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

const generateTokens = (policy: string, amount: bigint) =>
  Array.from({ length: Number(amount) }).map(
    () =>
      policy +
      [...Array(64)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("")
  );

program.parseAsync(process.argv);
