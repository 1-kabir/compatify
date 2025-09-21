import "./globals.css";
import { Poppins, Playfair_Display } from "next/font/google";
import Script from "next/script";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-poppins",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-playfair",
});

export const metadata = {
  title: "Compatify",
  description: "Baseline Compatibility Reports made easy",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${playfair.variable}`}>
      <head>
        <Script src="https://kit.fontawesome.com/22394b007f.js" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
