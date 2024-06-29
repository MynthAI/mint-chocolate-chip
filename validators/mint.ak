use aiken/dict
use aiken/hash.{Blake2b_256, Hash}
use aiken/list
use aiken/transaction.{
  Input, Mint, NoDatum, Output, OutputReference, ScriptContext, Transaction,
  TransactionId,
}
use aiken/transaction/credential.{Address, VerificationKeyCredential}
use aiken/transaction/value.{MintedValue, PolicyId}

validator(tx_id: Hash<Blake2b_256, Transaction>, index: Int) {
  fn mint(_redeemer: Data, ctx: ScriptContext) {
    let reference = OutputReference(TransactionId(tx_id), index)
    let ScriptContext(Transaction { inputs, mint, .. }, _) = ctx
    when ctx.purpose is {
      Mint(policy) -> mint_validator(policy, reference, inputs, mint)
      _ -> fail @"This is a minting policy"
    }
  }
}

fn mint_validator(
  policy: PolicyId,
  reference: OutputReference,
  inputs: List<Input>,
  mint: MintedValue,
) -> Bool {
  or {
    allow_burn(policy, mint),
    allow_mint_only_once(reference, inputs),
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

fn allow_mint_only_once(reference: OutputReference, inputs: List<Input>) -> Bool {
  inputs |> list.any(fn(i) { i.output_reference == reference })
}

fn inputs(utxo_ref: OutputReference) -> List<Input> {
  [
    Input(
      utxo_ref,
      Output {
        address: Address {
          payment_credential: VerificationKeyCredential(#"abcd"),
          stake_credential: None,
        },
        value: value.from_lovelace(1),
        datum: NoDatum,
        reference_script: None,
      },
    ),
  ]
}

test can_mint() {
  let own_policy_id = #"ab"
  let utxo_ref = OutputReference(TransactionId(#"bc"), 0)
  let inputs = inputs(utxo_ref)
  let minted_value =
    [Pair(own_policy_id, [Pair(#"", 1)])]
      |> value.from_asset_list()
      |> value.to_minted_value()
  mint_validator(own_policy_id, utxo_ref, inputs, minted_value)
}

test can_mint_multiple() {
  let own_policy_id = #"ab"
  let utxo_ref = OutputReference(TransactionId(#"bc"), 0)
  let inputs = inputs(utxo_ref)
  let minted_value =
    [Pair(own_policy_id, [Pair(#"", 1), Pair(#"abcd", 3)])]
      |> value.from_asset_list()
      |> value.to_minted_value()
  mint_validator(own_policy_id, utxo_ref, inputs, minted_value)
}

test can_burn() {
  let own_policy_id = #"ab"
  let utxo_ref = OutputReference(TransactionId(#"bc"), 0)
  let inputs = inputs(OutputReference(TransactionId("#de"), 1))
  let minted_value =
    [Pair(own_policy_id, [Pair(#"", -1), Pair(#"abcd", -3)])]
      |> value.from_asset_list()
      |> value.to_minted_value()
  mint_validator(own_policy_id, utxo_ref, inputs, minted_value)
}

test cant_double_mint() fail {
  let own_policy_id = #"ab"
  let utxo_ref = OutputReference(TransactionId(#"bc"), 0)
  let inputs = inputs(OutputReference(TransactionId("#de"), 1))
  let minted_value =
    [Pair(own_policy_id, [Pair(#"", 1), Pair(#"abcd", 3)])]
      |> value.from_asset_list()
      |> value.to_minted_value()
  mint_validator(own_policy_id, utxo_ref, inputs, minted_value)
}
