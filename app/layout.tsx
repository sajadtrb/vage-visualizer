import "./studio/studio.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vage Visualizer",
  description: "Create audio-reactive visuals for your next release.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <body>{children}</body>
    </html>
  );
}
