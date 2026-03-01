import { password } from "@inquirer/prompts";
import { PlutusV2 } from "@evolution-sdk/evolution/PlutusV2";
import {
  Address,
  Assets,
  createClient,
  Data,
  InlineDatum,
  ScriptHash,
  TransactionHash,
  UPLC,
  UTxO,
} from "@evolution-sdk/evolution";
import { Command } from "commander";
import { chunk } from "es-toolkit/array";
import { isProblem } from "ts-handling";
import { Amount, Config, logThenExit, validate } from "./inputs";
import { loadPlutus } from "./script";
import { hexToBytes } from "./utils";
import {
  expiresIn,
  getNetwork,
  loadWalletFromSeed,
  makeBlockfrostConfig,
  parseNetwork,
} from "./wallet";

const amountPerTx = 220;

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

    const plutus = (await loadPlutus("multiple.mint.mint")).unwrap();
    if (isProblem(plutus)) return logThenExit(plutus.error);

    const network = getNetwork(projectId);
    const changeAddress = Address.fromBech32(wallet.address);

    const client = createClient({
      network: parseNetwork(projectId),
      provider: makeBlockfrostConfig(projectId),
      wallet: { type: "seed", mnemonic: seed },
    });

    const chunks = chunk(Array.from({ length: Number(amount) }), amountPerTx);

    // Setup transaction: create UTxOs (one per chunk) and one for funding deploys
    const setupBuilder = client.newTx();
    setupBuilder.payToAddress({
      address: changeAddress,
      assets: Assets.fromLovelace(200000000n),
    });
    chunks.forEach(() =>
      setupBuilder.payToAddress({
        address: changeAddress,
        assets: Assets.fromLovelace(200000000n),
      })
    );
    const setupResult = await setupBuilder
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ availableUtxos: wallet.utxos, changeAddress });
    const setupChain = setupResult.chainResult();

    const allSetupOutputs = setupChain.available.filter(
      (u) => TransactionHash.toHex(u.transactionId) === setupChain.txHash
    );
    const [setupUtxo, ...refs] = allSetupOutputs;
    const blackholeAddr = createBlackholeAddress(network);
    const script = createScript(plutus, refs[0]);
    const policy = ScriptHash.toHex(ScriptHash.fromScript(script));
    const tokenChunks = chunk(generateTokens(policy, amount), amountPerTx);

    // Deploy transaction: deploy script as reference to blackhole address
    const deployResult = await client
      .newTx()
      .payToAddress({
        address: blackholeAddr,
        assets: Assets.fromLovelace(2000000n),
        datum: new InlineDatum.InlineDatum({
          data: new Data.Constr({ index: 0n, fields: [] }),
        }),
        script,
      })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ availableUtxos: [setupUtxo], changeAddress });
    const deployChain = deployResult.chainResult();

    const deployOutputs = deployChain.available.filter(
      (u) => TransactionHash.toHex(u.transactionId) === deployChain.txHash
    );
    const refScript = deployOutputs.find((u) => u.scriptRef);
    if (!refScript?.scriptRef) return logThenExit("Script didn't deploy");

    // Collect sign builders for all transactions
    const signBuilders = [setupResult, deployResult];

    // Mint transactions: one per chunk
    for (let i = 0; i < tokenChunks.length; i++) {
      const tokens = tokenChunks[i];
      const ref = refs[i];
      const mintBuilder = client
        .newTx()
        .readFrom({ referenceInputs: [refScript] });

      for (const token of tokens)
        mintBuilder.mintAssets({
          assets: Assets.fromRecord({ [token]: 1n }),
          redeemer: new Data.Constr({ index: 0n, fields: [] }),
        });

      const mintResult = await mintBuilder
        .setValidity({ to: BigInt(Date.now() + expiresIn) })
        .build({ availableUtxos: [ref], changeAddress });
      signBuilders.push(mintResult);
    }

    for (const signBuilder of signBuilders) {
      const submitBuilder = await signBuilder.sign();
      const txHash = await submitBuilder.submit();
      console.log(`Submitted ${TransactionHash.toHex(txHash)}`);
    }
  });

const createScript = (plutus: string, ref: UTxO.UTxO): PlutusV2 => {
  const scriptHex = UPLC.applyParamsToScript(plutus, [
    TransactionHash.toBytes(ref.transactionId),
  ]);

  return new PlutusV2({ bytes: hexToBytes(scriptHex) });
};

const createBlackholeAddress = (
  network: "Mainnet" | "Preprod" | "Preview"
): Address.Address => {
  const header = "5839010000322253330033371e9101203";
  const body = Array.from({ length: 63 }, () =>
    Math.floor(Math.random() * 10)
  ).join("");
  const footer = "0048810014984d9595cd01";

  const scriptHex = `${header}${body}${footer}`;
  const script = new PlutusV2({ bytes: hexToBytes(scriptHex) });
  const scriptHash = ScriptHash.fromScript(script);

  return new Address.Address({
    networkId: network === "Mainnet" ? 1 : 0,
    paymentCredential: scriptHash,
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
