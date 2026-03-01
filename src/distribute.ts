import { readFileSync } from "fs";
import { password } from "@inquirer/prompts";
import { PlutusV2 } from "@evolution-sdk/evolution/PlutusV2";
import {
  Address,
  Assets,
  createClient,
  Data,
  InlineDatum,
  KeyHash,
  ScriptHash,
  TransactionHash,
  TransactionMetadatum,
  UPLC,
  UTxO,
} from "@evolution-sdk/evolution";
import { type } from "arktype";
import { Command } from "commander";
import { chunk } from "es-toolkit/array";
import { isProblem, mayFail } from "ts-handling";
import { Config, logThenExit, Options, validate } from "./inputs";
import { loadPlutus } from "./script";
import { hexToBytes } from "./utils";
import {
  expiresIn,
  getNetwork,
  loadWalletFromSeed,
  makeBlockfrostConfig,
  parseNetwork,
} from "./wallet";

const amountPerTx = 45;

const program = new Command()
  .name("distribute")
  .description(
    "Mints and distributes NFTs to a list of addresses. Each NFT will have a unique name."
  )
  .argument(
    "<filename>",
    "The filename containing the list of addresses to send tokens to"
  )
  .option(
    "-m, --metadata <key-values...>",
    "Additional metadata to attach to the token, in the format of `name:value`"
  )
  .action(async ($filename, $options: object) => {
    const config = validate(Config, process.env);
    const projectId = config.BLOCKFROST_API_KEY;
    const network = getNetwork(projectId);
    const addresses = validate(Addresses(network), $filename);
    const amount = addresses.length;
    const options = validate(Options, $options);

    const seed = await password({ message: "Enter your seed phrase" });
    if (!seed) return logThenExit("No seed phrase provided");

    const wallet = await loadWalletFromSeed(projectId, seed);
    if (!wallet.utxos.length) return logThenExit("Wallet must be funded");

    const plutus = (await loadPlutus("multiple.mint")).unwrap();
    if (isProblem(plutus)) return logThenExit(plutus.error);

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
    const addressChunks = chunk(addresses, amountPerTx);

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
      const addrs = addressChunks[i];
      const ref = refs[i];
      const mintBuilder = client
        .newTx()
        .readFrom({ referenceInputs: [refScript] });

      if (options.metadata) {
        const metadata = options.metadata;
        const policyMetadata: TransactionMetadatum.TransactionMetadatum =
          new Map(
            tokens.map(
              (
                token
              ): [
                TransactionMetadatum.TransactionMetadatum,
                TransactionMetadatum.TransactionMetadatum,
              ] => [token.substring(56), objectToMetadatum(metadata)]
            )
          );
        mintBuilder.attachMetadata({
          label: 721n,
          metadata: new Map<
            TransactionMetadatum.TransactionMetadatum,
            TransactionMetadatum.TransactionMetadatum
          >([[policy, policyMetadata]]),
        });
      }

      for (const [j, token] of tokens.entries()) {
        mintBuilder.mintAssets({
          assets: Assets.fromRecord({ [token]: 1n }),
          redeemer: new Data.Constr({ index: 0n, fields: [] }),
        });
        mintBuilder.payToAddress({
          address: Address.fromBech32(addrs[j]),
          assets: Assets.fromRecord({ [token]: 1n }),
        });
      }

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

const Addresses = (network: "Mainnet" | "Preprod" | "Preview") =>
  type("string").pipe((v, ctx) => {
    const networkId = network === "Mainnet" ? 1 : 0;
    const data = mayFail(() => readFileSync(v, "utf8")).unwrap();
    if (isProblem(data)) return ctx.error("valid filename");

    const lines = data.split(/\r?\n/).filter((line) => line.trim() !== "");
    const stakeKeys: Record<string, string> = {};

    for (const line of lines) {
      const error = (() => {
        let addr: Address.Address;

        try {
          addr = Address.fromBech32(line);
        } catch {
          return `valid address; error with ${line}`;
        }

        if (Address.getNetworkId(addr) !== networkId)
          return `correct network; error with ${line}`;
        if (!addr.paymentCredential)
          return `valid address with payment credential; error with ${line}`;
        if (!addr.stakingCredential)
          return `valid address with stake credential; error with ${line}`;

        const key =
          addr.stakingCredential._tag === "ScriptHash"
            ? ScriptHash.toHex(addr.stakingCredential)
            : KeyHash.toHex(addr.stakingCredential);
        if (key in stakeKeys) console.error("duplicate:", line, stakeKeys[key]);
        stakeKeys[key] = line;
      })();

      if (error) return ctx.error(error);
    }

    if (!lines.length) return ctx.error("a list of addresses");

    return lines;
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

const objectToMetadatum = (
  obj: unknown
): TransactionMetadatum.TransactionMetadatum => {
  if (typeof obj === "string") return obj;
  if (typeof obj === "bigint") return obj;
  if (obj instanceof Uint8Array) return obj;
  if (Array.isArray(obj)) return obj.map(objectToMetadatum);

  if (obj && typeof obj === "object") {
    const map = new Map<
      TransactionMetadatum.TransactionMetadatum,
      TransactionMetadatum.TransactionMetadatum
    >();
    for (const [k, v] of Object.entries(obj)) map.set(k, objectToMetadatum(v));
    return map;
  }

  throw new Error(`Unsupported metadata type: ${typeof obj}`);
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
