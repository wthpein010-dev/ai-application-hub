import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "思维导图快捷工具",
  description: "不用手动摆节点，通过对话完成内容与结构调整，自动排版并导出脑图。",
  metadataBase: new URL("https://planmap.sites.openai.com"),
  openGraph: {
    title: "思维导图快捷工具",
    description: "只管说想法，结构与排版交给 AI。",
    images: [{ url: "/og.png", width: 1792, height: 928, alt: "思维导图快捷工具：脑图 + AI" }],
  },
  twitter: { card: "summary_large_image", title: "思维导图快捷工具", description: "只管说想法，结构与排版交给 AI。", images: ["/og.png"] },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
