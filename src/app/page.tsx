"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

type Tab = "overview" | "clients" | "devices" | "otpRequests" | "smsLogs" | "apiLogs" | "integration" | "admins";
type DataTab = Exclude<Tab, "overview" | "integration">;
type Modal = "client" | "device" | "admin" | null;
type RecordValue = string | number | boolean | null | undefined | Date;
type Item = Record<string, unknown> & { _id: string; status?: string; createdAt?: string };
type Secret =
  | { kind: "value"; title: string; value: string }
  | { kind: "deviceLink"; title: string; value: string; apiUrl: string; clientId: string; clientName: string };
type DashboardData = {
  stats: Record<string, number>;
  admins: Item[];
  clients: Item[];
  devices: Item[];
  otpRequests: Item[];
  smsLogs: Item[];
  apiLogs: Item[];
};

const nav: { id: Tab; label: string; short: string }[] = [
  { id: "overview", label: "Overview", short: "01" },
  { id: "clients", label: "Clients", short: "02" },
  { id: "devices", label: "Devices", short: "03" },
  { id: "otpRequests", label: "SMS requests", short: "04" },
  { id: "smsLogs", label: "SMS logs", short: "05" },
  { id: "apiLogs", label: "Log report", short: "06" },
  { id: "integration", label: "Integration", short: "07" },
  { id: "admins", label: "Administrators", short: "08" },
];

const GATEWAY_URL = "https://smsgateway-seven.vercel.app";

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return String(object.name || object.deviceName || object.email || object._id || "—");
  }
  return String(value);
}

function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function Badge({ value }: { value: unknown }) {
  const label = text(value).toLowerCase();
  return <span className={`badge ${label}`}>{label}</span>;
}

export default function Home() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<DashboardData | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<Modal>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<Secret | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem("relay_admin_token") || "");
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("relay_admin_token");
    setToken("");
    setData(null);
  }, []);

  const api = useCallback(
    async (path: string, options?: RequestInit) => {
      const response = await fetch(path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...options?.headers,
        },
      });
      const body = await response.json();
      if (response.status === 401) logout();
      if (!response.ok) throw new Error(body.error?.message || "Request failed");
      return body;
    },
    [logout, token],
  );

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/admin/manage");
      setData(result.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load dashboard");
    } finally {
      setLoading(false);
    }
  }, [api, token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Login failed");
      localStorage.setItem("relay_admin_token", body.token);
      setToken(body.token);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (modal === "client") {
        const body = {
          name: form.get("name"),
          dailyLimit: Number(form.get("dailyLimit")),
          allowedIps: String(form.get("allowedIps") || "").split("\n").map((v) => v.trim()).filter(Boolean),
        };
        const result = await api("/api/clients/create", { method: "POST", body: JSON.stringify(body) });
        setSecret({ kind: "value", title: "Client API key", value: result.api_key });
      } else if (modal === "device") {
        const result = await api("/api/clients/link", {
          method: "POST",
          body: JSON.stringify({ clientId: form.get("clientId") }),
        });
          setSecret({
            kind: "deviceLink",
            title: "Link device",
            value: result.data.apiKey,
            apiUrl: GATEWAY_URL,
            clientId: result.data.clientId,
            clientName: result.data.clientName,
          });
      } else {
        const body = { kind: "admin", email: form.get("email"), password: form.get("password") };
        await api("/api/admin/manage", { method: "POST", body: JSON.stringify(body) });
      }
      setModal(null);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create record");
    } finally {
      setLoading(false);
    }
  }

  async function changeStatus(kind: "client" | "device", id: string, status: string) {
    setLoading(true);
    try {
      await api("/api/admin/manage", {
        method: "PATCH",
        body: JSON.stringify({ kind, id, status }),
      });
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update status");
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/otp/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${String(form.get("apiKey") || "")}`,
        },
        body: JSON.stringify({
          mobile: form.get("mobile"),
          template: form.get("template"),
          length: Number(form.get("length")),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not send OTP");
      setOtpOpen(false);
      setSecret({
        kind: "value",
        title: "OTP request ID",
        value: body.request_id,
      });
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/messages/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${String(form.get("apiKey") || "")}`,
        },
        body: JSON.stringify({
          mobile: form.get("mobile"),
          message: form.get("message"),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message || "Could not send message");
      setMessageOpen(false);
      setSecret({ kind: "value", title: "SMS request ID", value: body.request_id });
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Could not send message");
    } finally {
      setLoading(false);
    }
  }

  async function rotateClientApiKey(client: Item) {
    if (!window.confirm(`Rotate the API key for ${text(client.name)}? The current key will stop working immediately.`)) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/admin/manage", {
        method: "PATCH",
        body: JSON.stringify({
          kind: "client",
          id: client._id,
          rotateApiKey: true,
        }),
      });
      setSecret({ kind: "value", title: "Client API key", value: result.data.apiKey });
      await load();
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : "Could not rotate API key");
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(() => {
    if (!data || tab === "overview" || tab === "integration") return [];
    const query = search.toLowerCase();
    return data[tab].filter((item) => JSON.stringify(item).toLowerCase().includes(query));
  }, [data, search, tab]);

  if (!token) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand">
            <div className="brand-mark">R</div>
            <div className="brand-copy"><strong>Relay</strong><span>OTP infrastructure</span></div>
          </div>
          <span className="eyebrow">SECURE OPERATIONS CONSOLE</span>
          <h1>Welcome back.</h1>
          <p className="subtitle">Sign in with an administrator account to manage your gateway.</p>
          <form onSubmit={login}>
            <div className="field"><label>Email address</label><input name="email" type="email" required autoComplete="email" /></div>
            <div className="field"><label>Password</label><input name="password" type="password" required minLength={8} autoComplete="current-password" /></div>
            {error && <p className="error">{error}</p>}
            <button className="button primary" disabled={loading}>{loading ? "Signing in..." : "Sign in"}</button>
          </form>
        </section>
      </main>
    );
  }

  const currentLabel = nav.find((item) => item.id === tab)?.label || "Overview";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div className="brand-copy"><strong>Relay</strong><span>OTP infrastructure</span></div>
        </div>
        <nav className="nav">
          {nav.map((item) => (
            <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { setTab(item.id); setSearch(""); }}>
              <span className="mono">{item.short}</span> <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><button className="button small" onClick={logout}>Sign out</button></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div><span className="eyebrow">GATEWAY CONTROL</span><h1>{currentLabel}</h1><p className="subtitle">Monitor traffic and manage access from one place.</p></div>
          <div className="actions">
            <button className="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
            <button className="button primary" onClick={() => { setError(""); setMessageOpen(true); }}>Send message</button>
            <button className="button" onClick={() => { setError(""); setOtpOpen(true); }}>Send OTP</button>
            {(tab === "clients" || tab === "devices" || tab === "admins") && (
              <button className="button" onClick={() => setModal(tab === "devices" ? "device" : tab === "admins" ? "admin" : "client")}>
                + {tab === "devices" ? "Add device" : `Create ${tab === "admins" ? "admin" : "client"}`}
              </button>
            )}
          </div>
        </header>

        {error && <p className="error">{error}</p>}
        {!data ? <section className="panel"><div className="empty">Loading operational data...</div></section> :
          tab === "overview" ? <Overview data={data} setTab={setTab} /> :
          tab === "integration" ? <Integration clients={data.clients} api={api} /> :
          <DataTable tab={tab} items={visible} search={search} setSearch={setSearch} changeStatus={changeStatus} rotateClientApiKey={rotateClientApiKey} loading={loading} />}
      </main>

      {modal && <CreateModal kind={modal} close={() => setModal(null)} create={create} loading={loading} error={error} clients={data?.clients || []} />}
      {otpOpen && <OtpModal close={() => setOtpOpen(false)} send={sendOtp} loading={loading} error={error} />}
      {messageOpen && <MessageModal close={() => setMessageOpen(false)} send={sendMessage} loading={loading} error={error} />}
      {secret && (
        <div className="modal-backdrop">
          {secret.kind === "deviceLink" ? (
            <DeviceLinkModal secret={secret} close={() => setSecret(null)} />
          ) : (
            <section className="modal">
              <span className="eyebrow">DISPLAYED ONCE</span><h2>{secret.title}</h2>
              <p>{secret.title.endsWith("request ID") ? "The SMS command was queued successfully." : "Store this credential securely. It cannot be retrieved from the database later."}</p>
              <div className="secret mono">{secret.value}</div>
              <div className="modal-actions">
                <button className="button" onClick={() => navigator.clipboard.writeText(secret.value)}>Copy</button>
                <button className="button primary" onClick={() => setSecret(null)}>Done</button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function Overview({ data, setTab }: { data: DashboardData; setTab: (tab: Tab) => void }) {
  const stats = [
    ["Clients", data.stats.clients, `${data.stats.activeClients} active`],
    ["Devices", data.stats.devices, `${data.stats.onlineDevices} online now`],
    ["OTP requests", data.stats.otpRequests, `${data.stats.sentOtps} completed`],
    ["Failed OTPs", data.stats.failedOtps, data.stats.failedOtps ? "Needs attention" : "All clear"],
  ];
  return (
    <>
      <section className="stats">
        {stats.map(([label, value, note]) => <article className="stat" key={label}><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></article>)}
      </section>
      <section className="panel">
        <div className="panel-head"><h2>Recent OTP activity</h2><button className="button small" onClick={() => setTab("otpRequests")}>View all</button></div>
        <div className="table-wrap">
          <table><thead><tr><th>Request</th><th>Client</th><th>Mobile</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>{data.otpRequests.slice(0, 8).map((item) => <tr key={item._id}><td className="mono">{text(item.requestId)}</td><td>{text(item.clientId)}</td><td>{text(item.mobile)}</td><td><Badge value={item.status} /></td><td className="muted">{date(item.createdAt)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function DataTable({ tab, items, search, setSearch, changeStatus, rotateClientApiKey, loading }: {
  tab: DataTab; items: Item[]; search: string; setSearch: (value: string) => void;
  changeStatus: (kind: "client" | "device", id: string, status: string) => void;
  rotateClientApiKey: (client: Item) => void;
  loading: boolean;
}) {
  const headers: Record<typeof tab, string[]> = {
    clients: ["Name", "Status", "Daily limit", "Allowed IPs", "Created", "Action"],
    devices: ["Device", "Phone", "Status", "Last seen", "Usage", "Health", "Action"],
    otpRequests: ["Request", "Client", "Device", "Mobile", "Status", "Attempts", "Created"],
    smsLogs: ["Request", "Client", "Device", "Mobile", "Status", "Error", "Created"],
    apiLogs: ["Report name", "Status", "Duration", "IP", "Request", "Response", "Created"],
    admins: ["Email", "Created", "Updated"],
  };
  return (
    <section className="panel">
      <div className="panel-head"><h2>{items.length} records</h2><input className="search" placeholder={`Search ${tab.replace(/([A-Z])/g, " $1").toLowerCase()}...`} value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="table-wrap"><table><thead><tr>{headers[tab].map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{items.length === 0 ? <tr><td className="empty" colSpan={headers[tab].length}>No matching records.</td></tr> :
          items.map((item) => <Row key={item._id} tab={tab} item={item} changeStatus={changeStatus} rotateClientApiKey={rotateClientApiKey} loading={loading} />)}</tbody>
      </table></div>
    </section>
  );
}

function Row({ tab, item, changeStatus, rotateClientApiKey, loading }: { tab: DataTab; item: Item; changeStatus: (kind: "client" | "device", id: string, status: string) => void; rotateClientApiKey: (client: Item) => void; loading: boolean }) {
  if (tab === "clients") return <tr><td><strong>{text(item.name)}</strong></td><td><Badge value={item.status} /></td><td>{text(item.dailyLimit)}</td><td>{Array.isArray(item.allowedIps) && item.allowedIps.length ? item.allowedIps.join(", ") : "Any"}</td><td className="muted">{date(item.createdAt)}</td><td><div className="row-actions"><button disabled={loading} className="button small" onClick={() => rotateClientApiKey(item)}>Rotate key</button><button disabled={loading} className={`button small ${item.status === "active" ? "danger" : ""}`} onClick={() => changeStatus("client", item._id, item.status === "active" ? "blocked" : "active")}>{item.status === "active" ? "Block" : "Activate"}</button></div></td></tr>;
  if (tab === "devices") {
    const health = item.health as Record<string, boolean> | undefined;
    const recentlySeen = Date.now() - new Date(String(item.lastSeen)).getTime() <= 10 * 60 * 1000;
    const ready = item.status === "active" && recentlySeen && health?.smsPermission && health?.simReady;
    return <tr><td><strong>{text(item.deviceName)}</strong><div className="muted">{text(item.androidVersion)}</div></td><td>{text(item.phoneNumber)}</td><td><Badge value={item.status} /></td><td className="muted">{date(item.lastSeen)}</td><td>{text(item.sentToday)} / {text(item.dailyLimit)}</td><td><div className="health"><Badge value={ready ? "ready" : "not ready"} /><span>SMS {health?.smsPermission ? "on" : "off"}</span><span>SIM {health?.simReady ? "ready" : "not ready"}</span><span>Service {health?.foregroundServiceRunning ? "on" : "off"}</span></div></td><td><button disabled={loading} className={`button small ${item.status === "blocked" ? "" : "danger"}`} onClick={() => changeStatus("device", item._id, item.status === "blocked" ? "active" : "blocked")}>{item.status === "blocked" ? "Activate" : "Block"}</button></td></tr>;
  }
  if (tab === "otpRequests") return <tr><td className="mono">{text(item.requestId)}<div className="muted">{text(item.requestType || "otp")}</div></td><td>{text(item.clientId)}</td><td>{text(item.deviceId)}</td><td>{text(item.mobile)}</td><td><Badge value={item.status} /></td><td>{text(item.attempts)}</td><td className="muted">{date(item.createdAt)}</td></tr>;
  if (tab === "smsLogs") return <tr><td className="mono">{text(item.requestId)}</td><td>{text(item.clientId)}</td><td>{text(item.deviceId)}</td><td>{text(item.mobileMasked)}</td><td><Badge value={item.status} /></td><td className="muted">{text(item.error)}</td><td className="muted">{date(item.createdAt)}</td></tr>;
  if (tab === "apiLogs") return <tr><td><strong>{text(item.reportName)}</strong><div className="muted mono">{text(item.method)} {text(item.path)}</div></td><td><span className={`http-status ${Number(item.statusCode) >= 400 ? "failed" : "success"}`}>{text(item.statusCode)}</span><div className="muted">{text(item.errorCode)}</div></td><td>{text(item.durationMs)} ms</td><td className="mono">{text(item.ip)}</td><td><pre className="log-data">{formatLogData(item.requestData)}</pre></td><td><pre className="log-data">{formatLogData(item.responseData)}</pre></td><td className="muted">{date(item.createdAt)}</td></tr>;
  return <tr><td><strong>{text(item.email)}</strong></td><td className="muted">{date(item.createdAt)}</td><td className="muted">{date(item.updatedAt)}</td></tr>;
}

function formatLogData(value: unknown) {
  if (value === null || value === undefined) return "—";
  const result = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return result.length > 900 ? `${result.slice(0, 900)}...` : result;
}

function CreateModal({ kind, close, create, loading, error, clients }: { kind: Exclude<Modal, null>; close: () => void; create: (event: FormEvent<HTMLFormElement>) => void; loading: boolean; error: string; clients: Item[] }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal"><span className="eyebrow">{kind === "device" ? "DEVICE CONNECTION" : `NEW ${kind.toUpperCase()}`}</span><h2>{kind === "device" ? "Add device" : `Create ${kind}`}</h2><p>{kind === "device" ? "Choose the client whose API access should be added to the phone." : "Configure the record below. Required fields are validated by the API."}</p>
      <form onSubmit={create}><div className="form-grid">
        {kind === "client" && <>
          <div className="field full"><label>Client name</label><input name="name" required maxLength={100} /></div>
          <div className="field"><label>Daily OTP limit</label><input name="dailyLimit" type="number" defaultValue="100" min="1" required /></div>
          <div className="field full"><label>Allowed IPs, one per line (optional)</label><textarea name="allowedIps" /></div>
        </>}
        {kind === "admin" && <>
          <div className="field full"><label>Email address</label><input name="email" type="email" required /></div>
          <div className="field full"><label>Password</label><input name="password" type="password" required minLength={8} /></div>
        </>}
        {kind === "device" && <>
          <div className="field full"><label>API URL</label><input name="gatewayUrl" type="url" value={GATEWAY_URL} readOnly /><span className="field-hint">This production URL will be included in the QR code automatically.</span></div>
          <div className="field full"><label>Client</label><select name="clientId" required defaultValue="">
            <option value="" disabled>Select a client</option>
            {clients.filter((client) => client.status === "active").map((client) => (
              <option key={client._id} value={client._id}>{text(client.name)}{client.hasStoredApiKey ? "" : " - rotate key first"}</option>
            ))}
          </select></div>
        </>}
      </div>{error && <p className="error">{error}</p>}<div className="modal-actions"><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={loading}>{loading ? (kind === "device" ? "Preparing..." : "Creating...") : kind === "device" ? "Show QR code" : `Create ${kind}`}</button></div></form>
    </section>
  </div>;
}

function Integration({ clients, api }: { clients: Item[]; api: (path: string, options?: RequestInit) => Promise<Record<string, any>> }) {
  const [clientId, setClientId] = useState("");
  const [curl, setCurl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function generateCurl() {
    if (!clientId) return;
    setLoading(true);
    setError("");
    try {
      const result = await api("/api/clients/link", {
        method: "POST",
        body: JSON.stringify({ clientId }),
      });
      const params = new URLSearchParams({
        key: result.data.apiKey,
        phone: "+919876543210",
        message: "Hello from SMS Gateway",
      });
      setDemoUrl(`${GATEWAY_URL}/api/messages/send?${params.toString()}`);
      setCurl(`curl --get "${GATEWAY_URL}/api/messages/send" \\
  --data-urlencode "key=${result.data.apiKey}" \\
  --data-urlencode "phone=+919876543210" \\
  --data-urlencode "message=Hello from SMS Gateway"`);
    } catch (generateError) {
      setCurl("");
      setDemoUrl("");
      setError(generateError instanceof Error ? generateError.message : "Could not generate integration");
    } finally {
      setLoading(false);
    }
  }

  return <section className="panel integration-panel">
    <div className="panel-head"><div><h2>Send message GET API</h2><p className="panel-description">Send only the client key, phone number, and message.</p></div></div>
    <div className="integration-content">
      <div className="form-grid">
        <div className="field full"><label>API endpoint</label><input value={`${GATEWAY_URL}/api/messages/send`} readOnly /></div>
        <div className="field full"><label>Client</label><select value={clientId} onChange={(event) => { setClientId(event.target.value); setCurl(""); setDemoUrl(""); }} required>
          <option value="">Select a client</option>
          {clients.filter((client) => client.status === "active").map((client) => (
            <option key={client._id} value={client._id}>{text(client.name)}{client.hasStoredApiKey ? "" : " - rotate key first"}</option>
          ))}
        </select></div>
      </div>
      <button className="button primary integration-generate" disabled={!clientId || loading} onClick={() => void generateCurl()}>{loading ? "Generating..." : "Generate cURL"}</button>
      {error && <p className="error">{error}</p>}
      {curl && <>
        <div className="code-head"><span>Demo URL</span><button className="button small" onClick={() => navigator.clipboard.writeText(demoUrl)}>Copy URL</button></div>
        <div className="demo-url"><a href={demoUrl} target="_blank" rel="noreferrer">{demoUrl}</a></div>
        <div className="code-head"><span>cURL</span><button className="button small" onClick={() => navigator.clipboard.writeText(curl)}>Copy cURL</button></div>
        <pre className="code-block"><code>{curl}</code></pre>
        <p className="field-hint">Parameters: key, phone, message. Replace the example phone number and message before sending.</p>
      </>}
    </div>
  </section>;
}

function DeviceLinkModal({ secret, close }: { secret: Extract<Secret, { kind: "deviceLink" }>; close: () => void }) {
  const payload = JSON.stringify({
    version: 1,
    type: "relay_client_link",
    api_url: secret.apiUrl,
    client_id: secret.clientId,
    client_api_key: secret.value,
  });

  return <section className="modal link-device-modal">
    <span className="eyebrow">DISPLAYED ONCE</span>
    <h2>{secret.title}</h2>
    <p>Scan this code from the phone to connect <strong>{secret.clientName}</strong>. Keep it private because it contains the client API key.</p>
    <div className="qr-frame">
      <QRCodeSVG value={payload} size={220} level="M" marginSize={2} />
    </div>
    <div className="link-details">
      <div><span>API URL</span><code>{secret.apiUrl}</code></div>
      <div><span>Client API key</span><code>{secret.value}</code></div>
    </div>
    <div className="modal-actions">
      <button className="button" onClick={() => navigator.clipboard.writeText(secret.apiUrl)}>Copy URL</button>
      <button className="button" onClick={() => navigator.clipboard.writeText(payload)}>Copy link data</button>
      <button className="button primary" onClick={close}>Done</button>
    </div>
  </section>;
}

function OtpModal({ close, send, loading, error }: { close: () => void; send: (event: FormEvent<HTMLFormElement>) => void; loading: boolean; error: string }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal"><span className="eyebrow">TEST DELIVERY</span><h2>Send OTP</h2><p>Enter any OTP message format containing <span className="mono">{"{otp}"}</span>.</p>
      <form onSubmit={send}><div className="form-grid">
        <div className="field full"><label>Client API key</label><input name="apiKey" type="password" required /></div>
        <div className="field"><label>Mobile number</label><input name="mobile" placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}" required /></div>
        <div className="field"><label>OTP length</label><input name="length" type="number" min="4" max="8" defaultValue="6" required /></div>
        <div className="field full"><label>OTP message format</label><textarea name="template" defaultValue="Your verification code is {otp}" required /></div>
      </div>{error && <p className="error">{error}</p>}<div className="modal-actions"><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={loading}>{loading ? "Sending..." : "Send OTP"}</button></div></form>
    </section>
  </div>;
}

function MessageModal({ close, send, loading, error }: { close: () => void; send: (event: FormEvent<HTMLFormElement>) => void; loading: boolean; error: string }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal"><span className="eyebrow">GENERAL SMS</span><h2>Send message</h2><p>Enter any message up to 1,000 characters.</p>
      <form onSubmit={send}><div className="form-grid">
        <div className="field full"><label>Client API key</label><input name="apiKey" type="password" required /></div>
        <div className="field full"><label>Mobile number</label><input name="mobile" placeholder="+919876543210" pattern="\+[1-9][0-9]{7,14}" required /></div>
        <div className="field full"><label>Message</label><textarea name="message" maxLength={1000} placeholder="Happy birthday! Wishing you a wonderful year ahead." required /></div>
      </div>{error && <p className="error">{error}</p>}<div className="modal-actions"><button type="button" className="button" onClick={close}>Cancel</button><button className="button primary" disabled={loading}>{loading ? "Sending..." : "Send message"}</button></div></form>
    </section>
  </div>;
}
