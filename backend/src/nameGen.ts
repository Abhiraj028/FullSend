import { uniqueNamesGenerator, adjectives, colors, animals } from "unique-names-generator";
import type { Config } from "unique-names-generator";

export function generateName() {
    
    const shuffled = [adjectives, colors, animals].sort(() => Math.random() - 0.5).slice(0, 2);

    const config: Config = {
        dictionaries: shuffled,
        separator: '-',
        length: 2,
    };
    
    return uniqueNamesGenerator(config);
}