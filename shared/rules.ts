import type { Gender, MasterKey, Rank, RuleConfig } from './types.ts'

export type RuleAction =
  | { kind: 'none' }
  | { kind: 'self' }
  | { kind: 'everyone' }
  | { kind: 'gender'; gender: Gender }
  | { kind: 'chooseDrinker' }
  | { kind: 'chooseMate' }
  | { kind: 'master'; key: MasterKey }
  | { kind: 'writeRule' }
  | { kind: 'kingsCup' }

export interface RuleDef {
  id: string
  name: string
  /** One line, shown in the rules list. */
  summary: string
  /**
   * Shown when the card is drawn. Use {You}, {you}, {You're} and {your}
   * so it reads right for the drawer and for everyone else. See `describe`.
   */
  description: string
  action: RuleAction
  /** Rules that go round the circle starting with the drawer. */
  goesRound?: boolean
}

export const MASTER_TITLES: Record<MasterKey, string> = {
  floor: 'Floor Master',
  heaven: 'Heaven Master',
  thumb: 'Thumb Master',
  question: 'Question Master',
}

export const RULE_LIBRARY: RuleDef[] = [
  {
    id: 'waterfall',
    name: 'Waterfall',
    summary: 'Everyone drinks, stopping in turn',
    description:
      'Everyone starts drinking at once. {You} can stop whenever, but nobody else can stop until the person on their right has stopped.',
    action: { kind: 'none' },
  },
  {
    id: 'you',
    name: 'You',
    summary: 'Pick someone to drink',
    description: '{You} must pick someone to drink.',
    action: { kind: 'chooseDrinker' },
  },
  {
    id: 'me',
    name: 'Me',
    summary: 'You drink',
    description: '{You} must drink. Bad luck.',
    action: { kind: 'self' },
  },
  {
    id: 'floor',
    name: 'Floor',
    summary: 'Last finger on the floor drinks',
    description:
      "At any moment, {you} can put a finger on the floor. Everyone has to follow, and the last one to do it drinks. Lasts until someone else draws Floor.",
    action: { kind: 'master', key: 'floor' },
  },
  {
    id: 'guys',
    name: 'Guys',
    summary: 'All the guys drink',
    description: 'All the guys drink.',
    action: { kind: 'gender', gender: 'boy' },
  },
  {
    id: 'chicks',
    name: 'Chicks',
    summary: 'All the girls drink',
    description: 'All the girls drink.',
    action: { kind: 'gender', gender: 'girl' },
  },
  {
    id: 'heaven',
    name: 'Heaven',
    summary: 'Last hand to the sky drinks',
    description:
      "At any moment, {you} can point to the sky. Everyone has to follow, and the last one to do it drinks. Lasts until someone else draws Heaven.",
    action: { kind: 'master', key: 'heaven' },
  },
  {
    id: 'mate',
    name: 'Mate',
    summary: 'Pick a drinking partner for the game',
    description:
      '{You} must pick a mate. From now on, whenever one drinks, so does the other. Mates of mates count too.',
    action: { kind: 'chooseMate' },
  },
  {
    id: 'rhyme',
    name: 'Rhyme',
    summary: 'Rhyme round the circle',
    description:
      '{You} must say a word. Going clockwise, everyone has to say a word that rhymes with it. Hesitate, repeat one or get it wrong and you drink.',
    action: { kind: 'none' },
    goesRound: true,
  },
  {
    id: 'categories',
    name: 'Categories',
    summary: 'Name things in a category',
    description:
      '{You} must pick a category, like pubs in Edinburgh. Going clockwise, everyone names something in it. Hesitate, repeat one or get it wrong and you drink.',
    action: { kind: 'none' },
    goesRound: true,
  },
  {
    id: 'ruleMaker',
    name: 'Rule Maker',
    summary: 'Make a rule for the rest of the game',
    description: '{You} must make a rule that everyone has to follow for the rest of the game.',
    action: { kind: 'writeRule' },
  },
  {
    id: 'questionRound',
    name: 'Question Master',
    summary: 'Everyone answers, or downs their drink',
    description:
      '{You} must ask a question. Going clockwise, everyone has to answer it. Fail to answer and you down your whole drink.',
    action: { kind: 'none' },
    goesRound: true,
  },
  {
    id: 'kingsCup',
    name: "King's Cup",
    summary: 'Pour into the cup. Last one downs it',
    description: '{You} must pour some of {your} drink into the cup in the middle.',
    action: { kind: 'kingsCup' },
  },

  // Alternatives that aren't a default for any card.
  {
    id: 'social',
    name: 'Social',
    summary: 'Everyone drinks',
    description: 'Everyone drinks. Cheers.',
    action: { kind: 'everyone' },
  },
  {
    id: 'thumb',
    name: 'Thumb Master',
    summary: 'Last thumb on the table drinks',
    description:
      "At any moment, {you} can put a thumb on the table. Everyone has to follow, and the last one to do it drinks. Lasts until someone else draws Thumb Master.",
    action: { kind: 'master', key: 'thumb' },
  },
  {
    id: 'questionMaster',
    name: 'Question Master (classic)',
    summary: 'Anyone who answers your questions drinks',
    description:
      "{You're} the Question Master. Until someone else draws this card, anyone who answers one of {your} questions drinks.",
    action: { kind: 'master', key: 'question' },
  },
  {
    id: 'neverHaveI',
    name: 'Never Have I Ever',
    summary: 'Never have I ever, round the circle',
    description:
      "Starting with {you} and going clockwise, everyone says something they've never done. Anyone who has done it drinks.",
    action: { kind: 'none' },
    goesRound: true,
  },
]

const BY_ID = new Map(RULE_LIBRARY.map((r) => [r.id, r]))

export function getRule(id: string): RuleDef {
  return BY_ID.get(id) ?? RULE_LIBRARY[0]
}

export function isRuleId(id: string): boolean {
  return BY_ID.has(id)
}

/** Fills in a rule description for the person reading it. */
export function describe(rule: RuleDef, drawerName: string, isDrawer: boolean): string {
  const words: Record<string, string> = isDrawer
    ? { You: 'You', you: 'you', "You're": "You're", your: 'your' }
    : { You: drawerName, you: drawerName, "You're": `${drawerName} is`, your: `${drawerName}'s` }
  return rule.description.replace(/\{(You're|You|you|your)\}/g, (_, key: string) => words[key])
}

export const DEFAULT_RULES: RuleConfig = {
  A: 'waterfall',
  '2': 'you',
  '3': 'me',
  '4': 'floor',
  '5': 'guys',
  '6': 'chicks',
  '7': 'heaven',
  '8': 'mate',
  '9': 'rhyme',
  '10': 'categories',
  J: 'ruleMaker',
  Q: 'questionRound',
  K: 'kingsCup',
}

export const RANK_NAMES: Record<Rank, string> = {
  A: 'Ace',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
  '10': 'Ten',
  J: 'Jack',
  Q: 'Queen',
  K: 'King',
}
