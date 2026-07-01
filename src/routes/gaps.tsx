import { createFileRoute } from "@tanstack/react-router";
import { Gaps } from "./signals";

// Alias: /gaps renders the same inbox as /signals. Keeping /signals live
// so any existing links or bookmarks don't break.
export const Route = createFileRoute("/gaps")({
  ssr: false,
  component: Gaps,
});
