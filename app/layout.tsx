import './globals.css';
import type { Metadata } from 'next';
import { BottomNav } from '@/components/nav/BottomNav';
import { NibsLayer } from '@/components/characters/NibsLayer';

export const metadata: Metadata = {
  title: 'LearnTok',
  description: 'Earn your scroll.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <BottomNav />
        <NibsLayer />
      </body>
    </html>
  );
}
