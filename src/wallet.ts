import { Blockfrost, Lucid, Network } from "@lucid-evolution/lucid";
import { Blockfrost as CardanoBlockfrost, Wallet } from "cardano-ts";

const expiresIn = 600000; // About 10 minutes

const loadWallet = (projectId: string, address: string) =>
  Wallet.fromAddress(new CardanoBlockfrost(projectId), address);

const loadLucid = async (projectId: string) => {
  const blockfrost = new CardanoBlockfrost(projectId);
  const lucid = await Lucid(
    new Blockfrost(
      `https://cardano-${blockfrost.network}.blockfrost.io/api/v0`,
      projectId
    ),
    getNetwork(projectId)
  );

  const newTx = lucid.newTx;
  lucid.newTx = () => newTx().validTo(Date.now() + expiresIn);

  return lucid;
};

const getNetwork = (projectId: string) => {
  const network = new CardanoBlockfrost(projectId).network;
  type CardanoNetwork = typeof network;
  const networks: Record<CardanoNetwork, Network> = {
    mainnet: "Mainnet",
    preprod: "Preprod",
    preview: "Preview",
  };
  return networks[network];
};

export { getNetwork, loadLucid, loadWallet };
