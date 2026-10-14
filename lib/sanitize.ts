import sanitizeHtml from "sanitize-html";

export function sanitizeText(input: string, maxLength = 2200): string {
  const cleaned = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/\u0000/g, "")
    .trim();

  return cleaned.slice(0, maxLength);
}
