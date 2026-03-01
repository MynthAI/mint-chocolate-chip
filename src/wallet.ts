import {
  Blockfrost,
  Lucid,
  Network,
  UTxO,
  walletFromSeed,
} from "@lucid-evolution/lucid";

const expiresIn = 600000; // About 10 minutes

type CardanoNetwork = "mainnet" | "preprod" | "preview";

const parseNetwork = (projectId: string): CardanoNetwork => {
  const network = projectId.substring(0, 7);
  if (network !== "mainnet" && network !== "preprod" && network !== "preview")
    throw new Error(`Unknown network: ${network}`);
  return network;
};

const loadWallet = async (projectId: string, address: string) => {
  const network = parseNetwork(projectId);
  const provider = new Blockfrost(
    `https://cardano-${network}.blockfrost.io/api/v0`,
    projectId
  );
  const utxos: UTxO[] = await provider.getUtxos(address);
  return { address, utxos };
};

const loadWalletFromSeed = async (projectId: string, seed: string) => {
  const network = getNetwork(projectId);
  const { address } = walletFromSeed(seed, { network });
  return loadWallet(projectId, address);
};

const loadLucid = async (projectId: string) => {
  const network = parseNetwork(projectId);
  const lucid = await Lucid(
    new Blockfrost(
      `https://cardano-${network}.blockfrost.io/api/v0`,
      projectId
    ),
    getNetwork(projectId)
  );

  const newTx = lucid.newTx;
  lucid.newTx = () => newTx().validTo(Date.now() + expiresIn);

  return lucid;
};

const getNetwork = (projectId: string) => {
  const networks: Record<CardanoNetwork, Network> = {
    mainnet: "Mainnet",
    preprod: "Preprod",
    preview: "Preview",
  };
  return networks[parseNetwork(projectId)];
};

export { getNetwork, loadLucid, loadWallet, loadWalletFromSeed };
