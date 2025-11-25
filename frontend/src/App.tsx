import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { api } from "./api";
import { Group, Message, ThreadWithMessages } from "./types";
import Settings from "./Settings";

type Status = { kind: "idle" } | { kind: "loading"; label?: string } | { kind: "error"; message: string };

const initialStatus: Status = { kind: "idle" };

function useStatus() {
  const [status, setStatus] = useState<Status>(initialStatus);
  return {
    status,
    setLoading: (label?: string) => setStatus({ kind: "loading", label }),
    setError: (message: string) => setStatus({ kind: "error", message }),
    reset: () => setStatus(initialStatus)
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function App() {
  const { status, setLoading, setError, reset } = useStatus();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [allMail, setAllMail] = useState<Message[]>([]);
  const [thread, setThread] = useState<ThreadWithMessages | null>(null);
  const [newEmail, setNewEmail] = useState({ to: "", subject: "", body: "" });
  const [replyBody, setReplyBody] = useState("");
  const [replyMode, setReplyMode] = useState<"reply" | "reply-all">("reply");
  const [showSettings, setShowSettings] = useState(false);
  const [collapsed, setCollapsed] = useState({
    inbox: false,
    thread: false,
    allMail: false
  });

  useEffect(() => {
    const load = async () => {
      try {
        setLoading("Loading groups...");
        const data = await api.listGroups();
        setGroups(data);
        if (data[0]) {
          setSelectedGroupId(data[0].id);
        }
        reset();
      } catch (err) {
        setError((err as Error).message);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const group = groups.find(g => g.id === selectedGroupId);
    const firstAgent = group?.agents?.[0] ?? "";
    setSelectedAgent(firstAgent);
    setThread(null);
    setMessages([]);
    setAllMail([]);
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) return;
    const load = async () => {
      try {
        setLoading("Loading mail...");
        if (selectedAgent) {
          const data = await api.inboxByAgent(selectedGroupId, selectedAgent);
          setMessages(data);
        } else {
          setMessages([]);
        }
        const groupMail = await api.inboxGroup(selectedGroupId);
        setAllMail(groupMail);
        reset();
      } catch (err) {
        setError((err as Error).message);
      }
    };
    load();
  }, [selectedGroupId, selectedAgent]);

  const agents = useMemo(() => {
    const group = groups.find(g => g.id === selectedGroupId);
    return group?.agents ?? [];
  }, [groups, selectedGroupId]);

  async function handleSelectMessage(msg: Message) {
    try {
      setLoading("Loading thread...");
      const data = await api.thread(msg.threadId);
      setThread(data);
      reset();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSendNew() {
    if (!selectedGroupId) return setError("Select a group first");
    if (!selectedAgent) return setError("Select an agent to send from");
    if (!newEmail.to || !newEmail.body) return setError("To and body are required");
    try {
      setLoading("Sending...");
      await api.writeEmail({
        groupId: selectedGroupId,
        from: selectedAgent,
        to: newEmail.to.split(",").map(t => t.trim()).filter(Boolean),
        subject: newEmail.subject || "No subject",
        body: newEmail.body
      });
      setNewEmail({ to: "", subject: "", body: "" });
      reset();
      if (selectedAgent) {
        const refreshed = await api.inboxByAgent(selectedGroupId, selectedAgent);
        setMessages(refreshed);
      }
      const groupMail = await api.inboxGroup(selectedGroupId);
      setAllMail(groupMail);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleReply(target: "reply" | "reply-all") {
    if (!thread) return;
    const sender = selectedAgent;
    if (!sender) return setError("Select an agent to send from");
    if (!replyBody) return setError("Reply body cannot be empty");
    const payload = {
      threadId: thread.thread.threadId,
      from: sender,
      body: replyBody
    };
    try {
      setLoading("Sending reply...");
      if (target === "reply-all") {
        await api.replyAll(payload);
      } else {
        await api.replyEmail(payload);
      }
      setReplyBody("");
      const updated = await api.thread(thread.thread.threadId);
      setThread(updated);
      const groupMail = await api.inboxGroup(selectedGroupId);
      setAllMail(groupMail);
      reset();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} />;
  }

  return (
    <>
      <div className="app">
        <section className="panel sidebar">
          <h2 className="section-title">Groups</h2>
          <div className="stack grow">
            <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}>
              {groups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.id}
                </option>
              ))}
            </select>
            <div>
              <h3 className="section-title">Agents</h3>
              <div className="list">
                {agents.length === 0 && <div className="muted">No agents</div>}
                {agents.map(agent => (
                  <button
                    key={agent}
                    onClick={() => {
                      setSelectedAgent(agent);
                      setThread(null);
                    }}
                    style={{ background: selectedAgent === agent ? "#000" : undefined, color: selectedAgent === agent ? "#fff" : undefined }}
                  >
                    {agent}
                  </button>
                ))}
              </div>
            </div>
            <div className="sidebar-settings">
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  background: "#4a5568",
                  color: "white",
                  width: "100%",
                  padding: "10px",
                  fontWeight: "600"
                }}
              >
                ⚙️ Settings
              </button>
            </div>
          </div>
        </section>

        <section className="panel thread">
        <div className="section-header">
          <h2 className="section-title">Thread</h2>
          <button className="chip" onClick={() => setCollapsed(c => ({ ...c, thread: !c.thread }))}>
            {collapsed.thread ? "▸" : "▾"}
          </button>
        </div>
        {!collapsed.thread && (
          <>
            {!thread && <div className="muted">Select a message to view its thread.</div>}
            {thread && (
              <div className="stack">
                <div className="muted">Subject: {thread.thread.subject || "(no subject)"}</div>
                <div className="thread">
                  {thread.messages.map(msg => (
                    <div key={msg.messageId} className="message-card">
                      <div className="message-header">
                        <div className="inline">
                          <span className="pill">{msg.messageId}</span>
                          <strong>{msg.from}</strong>
                          <span className="muted">→ {msg.to.join(", ")}</span>
                        </div>
                        <div className="muted">{formatDate(msg.createdAt)}</div>
                      </div>
                      <div className="message-body">{msg.body}</div>
                    </div>
                  ))}
                </div>
                <div className="stack">
                  <h3 className="section-title">Reply</h3>
                  <textarea
                    rows={4}
                    placeholder="Write your reply..."
                    value={replyBody}
                    onChange={e => setReplyBody(e.target.value)}
                  />
                  <div className="inline">
                    <select value={replyMode} onChange={e => setReplyMode(e.target.value as "reply" | "reply-all")}>
                      <option value="reply">Reply</option>
                      <option value="reply-all">Reply-all</option>
                    </select>
                    <button onClick={() => handleReply(replyMode)}>Send</button>
                  </div>
                </div>
              </div>
            )}
            <div className="stack" style={{ marginTop: "12px" }}>
              <h3 className="section-title">New Email</h3>
              <div className="form-grid">
                <input value={selectedAgent || ""} disabled placeholder="From" />
                <input
                  placeholder="To (comma separated)"
                  value={newEmail.to}
                  onChange={e => setNewEmail(prev => ({ ...prev, to: e.target.value }))}
                />
                <input
                  placeholder="Subject"
                  value={newEmail.subject}
                  onChange={e => setNewEmail(prev => ({ ...prev, subject: e.target.value }))}
                />
                <textarea
                  rows={3}
                  placeholder="Body"
                  value={newEmail.body}
                  onChange={e => setNewEmail(prev => ({ ...prev, body: e.target.value }))}
                />
                <button onClick={handleSendNew}>Send Email</button>
              </div>
            </div>
          </>
        )}
      </section>

        <section className="panel inbox">
        <div className="section-header">
          <h2 className="section-title">Inbox ({selectedAgent || "select an agent"})</h2>
          <button className="chip" onClick={() => setCollapsed(c => ({ ...c, inbox: !c.inbox }))}>
            {collapsed.inbox ? "▸" : "▾"}
          </button>
        </div>
        {!collapsed.inbox && (
          <>
            {status.kind === "error" && <div className="muted">Error: {status.message}</div>}
            {status.kind === "loading" && <div className="muted">{status.label || "Loading..."}</div>}
            <div className="list">
              {messages.length === 0 && <div className="muted">No messages</div>}
              {messages.map(msg => (
                <button key={`${msg.threadId}-${msg.messageId}`} onClick={() => handleSelectMessage(msg)}>
                  <div className="inline">
                    <span className="pill">{msg.messageId}</span>
                    <span>{msg.subject || "(no subject)"}</span>
                  </div>
                  <div className="muted">
                    From: {msg.from} · {formatDate(msg.createdAt)}
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </section>

        <section className="panel allmail">
        <div className="section-header">
          <h2 className="section-title">All Mail ({selectedGroupId || "no group"})</h2>
          <button className="chip" onClick={() => setCollapsed(c => ({ ...c, allMail: !c.allMail }))}>
            {collapsed.allMail ? "▸" : "▾"}
          </button>
        </div>
        {!collapsed.allMail && (
          <div className="list">
            {allMail.length === 0 && <div className="muted">No messages</div>}
            {allMail.map(msg => (
              <button key={`${msg.threadId}-${msg.messageId}-all`} onClick={() => handleSelectMessage(msg)}>
                <div className="inline">
                  <span className="pill">{msg.messageId}</span>
                  <span>{msg.subject || "(no subject)"}</span>
                </div>
                <div className="muted">
                  From: {msg.from} → {msg.to.join(", ")} · {formatDate(msg.createdAt)}
                </div>
              </button>
            ))}
          </div>
        )}
        </section>
      </div>
    </>
  );
}
