use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{Blake2b_256, Hash}
use cardano/address.{Address, VerificationKey}
use cardano/assets
use cardano/assets.{PolicyId, Value}
use cardano/transaction.{
  Input, NoDatum, Output, OutputReference, Transaction,
}

validator mint(tx_id: Hash<Blake2b_256, Transaction>, index: Int) {
  mint(_redeemer, policy: PolicyId, self: Transaction) {
    let reference =
      OutputReference { transaction_id: tx_id, output_index: index }
    let Transaction { inputs, mint, .. } = self
    mint_validator(policy, reference, inputs, mint)
  }

  else(_) {
    fail @"This is a minting policy"
  }
}

fn mint_validator(
  policy: PolicyId,
  reference: OutputReference,
  inputs: List<Input>,
  mint: Value,
) -> Bool {
  or {
    allow_burn(policy, mint),
    allow_mint_only_once(reference, inputs),
    fail @"After minting, only burning is possible",
  }
}

fn allow_burn(policy: PolicyId, mint: Value) -> Bool {
  mint
    |> assets.tokens(policy)
    |> dict.to_pairs()
    |> list.all(
        fn(v) {
          let Pair(_, quantity) = v
          quantity < 0
        },
      )
}

fn allow_mint_only_once(reference: OutputReference, inputs: List<Input>) -> Bool {
  inputs |> list.any(fn(i) { i.output_reference == reference })
}

fn inputs(utxo_ref: OutputReference) -> List<Input> {
  [
    Input {
      output_reference: utxo_ref,
      output: Output {
        address: Address {
          payment_credential: VerificationKey(#"abcd"),
          stake_credential: None,
        },
        value: assets.from_lovelace(1),
        datum: NoDatum,
        reference_script: None,
      },
    },
  ]
}

test can_mint() {
  let own_policy_id = #"ab"
  let utxo_ref = OutputReference { transaction_id: #"bc", output_index: 0 }
  let inputs = inputs(utxo_ref)
  let mint =
    [Pair(own_policy_id, [Pair(#"", 1)])]
      |> assets.from_asset_list()
  mint_validator(own_policy_id, utxo_ref, inputs, mint)
}

test can_mint_multiple() {
  let own_policy_id = #"ab"
  let utxo_ref = OutputReference { transaction_id: #"bc", output_index: 0 }
  let inputs = inputs(utxo_ref)
  let mint =
    [Pair(own_policy_id, [Pair(#"", 1), Pair(#"abcd", 3)])]
      |> assets.from_asset_list()
  mint_validator(own_policy_id, utxo_ref, inputs, mint)
}

test can_burn() {
  let own_policy_id = #"ab"
  let utxo_ref = OutputReference { transaction_id: #"bc", output_index: 0 }
  let inputs = inputs(OutputReference { transaction_id: #"de", output_index: 1 })
  let mint =
    [Pair(own_policy_id, [Pair(#"", -1), Pair(#"abcd", -3)])]
      |> assets.from_asset_list()
  mint_validator(own_policy_id, utxo_ref, inputs, mint)
}

test cant_double_mint() fail {
  let own_policy_id = #"ab"
  let utxo_ref = OutputReference { transaction_id: #"bc", output_index: 0 }
  let inputs = inputs(OutputReference { transaction_id: #"de", output_index: 1 })
  let mint =
    [Pair(own_policy_id, [Pair(#"", 1), Pair(#"abcd", 3)])]
      |> assets.from_asset_list()
  mint_validator(own_policy_id, utxo_ref, inputs, mint)
}
