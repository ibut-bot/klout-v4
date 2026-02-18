export interface ScoreTier {
  min: number
  max: number
  title: string
  quotes: string[]
}

export const SCORE_TIERS: ScoreTier[] = [
  {
    min: 0, max: 1000, title: 'NPC Energy',
    quotes: [
      'I can mass DM 500 people and get left on seen by all of them',
      'I can tweet into the void and the void doesn\'t even bother echoing back',
      'I can get mass-unfollowed just by posting \'good morning\'',
      'I can go viral... in a group chat of three people',
      'I can ratio myself',
      'I can make a bot unfollow me',
      'I can get fewer views than a tweet written in Wingdings',
      'I can post a giveaway and still lose followers',
    ],
  },
  {
    min: 1001, max: 2000, title: 'Background Character',
    quotes: [
      'I can convince my mom to like my tweets — if I remind her twice',
      'I can get engagement... from my own alt accounts',
      'I can start a Twitter beef and both sides ignore me',
      'I can influence my Uber driver\'s music choice, on a good day',
      'I can get a read receipt and nothing else',
      'I can tweet a banger and have it die with 2 likes, both from bots',
      'I can get ghosted by a brand that DMs literally everyone',
      'I can trend in my own household',
      'I can lose a follower for having an opinion on cereal',
    ],
  },
  {
    min: 2001, max: 3500, title: 'Side Character With Lines',
    quotes: [
      'I can get strangers on the internet to argue about something I made up',
      'I can convince my friends to try a restaurant that\'s mid',
      'I can get a reply guy to actually agree with me',
      'I can make someone google something just because I said it confidently',
      'I can get a group chat to switch from iMessage to Signal... for one day',
      'I can tweet something controversial and not get doxxed',
      'I can sell a course on something I learned last week',
      'I can finesse free shipping on a DM deal',
      'I can post a fit pic and get compliments from people who aren\'t family',
      'I can get into a Twitter Space and actually get unmuted',
    ],
  },
  {
    min: 3501, max: 5000, title: 'Main Character Warming Up',
    quotes: [
      'I can make a crypto bro question his own bags',
      'I can get a New Yorker to hold a door open',
      'I can start a thread and people actually read past slide 3',
      'I can convince someone to watch a show that got cancelled after one season',
      'I can get a cat person to admit dogs are okay',
      'I can make a LinkedIn post that doesn\'t make people cringe',
      'I can talk someone into clicking a link without them assuming it\'s a rug',
      'I can get invited to a group chat I wasn\'t supposed to know about',
      'I can make someone switch their profile pic because mine was better',
      'I can get someone to use my referral code without begging',
      'I can make a tweet so good someone screenshots it without credit',
    ],
  },
  {
    min: 5001, max: 6500, title: 'The Closer',
    quotes: [
      'I can sell oat milk to a cattle rancher',
      'I can get a Parisian to compliment my coffee',
      'I can make someone read the terms and conditions — and enjoy it',
      'I can convince a gym bro that rest days aren\'t weakness',
      'I can get verified accounts to reply to my threads',
      'I can make \'thoughts and prayers\' sound sincere',
      'I can make someone unironically say \'this changed my perspective\'',
      'I can get a VC to respond to a cold DM',
      'I can make a 3am tweet outperform a scheduled marketing post',
      'I can sell a masterclass on a skill I have no business teaching',
      'I can convince a developer to use a no-code tool',
      'I can get a boomer to understand what \'based\' means',
    ],
  },
  {
    min: 6501, max: 8000, title: 'Dangerously Persuasive',
    quotes: [
      'I can convince an Italian that pineapple pizza slaps — and they\'d order it again',
      'I can get a conspiracy theorist to trust the algorithm',
      'I can make someone delete a tweet they were proud of just by quoting it',
      'I can make a government official actually read my reply',
      'I can start a movement with a typo and nobody notices',
      'I can sell ice to Iceland and make them feel lucky',
      'I can make a brand change their slogan because I roasted it',
      'I can get a Wall Street bro to buy a meme coin on my word alone',
      'I can turn a random opinion into a Wikipedia citation',
      'I can get someone to rage-quit the internet over a seven-word tweet',
      'I can get a blue check to argue with me and lose',
      'I can make a VC wire money based on a tweet thread',
    ],
  },
  {
    min: 8001, max: 9000, title: 'Reality Distortion Field',
    quotes: [
      'I can convince Elon to delete a tweet and thank me for the feedback',
      'I can make a flat-earther buy a globe — as home decor',
      'I can tank a stock price with a single subtweet',
      'I can get rival fan bases to agree on something',
      'I can make \'silence is violence\' feel like an understatement when I go quiet',
      'I can sell a PDF for more than a college textbook',
      'I can get a country to change their tourism slogan with one thread',
      'I can make a billionaire feel poor by posting my morning routine',
      'I can start a brand boycott that actually works',
      'I can make people pay for content they could get for free',
      'I can get a news outlet to cite my tweet as a source',
      'I can make a CEO apologize with a quote tweet',
    ],
  },
  {
    min: 9001, max: 10000, title: 'World Bender',
    quotes: [
      'I can sell snow to Eskimos and they\'d leave a five-star review',
      'I can convince the ocean it\'s not wet',
      'I can launch a currency called \'Nothing\' and it would moon',
      'I can end a war with a group DM',
      'I can make world leaders subtweet each other over my thread',
      'I can tweet \'delete your app\' and downloads go up',
      'I can make people stand in line for something that doesn\'t exist yet',
      'I can get the Pope to drop an \'amen\' in my replies',
      'I can make a country rename itself because I mispronounced it',
      'I can get a treaty signed in my quote tweets',
      'I can move markets by changing my bio',
      'I can make \'just trust me bro\' legally binding',
    ],
  },
]

export function getScoreTier(score: number): ScoreTier {
  return SCORE_TIERS.find(t => score >= t.min && score <= t.max) || SCORE_TIERS[0]
}

export function getScoreTierTitle(score: number): string {
  return getScoreTier(score).title
}

export function getRandomQuote(score: number): string {
  const tier = getScoreTier(score)
  return tier.quotes[Math.floor(Math.random() * tier.quotes.length)]
}
