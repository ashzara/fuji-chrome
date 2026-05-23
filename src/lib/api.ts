export async function processPhoto(file: File): Promise<Blob> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("/api/process", { method: "POST", body: form });

  if (!res.ok) {
    const msg = await res.text().catch(() => "Unknown error");
    throw new Error(`Processing failed (${res.status}): ${msg}`);
  }

  return res.blob();
}
