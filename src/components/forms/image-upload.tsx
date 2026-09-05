"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadImageAction } from "@/modules/shared/upload-action";

/**
 * Photo picker for master data.
 *
 * Uploads the chosen file and keeps the resulting URL in a hidden input, so the
 * surrounding form submits a plain string and the server schema stays a simple
 * URL field. A URL can also be pasted directly, for images already hosted
 * elsewhere.
 */
export function ImageUpload({
  name,
  defaultValue,
  label = "Photo",
  hint = "PNG, JPEG, WebP or GIF, up to 2 MB.",
  fallback,
  error,
}: {
  name: string;
  defaultValue?: string | null;
  label?: string;
  hint?: string;
  /** Initials shown when there is no image. */
  fallback: string;
  error?: string;
}) {
  const [url, setUrl] = useState(defaultValue ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    setUploadError(null);
    const formData = new FormData();
    formData.set("file", file);

    startTransition(async () => {
      const result = await uploadImageAction(formData);
      if (result.ok && result.url) setUrl(result.url);
      else setUploadError(result.error ?? "The image could not be uploaded.");
    });
  }

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>

      {/* What the form actually submits. */}
      <input type="hidden" name={name} value={url} />

      <div className="flex items-start gap-3">
        <div className="bg-muted text-muted-foreground flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border text-sm font-semibold">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            fallback
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              aria-label={`Upload ${label.toLowerCase()}`}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) upload(file);
                // Allow re-selecting the same file after a failure.
                event.target.value = "";
              }}
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => inputRef.current?.click()}
            >
              {isPending ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden />
                  Uploading
                </>
              ) : (
                <>
                  <ImagePlus aria-hidden />
                  {url ? "Replace" : "Upload"}
                </>
              )}
            </Button>

            {url ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setUrl("")}>
                <X aria-hidden />
                Remove
              </Button>
            ) : null}
          </div>

          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="or paste an image URL"
            aria-label={`${label} URL`}
          />

          {uploadError ? (
            <p role="alert" className="text-destructive text-xs">
              {uploadError}
            </p>
          ) : hint && !error ? (
            <p className="text-muted-foreground text-xs">{hint}</p>
          ) : null}

          {error ? (
            <p role="alert" className="text-destructive text-xs">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
