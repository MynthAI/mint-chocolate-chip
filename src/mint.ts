import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Blockfrost as CardanoBlockfrost, Wallet } from "@cardano-ts/node";
import {
  applyParamsToScript,
  Blockfrost,
  Data,
  fromText,
  Lucid,
  mintingPolicyToId,
  Network,
} from "@lucid-evolution/lucid";
import { type, Type } from "arktype";
import { Command } from "commander";

const here = dirname(fileURLToPath(import.meta.url));
const expiresIn = 600000; // About 10 minutes

const program = new Command()
  .name("mint")
  .description("Mint a new token")
  .argument("<address>", "The address of the wallet performing the mint")
  .argument("<name>", "The name of the token to mint")
  .argument("<amount>", "The amount of token to mint")
  .action(async ($address, $name, $amount) => {
    const address = validate(type("string"), $address);
    const name = validate(TokenName, $name);
    const amount = validate(Amount, $amount);
    const config = validate(Config, process.env);

    const projectId = config.BLOCKFROST_API_KEY;
    const blockfrost = new CardanoBlockfrost(projectId);
    const wallet = await Wallet.fromAddress(blockfrost, address);

    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutusPath = join(here, "..", "plutus.json");
    const plutus = Plutus(JSON.parse(await fs.readFile(plutusPath, "utf8")));
    if (plutus instanceof type.errors) return logThenExit(plutus.summary);

    const ref = wallet.utxos[0];
    const script = {
      type: "PlutusV2",
      script: applyParamsToScript(plutus, [
        ref.txHash,
        BigInt(ref.outputIndex),
      ]),
    } as const;

    const lucid = await Lucid(
      new Blockfrost(
        `https://cardano-${blockfrost.network}.blockfrost.io/api/v0`,
        projectId
      ),
      convertNetwork(blockfrost)
    );
    lucid.selectWallet.fromAddress(wallet.address, wallet.utxos);

    const policy = mintingPolicyToId(script);
    const token = policy + name;
    const tx = lucid
      .newTx()
      .validTo(Date.now() + expiresIn)
      .mintAssets({ [token]: amount }, Data.void())
      .attach.MintingPolicy(script);

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

const TokenName = type("string<=20").pipe((s) => fromText(s));

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
