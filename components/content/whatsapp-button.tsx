import { supportWhatsAppUrl } from "@/lib/support";
import { mkt } from "@/components/marketing/tokens";

export function WhatsAppSupportButton({ context }: { context?: string }) {
  return (
    <a
      href={supportWhatsAppUrl(context ? `Hi Syncit team, I need help with: ${context}` : undefined)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-base font-semibold text-white"
      style={{ backgroundColor: mkt.teal }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-4.3 3.4A.5.5 0 0 1 4 20V5a1 1 0 0 1 0-1z" />
      </svg>
      WhatsApp us
    </a>
  );
}
