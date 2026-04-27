export type MarkdownSidebarContent = {
  kind: "markdown";
  content: string;
};

export type CanvasSidebarContent = {
  kind: "canvas";
  docId: string;
  title?: string;
  entryUrl: string;
  preferredHeight?: number;
  rawText?: string | null;
};

export type ProactivityInboxSidebarContent = {
  kind: "proactivityInbox";
};

export type SidebarContent =
  | MarkdownSidebarContent
  | CanvasSidebarContent
  | ProactivityInboxSidebarContent;
