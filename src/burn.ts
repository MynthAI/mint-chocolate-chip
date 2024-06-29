import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Blockfrost as CardanoBlockfrost, Wallet } from "@cardano-ts/node";
import {
  Blockfrost,
  Data,
  Lucid,
  mintingPolicyToId,
  Network,
} from "@lucid-evolution/lucid";
import { type, Type } from "arktype";
import { Command } from "commander";

const here = dirname(fileURLToPath(import.meta.url));
const expiresIn = 600000; // About 10 minutes

const program = new Command()
  .name("burns")
  .description("Burns a token")
  .argument("<address>", "The address of the wallet performing the burn")
  .argument("<reference>", "The reference given during the mint")
  .argument("<amount>", "The amount of token to burn")
  .action(async ($address, $reference, $amount) => {
    const address = validate(type("string"), $address);
    const reference = validate(TxId, $reference);
    const amount = validate(Amount, $amount);
    const config = validate(Config, process.env);

    const projectId = config.BLOCKFROST_API_KEY;
    const blockfrost = new CardanoBlockfrost(projectId);
    const wallet = await Wallet.fromAddress(blockfrost, address);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutusPath = join(here, "..", "plutus.json");
    const plutus = Plutus(JSON.parse(await fs.readFile(plutusPath, "utf8")));
    if (plutus instanceof type.errors) return logThenExit(plutus.summary);

    const lucid = await Lucid(
      new Blockfrost(
        `https://cardano-${blockfrost.network}.blockfrost.io/api/v0`,
        projectId
      ),
      convertNetwork(blockfrost)
    );
    lucid.selectWallet.fromAddress(wallet.address, wallet.utxos);

    const refScripts = await lucid.utxosByOutRef([
      { txHash: reference, outputIndex: 0 },
    ]);
    if (!refScripts.length) return logThenExit("Could not find script");
    const [refScript] = refScripts;
    if (!refScript.scriptRef) return logThenExit("Script not deployed");

    const policy = mintingPolicyToId(refScript.scriptRef);
    const token = wallet.utxos
      .flatMap((utxo) => Object.keys(utxo.assets))
      .find((asset) => asset.startsWith(policy));
    if (!token) return logThenExit("Token isn't in your wallet");

    const tx = lucid
      .newTx()
      .validTo(Date.now() + expiresIn)
      .mintAssets({ [token]: amount * -1n }, Data.void())
      .readFrom([refScript]);

    const completed = await (await tx.complete()).complete();
    console.log(completed.toCBOR());
  });

const validate = <T, U>(validator: Type<T, U>, data: unknown) => {
  const result = validator(data);
  if (result instanceof type.errors) return logThenExit(result.summary);
  return result;
};

const logThenExit = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const TxId = type("string==64")
  .pipe((s) => s.toLowerCase())
  .narrow((s, ctx) => /^[0-9A-Fa-f]+$/g.test(s) || ctx.mustBe("tx ID"));

const Amount = type("string")
  .pipe((s, ctx) => {
    try {
      return BigInt(s);
    } catch {
      return ctx.error("valid non-decimal number");
    }
  })
  .narrow((v) => v > 0n);

const Config = type({
  BLOCKFROST_API_KEY: "string==39",
});

const Plutus = type({
  validators: [
    {
      compiledCode: "string",
    },
  ],
}).pipe((v) => v.validators[0].compiledCode);

const convertNetwork = (blockfrost: CardanoBlockfrost) => {
  const network = blockfrost.network;
  type CardanoNetwork = typeof network;
  const networks: Record<CardanoNetwork, Network> = {
    mainnet: "Mainnet",
    preprod: "Preprod",
    preview: "Preview",
  };
  return networks[network];
};

program.parseAsync(process.argv);
