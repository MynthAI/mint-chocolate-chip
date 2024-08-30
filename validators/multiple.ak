use aiken/dict
use aiken/hash.{Blake2b_256, Hash}
use aiken/list
use aiken/transaction.{
  Input, Mint, OutputReference, ScriptContext, Transaction, TransactionId,
}
use aiken/transaction/value.{MintedValue, PolicyId}

validator(tx_id: Hash<Blake2b_256, Transaction>) {
  fn mint(_redeemer: Data, ctx: ScriptContext) {
    let reference = TransactionId(tx_id)
    let ScriptContext(Transaction { inputs, mint, .. }, _) = ctx
    when ctx.purpose is {
      Mint(policy) -> mint_validator(policy, reference, inputs, mint)
      _ -> fail @"This is a minting policy"
    }
  }
}

fn mint_validator(
  policy: PolicyId,
  reference: TransactionId,
  inputs: List<Input>,
  mint: MintedValue,
) -> Bool {
  or {
    allow_burn(policy, mint),
    allow_mint_only_once(reference, inputs),
    fail @"After minting, only burning is possible",
  }
}

fn allow_burn(policy: PolicyId, mint: MintedValue) -> Bool {
  mint
    |> value.from_minted_value()
    |> value.tokens(policy)
    |> dict.to_pairs()
    |> list.all(
        fn(v) {
          let Pair(_, quantity) = v
          quantity < 0
        },
      )
}

fn allow_mint_only_once(reference: TransactionId, inputs: List<Input>) -> Bool {
  inputs
    |> list.any(
        fn(input) {
          let Input(OutputReference(id, _), _) = input
          id == reference
        },
      )
}
