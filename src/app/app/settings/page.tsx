import type { Metadata } from "next";
import { PasswordForm, ProfileForm } from "@/components/shell/SettingsForms";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Settings · TradingWave" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="page page--narrow">
      <header className="page__head">
        <p className="eyebrow">Settings</p>
        <h1>Settings</h1>
      </header>
      <section className="panel settings">
        <div className="settings__intro">
          <h2 className="panel__title">Profile</h2>
          <p className="muted">How your name appears across TradingWave.</p>
        </div>
        <ProfileForm initialName={user.name} email={user.email} />
      </section>
      <section className="panel settings">
        <div className="settings__intro">
          <h2 className="panel__title">Password</h2>
          <p className="muted">Changing it signs you out on every other device.</p>
        </div>
        <PasswordForm />
      </section>
    </div>
  );
}
