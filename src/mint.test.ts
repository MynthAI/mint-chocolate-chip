import {
  Assets,
  createClient,
  ScriptHash,
  SigningClient,
  Text,
  Transaction,
  UTxO,
} from "@evolution-sdk/evolution";
import type { Evaluator } from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder";
import { beforeAll, describe, expect, it } from "vitest";
import { IntegrationConfig, validate } from "./inputs";
import { createScript, loadPlutus } from "./script";
import {
  expiresIn,
  loadWalletFromSeed,
  makeBlockfrostConfig,
  parseNetwork,
} from "./wallet";

const tokenName = Text.toHex("test");
const tokenAmount = 1n;

const hasCredentials =
  !!process.env.BLOCKFROST_API_KEY && !!process.env.SEED_PHRASE;

describe.skipIf(!hasCredentials)("mint transaction", () => {
  let token: string;
  let client: SigningClient;
  let ref: UTxO.UTxO;

  beforeAll(async () => {
    const config = validate(IntegrationConfig, process.env);
    const projectId = config.BLOCKFROST_API_KEY;
    const seed = config.SEED_PHRASE;

    const wallet = await loadWalletFromSeed(projectId, seed);
    expect(wallet.utxos.length).toBeGreaterThan(0);

    const plutus = (await loadPlutus()).assert();

    ref = wallet.utxos[0];
    const script = createScript(plutus, ref);
    const policy = ScriptHash.toHex(ScriptHash.fromScript(script));
    token = policy + tokenName;

    client = createClient({
      network: parseNetwork(projectId),
      provider: makeBlockfrostConfig(projectId),
      wallet: { type: "seed", mnemonic: seed },
    });
  });

  const buildMintTx = (evaluator: Evaluator) => async () => {
    const plutus = (await loadPlutus()).assert();
    const script = createScript(plutus, ref);

    const mintResult = await client
      .newTx()
      .mintAssets({
        assets: Assets.fromRecord({ [token]: tokenAmount }),
      })
      .attachScript({ script })
      .collectFrom({ inputs: [ref] })
      .setValidity({ to: BigInt(Date.now() + expiresIn) })
      .build({ evaluator });

    const tx = await mintResult.toTransaction();
    const cbor = Transaction.toCBORHex(tx);
    expect(cbor).toBeTruthy();
  };

  it("builds mint tx with aiken evaluator", async () => {
    const { createAikenEvaluator } = await import("@evolution-sdk/aiken-uplc");
    await buildMintTx(createAikenEvaluator)();
  });

  it("builds mint tx with scalus evaluator", async () => {
    const { createScalusEvaluator } =
      await import("@evolution-sdk/scalus-uplc");
    await buildMintTx(createScalusEvaluator)();
  });
});
