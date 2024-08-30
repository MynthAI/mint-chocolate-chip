import { fromText } from "@lucid-evolution/lucid";
import { type, Type } from "arktype";

const validate = <T, U>(validator: Type<T, U>, data: unknown) => {
  const result = validator(data);
  if (result instanceof type.errors) return logThenExit(result.summary);
  return result;
};

const logThenExit = (message: string): never => {
  console.error(message);
  process.exit(1);
};

const Address = type("string");

const TokenName = type("string")
  .pipe((s) => fromText(s))
  .narrow((v, ctx) => v.length <= 64 || ctx.mustBe("no more than 32 bytes"));

const Amount = type("string")
  .pipe((s, ctx) => {
    try {
      return BigInt(s);
    } catch {
      return ctx.error("valid non-decimal number");
    }
  })
  .narrow((v) => v > 0n);

const TxId = type("string==64")
  .pipe((s) => s.toLowerCase())
  .narrow((s, ctx) => /^[0-9A-Fa-f]+$/.test(s) || ctx.mustBe("tx ID"));

const Metadata = type(/^[a-zA-Z0-9]+:(.+)$/)
  .array()
  .pipe((values) =>
    values.reduce<Record<string, string>>((metadata, keyValue) => {
      const [name, ...value] = keyValue.split(":");
      metadata[name] = value.join(":");
      return metadata;
    }, {})
  );

const Options = type({
  "metadata?": Metadata,
}).pipe((options) => {
  return { metadata: options.metadata };
});
type Options = typeof Options.infer;

const Config = type({
  BLOCKFROST_API_KEY: "string==39",
});

export {
  Address,
  Amount,
  Config,
  logThenExit,
  Options,
  TokenName,
  TxId,
  validate,
};
