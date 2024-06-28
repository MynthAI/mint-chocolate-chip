import { Blockfrost, Wallet } from "@cardano-ts/node";
import { type } from "arktype";
import { Command } from "commander";

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
  });

const logThenExit = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const Config = type({
  BLOCKFROST_API_KEY: "string==39",
});

program.parseAsync(process.argv);
