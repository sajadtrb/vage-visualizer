import "./studio/studio.css";
import "./studio/entry.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vage Content Studio",
  description: "Create audio-reactive visuals for every platform.",
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
