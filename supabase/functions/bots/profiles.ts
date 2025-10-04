import beginner from './profiles/beginner.json' with { type: 'json' };
import tactician from './profiles/tactician.json' with { type: 'json' };
import gambit from './profiles/gambit.json' with { type: 'json' };
import aggressive from './profiles/aggressive.json' with { type: 'json' };
import solid from './profiles/solid.json' with { type: 'json' };
import zen from './profiles/zen.json' with { type: 'json' };
import type { BotProfileConfig } from './types.ts';

const profiles = [
  beginner as BotProfileConfig,
  tactician as BotProfileConfig,
  gambit as BotProfileConfig,
  aggressive as BotProfileConfig,
  solid as BotProfileConfig,
  zen as BotProfileConfig,
];

export const BOT_PROFILES: BotProfileConfig[] = profiles;

export function getProfileById(id: string): BotProfileConfig | undefined {
  return profiles.find((profile) => profile.id === id);
}
