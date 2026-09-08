"use client";

import { useEffect, useRef } from "react";
import { ACCEPTED_FILE_TYPES } from "@/lib/attachments";

export function ChatComposer({
  value,
  files,
  disabled,
  onChange,
  onFiles,
  onRemoveFile,
  onSubmit,
}: {
  value: string;
  files: File[];
  disabled: boolean;
  onChange: (value: string) => void;
  onFiles: (files: FileList | null) => void;
  onRemoveFile: (name: string) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        {files.length > 0 ? (
          <ul className="mb-2 flex flex-wrap gap-2">
            {files.map((file) => (
              <li
                key={`${file.name}-${file.size}`}
                className="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-stone-700"
              >
                <span className="max-w-48 truncate">{file.name}</span>
                <button
                  type="button"
                  className="rounded-full px-1 text-stone-400 hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800/20"
                  onClick={() => onRemoveFile(file.name)}
                  aria-label={`Remover ${file.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
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
            disabled={disabled || (!value.trim() && files.length === 0)}
            className="h-10 rounded-xl bg-stone-900 px-4 text-sm font-medium text-white hover:bg-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-stone-300"
          >
            Enviar
          </button>
        </div>
        <p className="mt-2 text-[11px] text-stone-500">
          PDF, TXT, DOCX (até 200 MB) e imagens (até 10 MB). O texto integral
          extraído vai ao modelo — peças longas aumentam o custo. PDF
          escaneado sem texto selecionável falha a extração. Enter envia ·
          Shift+Enter quebra linha.
        </p>
      </div>
    </form>
  );
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
