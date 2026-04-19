import './globals.css';
import type { Metadata } from 'next';
import { BottomNav } from '@/components/nav/BottomNav';
import { NibsBall } from '@/components/characters/NibsBall';

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
        <NibsBall />
      </body>
    </html>
  );
}
