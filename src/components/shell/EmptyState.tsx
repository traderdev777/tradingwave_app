import Link from "next/link";

type Props = {
  step: string;
  title: string;
  body: string;
  bullets?: string[];
  action?: { href: string; label: string };
};

/** Honest placeholder for features that ship in later steps. No fake data. */
export function EmptyState({ step, title, body, bullets, action }: Props) {
  return (
    <section className="empty">
      <span className="tw-tag tw-tag--paper">{step}</span>
      <h2>{title}</h2>
      <p>{body}</p>
      {bullets && (
        <ul className="empty__list">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      {action && (
        <Link className="btn btn--ghost btn--sm" href={action.href}>
          {action.label}
        </Link>
      )}
    </section>
  );
}
