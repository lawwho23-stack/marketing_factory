"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound } from "lucide-react";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-art">
        <div className="login-window">
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="login-plant" />
        <div className="login-desk" />
        <div className="login-person" />
        <span className="eyebrow">A SMALL OFFICE. BIG IDEAS.</span>
        <h1>
          Good work
          <br />
          starts here.
        </h1>
        <p>
          Your words, your stories, your business.
          <br />A little more organized.
        </p>
      </div>
      <section className="login-form">
        <Link className="brand" href="/">
          <span className="brand-icon">
            m<span>f</span>
          </span>
          marketing factory<span className="version">V1</span>
        </Link>
        <div className="login-content">
          <div className="icon-tile">
            <KeyRound size={22} />
          </div>
          <h2>Welcome back, boss.</h2>
          <p>Your factory is right where you left it.</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              try {
                const response = await fetch("/api/auth/login", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    password: new FormData(e.currentTarget).get("password"),
                  }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error);
                // Cross the login boundary with a fresh document, discarding cached unauthenticated routes.
                window.location.assign(
                  new URL("/", window.location.origin).href,
                );
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Owner password
              <input
                type="password"
                name="password"
                autoComplete="current-password"
                required
                autoFocus
              />
            </label>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? "Opening your office…" : "Enter the factory"}
              <ArrowRight size={17} />
            </button>
          </form>
          <span className="small muted">
            Private workspace · Owner access only
          </span>
        </div>
        <footer>Made for the work only you can do.</footer>
      </section>
    </main>
  );
}
