import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LearnTok',
  description: 'Earn your scroll.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
