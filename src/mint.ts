import { Data, MintingPolicy, mintingPolicyToId } from "@lucid-evolution/lucid";
import { Command } from "commander";
import { Problem } from "ts-handling";
import { loadLucid } from "wallet";
import { Address, Config, logThenExit, validate } from "./inputs";
import { loadPlutus } from "./script";
import { loadWallet } from "./wallet";

const program = new Command()
  .name("mint")
  .description("Mint a new token")
  .argument("<address>", "The address of the wallet performing the mint")
  .action(async ($address) => {
    const address = validate(Address, $address);
    const config = validate(Config, process.env);

    const projectId = config.BLOCKFROST_API_KEY;
    const wallet = await loadWallet(projectId, address);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutus = (await loadPlutus()).unwrap();
    if (plutus instanceof Problem) return logThenExit(plutus.error);

    const lucid = await loadLucid(projectId);
    lucid.selectWallet.fromAddress(wallet.address, wallet.utxos);

    const script: MintingPolicy = {
      type: "PlutusV2",
      script: "51010000322253330034a229309b2b2b9a01",
    };
    const policy = mintingPolicyToId(script);
    const token = policy + "6578616d706c65";

    const tx = lucid
      .newTx()
      .mintAssets({ [token]: 1n }, Data.void())
      .attach.MintingPolicy(script);

    const completed = await (await tx.complete()).complete();
    console.log(completed.toCBOR());
  });

program.parseAsync(process.argv);
