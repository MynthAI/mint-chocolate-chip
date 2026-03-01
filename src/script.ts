import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { UPLC } from "@evolution-sdk/evolution";
import { type } from "arktype";
import { Err, Ok, Result } from "ts-handling";

const Validators = ["mint.mint", "multiple.mint"] as const;
type Validator = (typeof Validators)[number];
const here = dirname(fileURLToPath(import.meta.url));

const Plutus = type({
  validators: type({ title: "string", compiledCode: "string" }).array(),
}).pipe((v) =>
  v.validators
    .filter(
      (validator): validator is { title: Validator; compiledCode: string } =>
        (Validators as readonly string[]).includes(validator.title)
    )
    .reduce(
      (validators, validator) => {
        validators[validator.title] = validator.compiledCode;
        return validators;
      },
      {} as Partial<Record<Validator, string>>
    )
);

const loadPlutus = async (
  validator: Validator = "mint.mint"
): Promise<Result<string, string>> => {
  const plutusPath = join(here, "..", "plutus.json");
  const plutus = Plutus(JSON.parse(await fs.readFile(plutusPath, "utf8")));
  if (plutus instanceof type.errors) return Err(plutus.summary);
  const compiledCode = plutus[validator];
  if (!compiledCode)
    return Err(`Validator "${validator}" not found in plutus.json`);
  return Ok(UPLC.applyDoubleCborEncoding(compiledCode));
};

export { loadPlutus };
