import { readFileSync } from "fs";
import { password } from "@inquirer/prompts";
import {
  applyParamsToScript,
  Data,
  getAddressDetails,
  MintingPolicy,
  mintingPolicyToId,
  Network,
  TxSignBuilder,
  UTxO,
  validatorToAddress,
} from "@lucid-evolution/lucid";
import { type } from "arktype";
import { Seed } from "cardano-ts";
import { Command } from "commander";
import { chunk } from "es-toolkit/array";
import { isProblem, mayFail, Problem } from "ts-handling";
import { loadLucid } from "wallet";
import { Config, logThenExit, validate } from "./inputs";
import { loadPlutus } from "./script";
import { getNetwork, loadWalletFromSeed } from "./wallet";

const amountPerTx = 220;

const program = new Command()
  .name("distribute")
  .description(
    "Mints and distributes NFTs to a list of addresses. Each NFT will have a unique name."
  )
  .argument(
    "<filename>",
    "The filename containing the list of addresses to send tokens to"
  )
  .action(async ($filename) => {
    const config = validate(Config, process.env);
    const projectId = config.BLOCKFROST_API_KEY;
    const lucid = await loadLucid(projectId);
    const addresses = validate(Addresses(lucid.config().network), $filename);
    const amount = addresses.length;

    const seed = await password({ message: "Enter your seed phrase" });
    if (!seed) return logThenExit("No seed phrase provided");

    const wallet = await loadWalletFromSeed(projectId, seed);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutus = (await loadPlutus("multiple.mint")).unwrap();
    if (plutus instanceof Problem) return logThenExit(plutus.error);

    const network = getNetwork(projectId);
    const txs: TxSignBuilder[] = [];
    lucid.selectWallet.fromAddress(wallet.address, wallet.utxos);
    const key = new Seed(
      seed,
      lucid.config().network === "Mainnet" ? "mainnet" : "testnet"
    ).getPrivateKey();

    const chunks = chunk(Array.from({ length: Number(amount) }), amountPerTx);
    const setup = lucid
      .newTx()
      .pay.ToAddress(wallet.address, { lovelace: 200000000n });
    chunks.forEach(() =>
      setup.pay.ToAddress(wallet.address, { lovelace: 200000000n })
    );
    const [[setupUtxo, ...refs], , setupTx] = await setup.chain();
    lucid.selectWallet.fromAddress(wallet.address, [setupUtxo]);
    txs.push(setupTx);

    const blackhole = createBlackholeAddress(network);
    const script = createScript(plutus, refs[0]);
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
    const [, [refScript], deployTx] = await deploy.chain();
    if (!refScript.scriptRef) return logThenExit("Script didn't deploy");
    txs.push(deployTx);

    for (let i = 0; i < tokenChunks.length; i++) {
      const tokens = tokenChunks[i];
      const ref = refs[i];
      lucid.selectWallet.fromAddress(wallet.address, [ref]);
      const tx = lucid.newTx().readFrom([refScript]);

      for (const token of tokens) tx.mintAssets({ [token]: 1n }, Data.void());

      const [, , mintTx] = await tx.chain();
      txs.push(mintTx);
    }

    for (const tx of txs) {
      const completed = await tx.sign.withPrivateKey(key).complete();
      const submitted = await completed.submit();
      console.log(`Submitted ${submitted}`);
    }
  });

const Addresses = (network: Network) =>
  type("string").pipe((v, ctx) => {
    const networkId = network === "Mainnet" ? 1 : 0;
    const data = mayFail(() => readFileSync(v, "utf8")).unwrap();
    if (isProblem(data)) return ctx.error("valid filename");

    const addresses = data.split(/\r?\n/).filter((line) => line.trim() !== "");

    for (const address of addresses) {
      const details = mayFail(() => getAddressDetails(address)).unwrap();
      const error = (() => {
        if (isProblem(details)) return "valid address";
        if (details.networkId !== networkId) return "correct network";
        if (!details.paymentCredential)
          return "valid address with payment credential";
        if (!details.stakeCredential)
          return "valid address with stake credential";
      })();

      if (error) return ctx.error(`${error}; error with ${address}`);
    }

    if (!addresses.length) return ctx.error("a list of addresses");

    return addresses;
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

const generateTokens = (policy: string, amount: number) =>
  Array.from({ length: amount }).map(
    () =>
      policy +
      [...Array(64)]
        .map(() => Math.floor(Math.random() * 16).toString(16))
        .join("")
  );

program.parseAsync(process.argv);
