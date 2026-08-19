import React from "react";
import { BrandWordmark } from "./BrandLogo";

type Props = { children: React.ReactNode; resetKey?: string };
type State = { err: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { err: null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error("[boundary]", err); }
  componentDidUpdate(prev: Props) {
    // Auto-reset when the route changes — prevents a user from being trapped
    // on the error page after a single page crashes.
    if (prev.resetKey !== this.props.resetKey && this.state.err) {
      this.setState({ err: null });
    }
  }
  goHome = () => {
    this.setState({ err: null });
    try { window.history.replaceState(null, "", "/"); } catch { /* ignore */ }
    window.location.href = "/";
  };
  goBack = () => {
    this.setState({ err: null });
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  };

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center px-6 text-center">
        <BrandWordmark className="text-[26px] mb-6" />
        <div className="surface p-6 max-w-sm w-full">
          <div className="display text-lg font-semibold">Щось пішло не так</div>
          <p className="mt-2 text-xs text-[var(--text-muted)] break-words">
            {this.state.err.message ?? "Невідома помилка"}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={this.goBack}
              className="rounded-xl border border-[var(--line-strong)] py-2.5 text-sm font-semibold"
            >
              Назад
            </button>
            <button
              onClick={this.goHome}
              className="rounded-xl py-2.5 text-sm font-semibold text-[#1A0F00]"
              style={{ background: "var(--grad-active)" }}
            >
              На головну
            </button>
          </div>
        </div>
      </div>
    );
  }
}
