import { supabase } from "@/integrations/supabase/client";

export type ChatMsg = { role: "user" | "assistant"; content: string; tools?: ToolEvent[] };
export type ToolEvent = { name: string; args?: Record<string, unknown>; ok?: boolean; status: "running" | "done" | "error" };

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "tool_use"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; ok: boolean }
  | { type: "done" }
  | { type: "error"; message: string };

export async function streamAssistant(
  messages: ChatMsg[],
  onEvent: (ev: StreamEvent) => void,
): Promise<void> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`;
  const { data: sess } = await supabase.auth.getSession();
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sess.session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ messages: messages.map(({ role, content }) => ({ role, content })) }),
  });

  if (!resp.ok || !resp.body) {
    let msg = "AI помилка";
    try { msg = (await resp.json()).error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data) as StreamEvent;
        onEvent(ev);
      } catch { /* partial */ }
    }
  }
}
