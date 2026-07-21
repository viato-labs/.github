import type { TicketDraft } from "@/lib/types";
import { draftToMarkdown } from "@/lib/templates/ticket-body";

/** Body suitable for pasting into the Jira description field. */
export function draftDescriptionForPaste(draft: TicketDraft): string {
  const full = draftToMarkdown(draft);
  const withoutTitle = full.replace(/^# .*\n+/, "");
  return withoutTitle.trim();
}

export function draftSummaryForPaste(draft: TicketDraft): string {
  return draft.summary;
}

export function bulkPackMarkdown(drafts: TicketDraft[]): string {
  return drafts
    .map((draft, index) => {
      return [
        `<!-- Ticket ${index + 1} of ${drafts.length} | ${draft.projectKey} | ${draft.issueType} -->`,
        `SUMMARY: ${draft.summary}`,
        "",
        draftDescriptionForPaste(draft),
        "",
        "-----",
        "",
      ].join("\n");
    })
    .join("\n");
}
