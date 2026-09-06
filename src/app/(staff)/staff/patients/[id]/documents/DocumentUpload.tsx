"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FormStatus } from "@/components/FormStatus";
import { IDLE_STATE, actionFailed, type ActionState } from "@/server/action-state";
import type { EpisodeOfCare } from "@/generated/prisma/client";
import { requestDocumentUpload, saveDocument } from "./actions";

const DOCUMENT_TYPES = [
  { value: "referral", label: "Referral" },
  { value: "medical_report", label: "Medical report" },
  { value: "xray", label: "X-ray" },
  { value: "mri", label: "MRI" },
  { value: "other", label: "Other" },
] as const;

const inputClass =
  "min-h-11 rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory placeholder:text-ivory-faint";

/**
 * Direct-to-R2 upload under #documents. The file picker sends metadata only to
 * requestDocumentUpload (never the bytes — posting them would route the file
 * through the server and defeat the presigned PUT), the browser PUTs the bytes
 * straight to R2, and saveDocument records the row with server-side
 * mime/size/enum re-validation. Renders only when the server says storage is
 * configured; otherwise the section shows the not-configured message instead.
 */
export function DocumentUpload({
  patientId,
  openEpisodes,
  maxBytes,
}: {
  patientId: string;
  openEpisodes: EpisodeOfCare[];
  maxBytes: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<ActionState>(IDLE_STATE);
  const [busy, setBusy] = useState(false);
  const maxMB = Math.round(maxBytes / 1024 / 1024);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const form = e.currentTarget;
    const file = fileRef.current?.files?.[0];
    if (!file || file.size === 0) {
      setState(actionFailed("Choose a file to upload."));
      return;
    }
    if (file.size > maxBytes) {
      setState(actionFailed(`That file is larger than ${maxMB}MB.`));
      return;
    }
    const documentType = String(new FormData(form).get("documentType") ?? "other");
    const episodeId = String(new FormData(form).get("episodeId") ?? "");

    setBusy(true);
    try {
      const meta = new FormData();
      meta.set("patientId", patientId);
      meta.set("fileName", file.name);
      meta.set("contentType", file.type || "application/octet-stream");
      meta.set("sizeBytes", String(file.size));
      meta.set("documentType", documentType);
      meta.set("episodeId", episodeId);

      const req = await requestDocumentUpload(IDLE_STATE, meta);
      if (req.ok !== true || !("url" in req)) {
        setState(req);
        return;
      }

      const put = await fetch(req.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) {
        setState(actionFailed("The upload did not complete. Try again."));
        return;
      }

      const row = new FormData();
      row.set("patientId", patientId);
      row.set("key", req.key);
      row.set("fileName", file.name);
      row.set("mimeType", file.type || "application/octet-stream");
      row.set("fileSize", String(file.size));
      row.set("documentType", documentType);
      row.set("episodeId", episodeId);

      const saved = await saveDocument(IDLE_STATE, row);
      setState(saved);
      if (saved.ok === true) {
        form.reset();
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="doc-file" className="text-sm font-medium text-ivory">
          File <span className="font-normal text-ivory-faint">(PDF, JPG or PNG, up to {maxMB}MB)</span>
        </label>
        <input
          id="doc-file"
          ref={fileRef}
          name="file"
          type="file"
          required
          accept="application/pdf,image/jpeg,image/png"
          className="min-h-11 cursor-pointer rounded-md border border-line bg-surface px-3.5 py-2.5 text-base text-ivory file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-3 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ivory"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="doc-type" className="text-sm font-medium text-ivory">
            Document type
          </label>
          <select
            id="doc-type"
            name="documentType"
            defaultValue="other"
            className={`${inputClass} cursor-pointer`}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="doc-episode" className="text-sm font-medium text-ivory">
            Episode
          </label>
          <select
            id="doc-episode"
            name="episodeId"
            defaultValue=""
            className={`${inputClass} cursor-pointer`}
          >
            <option value="">
              {openEpisodes.length > 0
                ? "Automatic — join the current episode"
                : "No episode yet"}
            </option>
            {openEpisodes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.reason}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FormStatus state={state} />

      <div>
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 min-w-11 cursor-pointer rounded-md bg-jade px-4 py-2 text-sm font-semibold text-btn-ink transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Uploading…" : "Upload document"}
        </button>
      </div>
    </form>
  );
}
