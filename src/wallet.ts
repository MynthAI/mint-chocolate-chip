import { Address, createClient, UTxO } from "@evolution-sdk/evolution";
import { addressFromSeed } from "@evolution-sdk/evolution/sdk/wallet/Derivation";

const expiresIn = 600000; // About 10 minutes

type CardanoNetwork = "mainnet" | "preprod" | "preview";

const parseNetwork = (projectId: string): CardanoNetwork => {
  const network = projectId.substring(0, 7);
  if (network !== "mainnet" && network !== "preprod" && network !== "preview")
    throw new Error(`Unknown network: ${network}`);
  return network;
};

const getNetwork = (projectId: string) => {
  const networks: Record<CardanoNetwork, "Mainnet" | "Preprod" | "Preview"> = {
    mainnet: "Mainnet",
    preprod: "Preprod",
    preview: "Preview",
  };
  return networks[parseNetwork(projectId)];
};

const makeBlockfrostConfig = (projectId: string) => {
  const network = parseNetwork(projectId);
  return {
    type: "blockfrost" as const,
    baseUrl: `https://cardano-${network}.blockfrost.io/api/v0`,
    projectId,
  };
};

const loadWallet = async (projectId: string, addressBech32: string) => {
  const provider = createClient({
    network: parseNetwork(projectId),
    provider: makeBlockfrostConfig(projectId),
  });
  const address = Address.fromBech32(addressBech32);
  const utxos: UTxO.UTxO[] = await provider.getUtxos(address);
  return { address: addressBech32, utxos };
};

const loadWalletFromSeed = async (projectId: string, seed: string) => {
  const network = getNetwork(projectId);
  const derivationNetwork =
    network === "Mainnet" ? "Mainnet" : ("Testnet" as const);
  const { address } = addressFromSeed(seed, { network: derivationNetwork });
  return loadWallet(projectId, Address.toBech32(address));
};

export {
  expiresIn,
  getNetwork,
  loadWallet,
  loadWalletFromSeed,
  makeBlockfrostConfig,
  parseNetwork,
};
