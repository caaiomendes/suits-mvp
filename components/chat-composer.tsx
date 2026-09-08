"use client";

import { useEffect, useRef } from "react";
import { ACCEPTED_FILE_TYPES } from "@/lib/attachments";
import type { ComposerAttachment } from "@/lib/composer-attachments";
import { isExtractingStatus } from "@/lib/composer-attachments";
import {
  formatCharCount,
  formatExtractChipStatus,
  formatExtractHeadline,
  formatFileSize,
} from "@/lib/extract-progress";

export function ChatComposer({
  value,
  attachments,
  disabled,
  sendBlocked,
  onChange,
  onFiles,
  onRemoveAttachment,
  onSubmit,
}: {
  value: string;
  attachments: ComposerAttachment[];
  disabled: boolean;
  sendBlocked: boolean;
  onChange: (value: string) => void;
  onFiles: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const extracting = attachments.find((item) => isExtractingStatus(item.status));
  const headline = extracting
    ? formatExtractHeadline(
        {
          phase: extracting.status,
          page: extracting.page,
          pages: extracting.pages,
          chars: extracting.extractedChars,
          error: extracting.error,
        },
        extracting.file.name,
      )
    : null;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) {
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <form
      className="border-t border-stone-200/80 bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="mx-auto max-w-3xl">
        {attachments.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {attachments.map((item) => (
              <li
                key={item.id}
                className={chipClassName(item.status)}
              >
                <span className="min-w-0">
                  <span className="block max-w-56 truncate font-medium text-stone-800">
                    {item.file.name}
                  </span>
                  <span className="block max-w-64 text-[10px] leading-4 text-stone-500">
                    {formatFileSize(item.file.size)}
                    {" · "}
                    {item.status === "ready" && item.payload?.kind === "text"
                      ? `${formatCharCount(item.payload.text.length)} caracteres`
                      : formatExtractChipStatus({
                          phase: item.status,
                          page: item.page,
                          pages: item.pages,
                          chars: item.extractedChars,
                          error: item.error,
                        })}
                  </span>
                </span>
                <button
                  type="button"
                  className="rounded-full px-1 text-stone-400 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800/20"
                  onClick={() => onRemoveAttachment(item.id)}
                  aria-label={`Remover ${item.file.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {headline ? (
          <p
            className="mb-2 text-xs text-amber-900"
            aria-live="polite"
          >
            {headline}
          </p>
        ) : null}
        <div className="flex items-end gap-2 rounded-2xl border border-stone-300 bg-white p-2 shadow-sm focus-within:border-stone-700 focus-within:ring-2 focus-within:ring-stone-800/10">
          <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-stone-500 hover:bg-stone-100 hover:text-stone-800 focus-within:ring-2 focus-within:ring-stone-800/20">
            <span className="sr-only">Anexar arquivo</span>
            <PaperclipIcon />
            <input
              type="file"
              className="hidden"
              multiple
              accept={ACCEPTED_FILE_TYPES}
              disabled={disabled}
              onChange={(event) => {
                onFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <textarea
            ref={textareaRef}
            value={value}
            disabled={disabled}
            rows={1}
            placeholder="Descreva o caso ou cole um trecho da peça…"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm text-stone-900 outline-none placeholder:text-stone-400"
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          <button
            type="submit"
            disabled={disabled || sendBlocked}
            className="h-10 rounded-xl bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            {extracting ? "Preparando…" : "Enviar"}
          </button>
        </div>
        <p className="mt-2 text-[11px] text-stone-500">
          PDF, TXT, DOCX (até 200 MB) e imagens (até 10 MB). A extração começa
          ao anexar; o texto integral vai ao modelo — peças longas aumentam o
          custo. PDF escaneado sem texto selecionável falha a extração. Enter
          envia · Shift+Enter quebra linha.
        </p>
      </div>
    </form>
  );
}

function chipClassName(status: ComposerAttachment["status"]): string {
  const base =
    "flex items-center gap-2 rounded-2xl border px-2.5 py-1 text-xs";
  if (status === "error") {
    return `${base} border-red-200 bg-red-50 text-red-800`;
  }
  if (status === "preparing" || status === "extracting") {
    return `${base} border-amber-200 bg-amber-50 text-stone-700`;
  }
  return `${base} border-stone-200 bg-stone-50 text-stone-700`;
}

function PaperclipIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12.5 12.2 21.3a5 5 0 0 1-7.1-7.1l10-10a3.2 3.2 0 1 1 4.5 4.5l-10 10a1.4 1.4 0 1 1-2-2l9.1-9.1"
      />
    </svg>
  );
}
