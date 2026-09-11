import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "NibbleForms",
  description: "Build, share, and analyze forms — the friendly way.",
};

// Runs before paint so the stored theme never flashes. Must stay inline.
const NO_FLASH = `try{var c=localStorage.getItem("nibbleforms-theme")||"system";var d=c==="dark"||(c!=="light"&&(window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches));document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){ }`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-paper font-body text-ink antialiased dark:bg-night dark:text-inkDark">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
