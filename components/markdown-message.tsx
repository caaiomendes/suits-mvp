"use client";

import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
};

function StreamingCursor() {
  return (
    <span
      className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-amber-800 align-middle"
      aria-hidden="true"
    />
  );
}

export const MarkdownMessage = memo(function MarkdownMessage({
  content,
  variant,
  showCursor = false,
}: {
  content: string;
  variant: "user" | "assistant";
  showCursor?: boolean;
}) {
  if (!content) {
    return showCursor ? <StreamingCursor /> : null;
  }

  return (
    <div>
      <div
        className={
          variant === "user"
            ? "markdown-prose markdown-prose-user"
            : "markdown-prose"
        }
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {content}
        </ReactMarkdown>
      </div>
      {showCursor ? <StreamingCursor /> : null}
    </div>
  );
});
