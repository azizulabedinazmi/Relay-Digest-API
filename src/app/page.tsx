"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type ImportRecord = { id: string; status: string; attempts: number; item_count: number; last_error: string | null; created_at: string; completed_at: string | null };
const sampleCsv = `email,name\nmaya@example.com,Maya Chen\nsam@example.com,Sam Rivera\nlee@example.com,Lee Morgan`;

export default function Home() {
  const [token, setToken] = useState("");
  const [csvText, setCsvText] = useState(sampleCsv);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [message, setMessage] = useState("Paste a CSV, then queue it for the next worker run.");
  const [loading, setLoading] = useState(false);

  async function loadImports() {
    if (!token) return;
    const response = await fetch("/api/imports", { headers: { Authorization: `Bearer ${token}` } });
    if (response.ok) setImports((await response.json()).imports);
    else setMessage("Access denied. Check the Bearer token configured for this deployment.");
  }

  useEffect(() => {
    if (!token) return;
    const refresh = async () => {
      const response = await fetch("/api/imports", { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) setImports((await response.json()).imports);
    };
    const initial = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [token]);

  async function queueImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage("Queueing import...");
    const response = await fetch("/api/imports", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ csvText, idempotencyKey: `ui-${btoa(csvText).slice(0, 24)}` }) });
    const body = await response.json(); setLoading(false);
    setMessage(response.ok ? `Accepted ${body.importId}. The request is finished; the worker will process it.` : body.message); void loadImports();
  }

  return <main className="shell">
    <header className="topbar"><Link className="brand" href="/">relay<span>/</span>digest</Link><div className="live-pill"><span /> worker online</div></header>
    <section className="hero"><div><p className="eyebrow">Background jobs, without the waiting room</p><h1>Queue the work.<br /><em>Keep the promise.</em></h1><p className="lede">A tiny, durable import service that accepts a CSV now and builds a clean digest behind the scenes.</p></div><div className="hero-note"><strong>202 accepted</strong><span>fast request path</span><strong>idempotent</strong><span>safe to retry</span></div></section>
    <section className="workspace">
      <div className="panel composer"><div className="panel-heading"><div><span className="step">01</span><h2>Queue an import</h2></div><span className="tag">POST /api/imports</span></div><form onSubmit={queueImport}><label htmlFor="token">Access token</label><input id="token" type="password" placeholder="Bearer token from AUTH_TOKEN" value={token} onChange={(event) => setToken(event.target.value)} required /><div className="label-row"><label htmlFor="csv">CSV payload</label><span>email, name</span></div><textarea id="csv" value={csvText} onChange={(event) => setCsvText(event.target.value)} required spellCheck={false} /><button type="submit" disabled={loading || !token}>{loading ? "Sending..." : "Queue import →"}</button></form><p className="form-message">{message}</p></div>
      <div className="panel activity"><div className="panel-heading"><div><span className="step">02</span><h2>Recent runs</h2></div><button className="refresh" onClick={() => void loadImports()} aria-label="Refresh imports">↻</button></div><div className="run-list">{imports.length === 0 ? <div className="empty">Authenticate above to see your import history.</div> : imports.map((item) => <article className="run" key={item.id}><div className={`status-dot ${item.status}`} /><div className="run-copy"><strong>{item.status}</strong><span>{new Date(item.created_at).toLocaleString()}</span>{item.last_error && <small>{item.last_error}</small>}</div><div className="run-count">{item.item_count}<span>items</span></div></article>)}</div><div className="worker-note"><span className="pulse" /><div><strong>Worker handoff</strong><p>Vercel Cron runs nightly at 02:00 UTC. A stale lease is returned to the queue automatically.</p></div></div></div>
    </section>
    <footer><span>relay/digest · durable by design</span><a href="https://devconnectplatform.com/u/azizulabedin?ref=badge">DevConnect profile ↗</a></footer>
  </main>;
}
