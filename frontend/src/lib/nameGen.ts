import { uniqueNamesGenerator, adjectives, animals } from "unique-names-generator";
import type { Config } from "unique-names-generator";

export function generateNickname() {
  const shuffled = [adjectives, animals].sort(() => Math.random() - 0.5).slice(0, 2);

  const config: Config = {
    dictionaries: shuffled,
    separator: "-",
    length: 2,
  };

  const base = uniqueNamesGenerator(config);
  const suffix = String(Math.floor(Math.random() * 900) + 100);
  return `${base}-${suffix}`;
}
