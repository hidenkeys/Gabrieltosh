import { useEffect, useState } from "react";
import { workspaceApi, formatMoney } from "./workspace/api";
export default function Platform() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setData(await workspaceApi("/platform"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <main
      className="mera-platform"
      style={{ maxWidth: 1100, margin: "40px auto", padding: 24 }}
    >
      <a href="/mera">mera. / platform</a>
      <h1 style={{ margin: "24px 0" }}>Platform administration</h1>
      <p>
        Restricted operational access. Merchant funds and Mera revenue remain
        separate.
      </p>
      {error ? (
        <section className="info-box" role="alert">
          <p>{error}</p>
          <button className="secondary" onClick={load}>
            Check access again
          </button>
        </section>
      ) : !data ? (
        <p role="status">Verifying platform access…</p>
      ) : (
        <>
          <section className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Organization</th>
                  <th>Subdomain</th>
                  <th>Subscription</th>
                </tr>
              </thead>
              <tbody>
                {(data.organizations || []).map((org: any) => (
                  <tr key={org.id}>
                    <td>{org.name}</td>
                    <td>{org.slug}</td>
                    <td>{org.subscription?.status || "Not activated"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <h2>Provider readiness</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(data.providers, null, 2)}
          </pre>
          <h2>Commercial policy</h2>
          <p>
            Proposed monthly base: {formatMoney(data.policy?.monthlyPrice || 0)}
            . Live billing requires explicit approved configuration.
          </p>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {JSON.stringify(data.policy, null, 2)}
          </pre>
        </>
      )}
    </main>
  );
}
