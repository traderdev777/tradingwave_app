import Link from "next/link";

export function UserMenu({ name, email, role }: { name: string; email: string; role: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";
  return (
    <details className="umenu">
      <summary aria-label="Account menu">
        <span className="umenu__avatar" aria-hidden="true">{initials}</span>
        <span className="umenu__name">{name}</span>
        <svg viewBox="0 0 24 24" className="umenu__chev" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </summary>
      <div className="umenu__panel">
        <div className="umenu__who">
          <strong>{name}</strong>
          <span>{email}</span>
          {role === "ADMIN" && <span className="tw-tag">Admin</span>}
        </div>
        <Link href="/app/settings">Settings</Link>
        <form action="/api/auth/logout" method="post">
          <button type="submit">Sign out</button>
        </form>
      </div>
    </details>
  );
}
