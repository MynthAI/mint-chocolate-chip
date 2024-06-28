import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { Blockfrost, Wallet } from "@cardano-ts/node";
import { applyParamsToScript } from "@lucid-evolution/lucid";
import { type } from "arktype";
import { Command } from "commander";

const here = dirname(fileURLToPath(import.meta.url));

const program = new Command()
  .name("mint")
  .description("Mint a new token")
  .argument("<address>", "The address of the wallet performing the mint")
  .action(async (address) => {
    const config = Config(process.env);
    if (config instanceof type.errors) return logThenExit(config.summary);

    const wallet = await Wallet.fromAddress(
      new Blockfrost(config.BLOCKFROST_API_KEY),
      address
    );

    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutusPath = join(here, "..", "plutus.json");
    const plutus = Plutus(JSON.parse(await fs.readFile(plutusPath, "utf8")));
    if (plutus instanceof type.errors) return logThenExit(plutus.summary);

    const ref = wallet.utxos[0];
    const script = applyParamsToScript(plutus, [
      ref.txHash,
      BigInt(ref.outputIndex),
    ]);
  });

const logThenExit = (message: string): never => {
  console.error(message);
  process.exit(1);
};

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

program.parseAsync(process.argv);
