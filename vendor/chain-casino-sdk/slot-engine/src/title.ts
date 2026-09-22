import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { type CompiledConfiguration, compileConfiguration } from './compile.ts';
import { parseTierList } from './tier-list.ts';

export type BetConfigurationDefinition = {
  name: string;
  tierList: string;
  prizeDenominator?: number;
  displayMapping?: string;
};

export type TitleDefinition = {
  name: string;
  betConfigurations: BetConfigurationDefinition[];
};

export type CompiledTitle = {
  name: string;
  betConfigurations: Array<{ name: string; displayMappingPath?: string } & CompiledConfiguration>;
};

/** The first bet configuration is the base configuration; its RTP is the title RTP. */
export function compileTitleFile(definitionPath: string): CompiledTitle {
  const directory = dirname(resolve(definitionPath));
  const definition = JSON.parse(readFileSync(definitionPath, 'utf8')) as TitleDefinition;
  if (!Array.isArray(definition.betConfigurations) || definition.betConfigurations.length === 0) {
    throw new Error('A title needs at least one bet configuration');
  }
  return {
    name: definition.name,
    betConfigurations: definition.betConfigurations.map(configuration => {
      try {
        return {
          name: configuration.name,
          displayMappingPath:
            configuration.displayMapping === undefined
              ? undefined
              : resolve(directory, configuration.displayMapping),
          ...compileConfiguration(
            parseTierList(readFileSync(resolve(directory, configuration.tierList), 'utf8')),
            configuration.prizeDenominator === undefined
              ? {}
              : { prizeDenominator: BigInt(configuration.prizeDenominator) },
          ),
        };
      } catch (error) {
        throw new Error(
          `Bet configuration "${configuration.name}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  };
}
