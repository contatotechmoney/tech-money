/** Presentation only. Never participates in authentication or navigation. */
export function applyBrandMetadata(html: string, hostname: string, requestPath = "/", origin?: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  let pathname = requestPath.split(/[?#]/)[0];
  try {
    const requested = new URL(requestPath, "https://local.invalid").searchParams.get("redirect");
    if (requested?.startsWith("/") && !requested.startsWith("//")
      && !/[\\\u0000-\u0020\u007f]/.test(requested)) {
      const target = new URL(requested, "https://local.invalid");
      if (target.origin === "https://local.invalid" && !/^\/(?:sign-in|sign-up)(?:\/|$)/.test(target.pathname)) {
        pathname = target.pathname;
      }
    }
  } catch {
    // Invalid requests still render the neutral identity; metadata never controls routing.
    pathname = "/";
  }
  const investments = /^\/(?:investments|comites)(?:\/|$)/.test(pathname)
    || (!/^\/(?:dashboard|reports|credits|balance-sheet|settings)(?:\/|$)/.test(pathname)
      && host === "invest.techmoney.com.br");
  const finance = !investments && (host === "finance.techmoney.com.br"
    || /^\/(?:dashboard|reports|credits|balance-sheet|settings)(?:\/|$)/.test(pathname));
  const area = investments ? "Investimentos" : finance ? "Finance" : "";
  const title = area ? `Tech Money — ${area}` : "Tech Money";
  const imagePath = investments ? "/opengraph-investments.jpg"
    : finance ? "/opengraph-finance.jpg" : "/opengraph.jpg";
  const image = origin && /^https:\/\/(?:invest|finance)\.techmoney\.com\.br$/.test(origin)
    ? `${origin}${imagePath}` : imagePath;
  const output = html.replace(/(<meta\s+(?:property|name)="(?:og:title|twitter:title)"\s+content=")[^"]*"/g, `$1${title}"`)
    .replace(/(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")[^"]*"/g, `$1${image}"`);
  return output.includes("<title>") ? output.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    : output.replace("</head>", `<title>${title}</title></head>`);
}
