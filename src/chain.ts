import { blake2b } from "@noble/hashes/blake2b";
import {
  Script,
  Transaction,
  TransactionBody,
  TransactionHash,
  UTxO,
} from "@evolution-sdk/evolution";

type ReadOnlyTransactionResult = {
  toTransaction: () => Promise<Transaction.Transaction>;
};

type ChainResult = {
  cbor: string;
  available: readonly UTxO.UTxO[];
  outputs: readonly UTxO.UTxO[];
};

/**
 * Computes the chain result from a built (read-only) transaction.
 *
 * Given a built transaction and the UTxOs that were available before building,
 * this returns:
 * - cbor: The CBOR hex of the transaction
 * - available: The UTxOs available after the transaction (remaining + new outputs)
 * - outputs: Only the newly created UTxOs from this transaction
 */
const buildAndChain = async (
  txResult: ReadOnlyTransactionResult,
  availableUtxos: readonly UTxO.UTxO[]
): Promise<ChainResult> => {
  const tx = await txResult.toTransaction();
  const cbor = Transaction.toCBORHex(tx);

  // Compute transaction hash (blake2b-256 of the serialized transaction body)
  const bodyBytes = TransactionBody.toCBORBytes(tx.body);
  const hashBytes = blake2b(bodyBytes, { dkLen: 32 });
  const txHashHex = Buffer.from(hashBytes).toString("hex");
  const txHash = TransactionHash.fromHex(txHashHex);

  // Identify consumed inputs
  const consumedSet = new Set(
    tx.body.inputs.map(
      (input) => `${TransactionHash.toHex(input.transactionId)}#${input.index}`
    )
  );

  // Remaining UTxOs (not consumed)
  const remaining = availableUtxos.filter(
    (u) =>
      !consumedSet.has(`${TransactionHash.toHex(u.transactionId)}#${u.index}`)
  );

  // New UTxOs created by this transaction
  const newOutputs: UTxO.UTxO[] = tx.body.outputs.map(
    (output, i) =>
      new UTxO.UTxO({
        transactionId: txHash,
        index: BigInt(i),
        address: output.address,
        assets: output.assets,
        datumOption: output.datumOption,
        scriptRef: output.scriptRef
          ? Script.fromCBOR(output.scriptRef.bytes)
          : undefined,
      })
  );

  return {
    cbor,
    available: [...remaining, ...newOutputs],
    outputs: newOutputs,
  };
};

export { buildAndChain };
