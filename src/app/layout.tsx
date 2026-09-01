import "./globals.css";
import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";

/**
 * next/font self-hosts the files, so there is no third-party request on the
 * critical path and no layout shift. Fraunces is a variable font with an optical
 * size axis, which is why the mockup uses it for display type.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fraunces",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TetaPhysio",
  description: "Physiotherapy clinic management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme="light" is the project default; ThemeToggle switches it to dark.
    <html lang="en" data-theme="light" className={`${fraunces.variable} ${spaceGrotesk.variable}`}>
      <head>
        {/* Set the stored theme before first paint, so a dark preference does not
            flash light. Runs before React hydrates; the toggle then keeps
            state in sync. DangerouslySetInnerHTML is the only way to inline a
            blocking script in the App Router. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('tp-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}",
          }}
        />
      </head>
      <body className="font-sans text-ivory antialiased">{children}</body>
    </html>
  );
}
