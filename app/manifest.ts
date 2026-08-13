import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DevGuard AI',
    short_name: 'DevGuard',
    description: 'Autonomous pull request review and security agent for GitHub.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0f19',
    theme_color: '#10b981',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
