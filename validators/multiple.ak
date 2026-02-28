use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{Blake2b_256, Hash}
use cardano/assets
use cardano/assets.{PolicyId, Value}
use cardano/transaction.{Input, OutputReference, Transaction}

validator mint(tx_id: Hash<Blake2b_256, Transaction>) {
  mint(_redeemer, policy: PolicyId, self: Transaction) {
    let Transaction { inputs, mint, .. } = self
    mint_validator(policy, tx_id, inputs, mint)
  }

  else(_) {
    fail @"This is a minting policy"
  }
}

fn mint_validator(
  policy: PolicyId,
  reference: Hash<Blake2b_256, Transaction>,
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

fn allow_mint_only_once(
  reference: Hash<Blake2b_256, Transaction>,
  inputs: List<Input>,
) -> Bool {
  inputs
    |> list.any(
        fn(input) {
          input.output_reference.transaction_id == reference
        },
      )
}
