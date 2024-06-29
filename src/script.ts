import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { type } from "arktype";
import { Err, Ok, Result } from "ts-handling";

const here = dirname(fileURLToPath(import.meta.url));

const Plutus = type({
  validators: [
    {
      compiledCode: "string",
    },
  ],
}).pipe((v) => v.validators[0].compiledCode);

const loadPlutus = async (): Promise<Result<string, string>> => {
  const plutusPath = join(here, "..", "plutus.json");
  const plutus = Plutus(JSON.parse(await fs.readFile(plutusPath, "utf8")));
  if (plutus instanceof type.errors) return Err(plutus.summary);
  return Ok(plutus);
};

export { loadPlutus };
