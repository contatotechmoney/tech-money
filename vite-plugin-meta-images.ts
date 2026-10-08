import type { Plugin } from 'vite';
import fs from 'fs';
import path from 'path';

/**
 * Vite plugin that updates og:image and twitter:image meta tags
 * to point to the app's opengraph image with the correct Replit domain.
 */
export function metaImagesPlugin(): Plugin {
  return {
    name: 'vite-plugin-meta-images',
    transformIndexHtml(html) {
      // The server selected the module-specific image. Never replace it with
      // the generic image or embed a development domain in a production build.
      const selected = html.match(/<meta\s+property="og:image"\s+content="(\/opengraph(?:-investments|-finance)?\.(?:png|jpg|jpeg))"/);
      if (!selected || process.env.NODE_ENV === 'production') return html;
      const baseUrl = getDeploymentUrl();
      if (!baseUrl) return html;
      const publicDir = path.resolve(process.cwd(), 'client', 'public');
      if (!fs.existsSync(path.join(publicDir, selected[1].slice(1)))) {
        log('[meta-images] OpenGraph image not found, skipping meta tag updates');
        return html;
      }
      const imageUrl = `${baseUrl}${selected[1]}`;

      log('[meta-images] updating meta image tags to:', imageUrl);

      html = html.replace(/(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")[^"]*"/g, `$1${imageUrl}"`);

      return html;
    },
  };
}

function getDeploymentUrl(): string | null {
  if (process.env.REPLIT_INTERNAL_APP_DOMAIN) {
    const url = `https://${process.env.REPLIT_INTERNAL_APP_DOMAIN}`;
    log('[meta-images] using internal app domain:', url);
    return url;
  }

  if (process.env.REPLIT_DEV_DOMAIN) {
    const url = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    log('[meta-images] using dev domain:', url);
    return url;
  }

  return null;
}

function log(...args: any[]): void {
  if (process.env.NODE_ENV === 'production') {
    console.log(...args);
  }
}
