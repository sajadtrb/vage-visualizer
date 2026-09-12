import './globals.css';
import type {Metadata} from 'next';

export const metadata: Metadata = {title: 'Vage Visualizer', description: 'Create audio-reactive visuals for your next release.'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="fa" dir="rtl"><body>{children}</body></html>; }
