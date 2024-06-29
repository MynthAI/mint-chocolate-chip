import { Blockfrost as CardanoBlockfrost } from "@cardano-ts/node";
import { Blockfrost, Lucid, Network } from "@lucid-evolution/lucid";

const expiresIn = 600000; // About 10 minutes

const loadLucid = async (projectId: string) => {
  const blockfrost = new CardanoBlockfrost(projectId);
  const lucid = await Lucid(
    new Blockfrost(
      `https://cardano-${blockfrost.network}.blockfrost.io/api/v0`,
      projectId
    ),
    convertNetwork(blockfrost)
  );

  const newTx = lucid.newTx;
  lucid.newTx = () => newTx().validTo(Date.now() + expiresIn);

  return lucid;
};

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

export { loadLucid };
