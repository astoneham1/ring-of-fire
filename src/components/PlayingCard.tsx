import type { Card, Rank, Suit } from '../../shared/types.ts'

// U+FE0E asks for the text glyph so iOS doesn't swap in an emoji heart.
const SUIT_GLYPHS: Record<Suit, string> = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎' }

export function suitGlyph(suit: Suit) {
  return SUIT_GLYPHS[suit]
}

export function isRed(suit: Suit) {
  return suit === 'H' || suit === 'D'
}

/** A card face that scales with its container width. */
export function CardFace({ card, className = '' }: { card: Card; className?: string }) {
  const color = isRed(card.suit) ? 'text-suit-red' : 'text-suit-black'
  const glyph = suitGlyph(card.suit)
  const court = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K'

  return (
    <div
      className={`relative aspect-[5/7] overflow-hidden rounded-[7%] bg-paper shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6)] ${color} ${className}`}
      style={{ containerType: 'inline-size' }}
    >
      <Corner rank={card.rank} glyph={glyph} className="top-[5%] left-[7%]" />
      <Corner rank={card.rank} glyph={glyph} className="right-[7%] bottom-[5%] rotate-180" />
      <div className="absolute inset-[20%_18%] flex items-center justify-center rounded-[6%] border border-current/15">
        {court ? (
          <span className="font-display leading-none font-extrabold" style={{ fontSize: '42cqw' }}>
            {card.rank}
          </span>
        ) : (
          <span className="leading-none" style={{ fontSize: '46cqw' }}>
            {glyph}
          </span>
        )}
      </div>
    </div>
  )
}

function Corner({ rank, glyph, className }: { rank: Rank; glyph: string; className: string }) {
  return (
    <div className={`absolute flex flex-col items-center leading-none ${className}`}>
      <span className="font-display font-bold tracking-tighter" style={{ fontSize: '15cqw' }}>
        {rank}
      </span>
      <span style={{ fontSize: '12cqw' }}>{glyph}</span>
    </div>
  )
}

export function CardBack({ className = '' }: { className?: string }) {
  return (
    <div className={`card-back aspect-[5/7] rounded-[7%] border-[3px] border-paper shadow-[0_10px_30px_-8px_rgb(0_0_0/0.6)] ${className}`} />
  )
}

/** Small inline card chip, e.g. "7♥". */
export function CardChip({ card }: { card: Card }) {
  return (
    <span
      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-paper px-1 font-display text-sm font-bold ${
        isRed(card.suit) ? 'text-suit-red' : 'text-suit-black'
      }`}
    >
      {card.rank}
      {suitGlyph(card.suit)}
    </span>
  )
}

export function RankBadge({ rank }: { rank: Rank }) {
  return (
    <span className="flex h-9 w-7 shrink-0 items-center justify-center rounded-md bg-paper font-display text-sm font-extrabold text-suit-black">
      {rank}
    </span>
  )
}
