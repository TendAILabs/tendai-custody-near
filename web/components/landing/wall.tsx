import { wallCards, type WallCard } from "./cards";
import { Eyebrow } from "./eyebrow";

function Card({ card, dup }: { card: WallCard; dup: boolean }) {
  return (
    <div className={dup ? "pcard dup" : "pcard"} aria-hidden={dup ? true : undefined}>
      <span className="pid">
        {card.id} / EXAMPLE
      </span>
      <div>
        <b>{card.title}</b>
        <small>{card.detail}</small>
      </div>
      <span className={`pill ${card.tone}`}>{card.status}</span>
    </div>
  );
}

function Track({ cards, index }: { cards: WallCard[]; index: 0 | 1 }) {
  const row = index === 0 ? cards.concat(cards) : cards.slice().reverse().concat(cards.slice().reverse());
  return (
    <div className="rowclip">
      <div className="track" data-marquee={index}>
        {row.map((card, i) => (
          <Card key={`${card.id}-${i}`} card={card} dup={i >= cards.length} />
        ))}
      </div>
    </div>
  );
}

export function Wall() {
  return (
    <section className="sec wall" id="wall" data-s="wall" data-tone="L">
      <div className="wrap pb">
        <Eyebrow ix="02" label="live control" extra={<span className="chip">Example data</span>} />
      </div>
      <div className="rows" role="group" aria-label="Examples of shared records and their status">
        <Track cards={wallCards} index={0} />
        <Track cards={wallCards} index={1} />
      </div>
    </section>
  );
}
