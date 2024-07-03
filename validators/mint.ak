use aiken/transaction.{ScriptContext}

validator {
  fn mint(_redeemer: Data, _ctx: ScriptContext) {
    True
  }
}
